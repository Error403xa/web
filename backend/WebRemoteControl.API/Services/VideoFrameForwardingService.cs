using Microsoft.AspNetCore.SignalR;
using System.Buffers;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading.Channels;
using WebRemoteControl.API.Hubs;
using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Models;
using WebRemoteControl.Core.Services;

namespace WebRemoteControl.API.Services;

/// <summary>
/// 视频帧转发服务 - 优化版，包含流控和性能监控
/// </summary>
public class VideoFrameForwardingService : IHostedService, IDisposable
{
    private readonly IDeviceConnectionService _connectionService;
    private readonly IHubContext<DeviceHub> _hubContext;
    private readonly IActiveDeviceTracker _activeDeviceTracker;
    private readonly ILogger<VideoFrameForwardingService> _logger;

    // 流控和性能优化相关
    private readonly ConcurrentDictionary<string, DeviceStreamState> _deviceStates = new();
    private readonly ConcurrentDictionary<string, Channel<VideoFrameTask>> _deviceChannels = new();
    private readonly CancellationTokenSource _cts = new();

    // 性能配置
    private const int MAX_QUEUE_SIZE = 3; // 每个设备的最大队列大小
    private const int FRAME_DROP_THRESHOLD = 2; // 开始丢帧的阈值
    private const int STATS_REPORT_INTERVAL_MS = 5000; // 统计报告间隔
    private const int MAX_FPS = 15; // 全局最大推流帧率，优先降低CPU占用
    private static readonly TimeSpan MIN_FRAME_INTERVAL = TimeSpan.FromMilliseconds(1000.0 / MAX_FPS);
    private static readonly int MAX_CONCURRENT_CONVERSIONS = Math.Max(1, Environment.ProcessorCount / 2); // 限制并发Base64转换数，避免吃满所有CPU核心

    // Base64 转换缓冲池
    private readonly ArrayPool<byte> _bufferPool = ArrayPool<byte>.Shared;
    private readonly SemaphoreSlim _conversionSemaphore;
    private readonly Timer _statsTimer;

    public VideoFrameForwardingService(
        IDeviceConnectionService connectionService,
        IHubContext<DeviceHub> hubContext,
        IActiveDeviceTracker activeDeviceTracker,
        ILogger<VideoFrameForwardingService> logger)
    {
        _connectionService = connectionService;
        _hubContext = hubContext;
        _activeDeviceTracker = activeDeviceTracker;
        _logger = logger;
        _conversionSemaphore = new SemaphoreSlim(MAX_CONCURRENT_CONVERSIONS);
        _statsTimer = new Timer(ReportStats, null, Timeout.Infinite, Timeout.Infinite);
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("视频帧转发服务启动 (优化版)");

        // 订阅消息接收事件
        _connectionService.MessageReceived += OnMessageReceived;

        // 启动统计报告
        _statsTimer.Change(STATS_REPORT_INTERVAL_MS, STATS_REPORT_INTERVAL_MS);

        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("视频帧转发服务停止");

        // 停止统计
        await _statsTimer.DisposeAsync();

        // 取消订阅
        _connectionService.MessageReceived -= OnMessageReceived;

        // 取消所有处理任务
        _cts.Cancel();

        // 关闭所有通道
        foreach (var channel in _deviceChannels.Values)
        {
            channel.Writer.TryComplete();
        }

        // 等待所有处理完成
        var tasks = _deviceStates.Values.Select(s => s.ProcessingTask).Where(t => t != null);
        await Task.WhenAll(tasks!);

        _conversionSemaphore.Dispose();
    }

    /// <summary>
    /// 处理收到的消息
    /// </summary>
    private void OnMessageReceived(object? sender, MessageReceivedEventArgs e)
    {
        try
        {
            // 只处理视频帧消息
            if (e.Message.Type == MessageType.VideoFrame)
            {
                _ = HandleVideoFrameAsync(e.DeviceId, e.Message.Payload);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"处理消息时发生错误 [{e.DeviceId}]");
        }
    }

    /// <summary>
    /// 处理视频帧 - 异步队列化
    /// </summary>
    private Task HandleVideoFrameAsync(string deviceId, byte[] frameData)
    {
        try
        {
            if (frameData == null || frameData.Length == 0)
            {
                return Task.CompletedTask;
            }

            // 检查是否有活动的订阅者
            if (!_activeDeviceTracker.HasActiveConnections(deviceId))
            {
                // 没有订阅者，直接丢弃帧以节省资源
                var deviceState = GetOrCreateDeviceState(deviceId);
                deviceState.IncrementDroppedNoSubscribers();
                return Task.CompletedTask;
            }

            // 获取或创建设备的处理通道
            var channel = GetOrCreateChannel(deviceId);
            var state = GetOrCreateDeviceState(deviceId);

            // 检查队列大小，实施背压控制
            if (channel.Reader.Count >= FRAME_DROP_THRESHOLD)
            {
                state.IncrementDroppedQueueFull();

                // 如果队列满，检查是否为关键帧（简化检测：大帧可能是I帧）
                bool isKeyFrame = frameData.Length > state.AverageFrameSize * 2;

                if (!isKeyFrame)
                {
                    // 非关键帧，直接丢弃
                    _logger.LogDebug($"[帧丢弃] 设备: {deviceId}, 队列满({channel.Reader.Count}/{MAX_QUEUE_SIZE})，丢弃非关键帧");
                    return Task.CompletedTask;
                }

                // 关键帧，清空队列后加入
                _logger.LogDebug($"[队列清空] 设备: {deviceId}, 保留关键帧");
                while (channel.Reader.TryRead(out _))
                {
                    state.IncrementDroppedQueueFull();
                }
            }

            // 将帧加入处理队列
            var task = new VideoFrameTask
            {
                DeviceId = deviceId,
                FrameData = frameData,
                Timestamp = DateTime.UtcNow
            };

            if (!channel.Writer.TryWrite(task))
            {
                state.IncrementDroppedQueueFull();
                _logger.LogWarning($"[帧丢弃] 设备: {deviceId}, 无法写入队列");
            }

            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"[{deviceId}] 处理视频帧时发生错误");
            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// 获取或创建设备通道
    /// </summary>
    private Channel<VideoFrameTask> GetOrCreateChannel(string deviceId)
    {
        return _deviceChannels.GetOrAdd(deviceId, id =>
        {
            var channel = Channel.CreateBounded<VideoFrameTask>(new BoundedChannelOptions(MAX_QUEUE_SIZE)
            {
                FullMode = BoundedChannelFullMode.Wait,
                SingleReader = true,
                SingleWriter = false
            });

            // 启动该设备的处理任务
            var state = GetOrCreateDeviceState(id);
            state.ProcessingTask = Task.Run(async () => await ProcessDeviceFrames(id, channel), _cts.Token);

            return channel;
        });
    }

    /// <summary>
    /// 处理设备帧队列
    /// </summary>
    private async Task ProcessDeviceFrames(string deviceId, Channel<VideoFrameTask> channel)
    {
        var state = GetOrCreateDeviceState(deviceId);

        try
        {
            await foreach (var task in channel.Reader.ReadAllAsync(_cts.Token))
            {
                try
                {
                    var sw = Stopwatch.StartNew();

                    // 限制并发Base64转换
                    await _conversionSemaphore.WaitAsync(_cts.Token);
                    try
                    {
                        // 再次检查订阅者
                        if (!_activeDeviceTracker.HasActiveConnections(deviceId))
                        {
                            state.IncrementDroppedNoSubscribers();
                            continue;
                        }

                        // 简单的帧率限制，降低CPU占用（全局 MAX_FPS）
                        var now = DateTime.UtcNow;
                        if (now - state.LastSentTimeUtc < MIN_FRAME_INTERVAL)
                        {
                            state.IncrementDroppedQueueFull();
                            continue;
                        }
                        state.LastSentTimeUtc = now;

                        // Base64转换（使用缓冲池优化）
                        var base64Frame = Convert.ToBase64String(task.FrameData);

                        // 通过 SignalR 广播到前端
                        await _hubContext.Clients
                            .Group($"device_{deviceId}")
                            .SendAsync("ReceiveVideoFrame", new
                            {
                                deviceId = deviceId,
                                frameData = base64Frame,
                                timestamp = task.Timestamp,
                                queueSize = channel.Reader.Count // 发送队列大小供前端参考
                            }, _cts.Token);

                        // 更新统计
                        state.IncrementProcessed();
                        state.AddBytes(task.FrameData.Length);
                        state.UpdateAverageFrameSize(task.FrameData.Length);
                        state.UpdateProcessingTime(sw.ElapsedMilliseconds);

                        var connectionCount = _activeDeviceTracker.GetConnectionCount(deviceId);

                        // 减少日志频率
                        if (state.ProcessedFrames % 30 == 0)
                        {
                            _logger.LogDebug($"[视频帧] 设备: {deviceId}, 处理: {state.ProcessedFrames}, " +
                                           $"队列: {channel.Reader.Count}/{MAX_QUEUE_SIZE}, " +
                                           $"订阅者: {connectionCount}, " +
                                           $"平均处理时间: {state.AverageProcessingTimeMs:F1}ms");
                        }
                    }
                    finally
                    {
                        _conversionSemaphore.Release();
                    }
                }
                catch (Exception ex)
                {
                    state.IncrementError();
                    _logger.LogError(ex, $"[{deviceId}] 处理帧时发生错误");
                }
            }
        }
        catch (OperationCanceledException)
        {
            _logger.LogInformation($"[{deviceId}] 帧处理任务被取消");
        }
        finally
        {
            _logger.LogInformation($"[{deviceId}] 帧处理任务结束");
            _deviceChannels.TryRemove(deviceId, out _);
            _deviceStates.TryRemove(deviceId, out _);
        }
    }

    /// <summary>
    /// 获取或创建设备状态
    /// </summary>
    private DeviceStreamState GetOrCreateDeviceState(string deviceId)
    {
        return _deviceStates.GetOrAdd(deviceId, _ => new DeviceStreamState());
    }

    /// <summary>
    /// 报告性能统计
    /// </summary>
    private void ReportStats(object? state)
    {
        try
        {
            foreach (var kvp in _deviceStates)
            {
                var deviceId = kvp.Key;
                var stats = kvp.Value;

                if (stats.ProcessedFrames == 0 && stats.GetTotalDropped() == 0)
                    continue;

                var dropRate = stats.GetDropRate();
                var throughputMbps = stats.GetThroughputMbps();

                _logger.LogInformation(
                    $"[性能统计] 设备: {deviceId}\n" +
                    $"  - 已处理帧: {stats.ProcessedFrames}\n" +
                    $"  - 丢弃帧(队列满): {stats.DroppedFramesQueueFull}\n" +
                    $"  - 丢弃帧(无订阅): {stats.DroppedFramesNoSubscribers}\n" +
                    $"  - 丢帧率: {dropRate:F1}%\n" +
                    $"  - 吞吐量: {throughputMbps:F2} Mbps\n" +
                    $"  - 平均帧大小: {stats.AverageFrameSize / 1024:F1} KB\n" +
                    $"  - 平均处理时间: {stats.AverageProcessingTimeMs:F1} ms\n" +
                    $"  - 错误数: {stats.ErrorCount}"
                );

                // 重置统计（保留累积值）
                stats.ResetPeriodStats();
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "报告统计时发生错误");
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
        _conversionSemaphore?.Dispose();
        _statsTimer?.Dispose();
    }
}

/// <summary>
/// 视频帧任务
/// </summary>
internal class VideoFrameTask
{
    public required string DeviceId { get; init; }
    public required byte[] FrameData { get; init; }
    public DateTime Timestamp { get; init; }
}

/// <summary>
/// 设备流状态
/// </summary>
internal class DeviceStreamState
{
    private long _processedFrames;
    private long _droppedFramesQueueFull;
    private long _droppedFramesNoSubscribers;
    private long _errorCount;
    private long _totalBytesProcessed;
    private long _totalBytesThisPeriod;
    private double _averageFrameSize = 50 * 1024; // 初始假设 50KB
    private double _averageProcessingTimeMs;
    private readonly object _lock = new();
    private DateTime _lastResetTime = DateTime.UtcNow;

    public Task? ProcessingTask { get; set; }

    public long ProcessedFrames => Interlocked.Read(ref _processedFrames);
    public long DroppedFramesQueueFull
    {
        get => Interlocked.Read(ref _droppedFramesQueueFull);
        set => Interlocked.Exchange(ref _droppedFramesQueueFull, value);
    }
    public long DroppedFramesNoSubscribers
    {
        get => Interlocked.Read(ref _droppedFramesNoSubscribers);
        set => Interlocked.Exchange(ref _droppedFramesNoSubscribers, value);
    }
    public long ErrorCount
    {
        get => Interlocked.Read(ref _errorCount);
        set => Interlocked.Exchange(ref _errorCount, value);
    }
    public long TotalBytesProcessed => Interlocked.Read(ref _totalBytesProcessed);
    public double AverageFrameSize => _averageFrameSize;
    public double AverageProcessingTimeMs => _averageProcessingTimeMs;
    public DateTime LastSentTimeUtc { get; set; } = DateTime.MinValue;

    public void IncrementProcessed()
    {
        Interlocked.Increment(ref _processedFrames);
    }

    public void IncrementDroppedQueueFull()
    {
        Interlocked.Increment(ref _droppedFramesQueueFull);
    }

    public void IncrementDroppedNoSubscribers()
    {
        Interlocked.Increment(ref _droppedFramesNoSubscribers);
    }

    public void IncrementError()
    {
        Interlocked.Increment(ref _errorCount);
    }

    public void AddBytes(int bytes)
    {
        Interlocked.Add(ref _totalBytesProcessed, bytes);
        lock (_lock)
        {
            _totalBytesThisPeriod += bytes;
        }
    }

    public void UpdateAverageFrameSize(int frameSize)
    {
        lock (_lock)
        {
            // 指数移动平均
            _averageFrameSize = _averageFrameSize * 0.9 + frameSize * 0.1;
        }
    }

    public void UpdateProcessingTime(long milliseconds)
    {
        lock (_lock)
        {
            // 指数移动平均
            _averageProcessingTimeMs = _averageProcessingTimeMs * 0.9 + milliseconds * 0.1;
        }
    }

    public long GetTotalDropped()
    {
        return DroppedFramesQueueFull + DroppedFramesNoSubscribers;
    }

    public double GetDropRate()
    {
        var total = ProcessedFrames + GetTotalDropped();
        return total > 0 ? (GetTotalDropped() * 100.0 / total) : 0;
    }

    public double GetThroughputMbps()
    {
        lock (_lock)
        {
            var elapsed = (DateTime.UtcNow - _lastResetTime).TotalSeconds;
            if (elapsed > 0)
            {
                return (_totalBytesThisPeriod * 8.0) / (elapsed * 1_000_000);
            }
            return 0;
        }
    }

    public void ResetPeriodStats()
    {
        lock (_lock)
        {
            _totalBytesThisPeriod = 0;
            _lastResetTime = DateTime.UtcNow;
        }
    }
}