using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using WebRemoteControl.API.Hubs;
using WebRemoteControl.Core.Models;

namespace WebRemoteControl.API.Services;

/// <summary>
/// 屏幕阅读器帧管理服务
/// 实现队列限制、超时、降级策略
/// </summary>
public class ScreenReaderFrameService : IDisposable
{
    private readonly IHubContext<DeviceHub> _hubContext;
    private readonly ILogger<ScreenReaderFrameService> _logger;
    private readonly IConfiguration _configuration;

    // 每个设备的帧队列
    private readonly ConcurrentDictionary<string, FrameQueue> _deviceQueues;

    // 性能统计
    private readonly ConcurrentDictionary<string, FrameStatistics> _deviceStatistics;

    // 处理线程
    private readonly Timer _processTimer;
    private bool _disposed;

    public ScreenReaderFrameService(
        IHubContext<DeviceHub> hubContext,
        ILogger<ScreenReaderFrameService> logger,
        IConfiguration configuration)
    {
        _hubContext = hubContext;
        _logger = logger;
        _configuration = configuration;

        _deviceQueues = new ConcurrentDictionary<string, FrameQueue>();
        _deviceStatistics = new ConcurrentDictionary<string, FrameStatistics>();

        // 启动处理定时器，每50ms处理一次队列
        _processTimer = new Timer(ProcessQueues, null, TimeSpan.Zero, TimeSpan.FromMilliseconds(50));
    }

    /// <summary>
    /// 添加帧到队列
    /// </summary>
    public void EnqueueFrame(string deviceId, ReaderFrame frame)
    {
        var queue = _deviceQueues.GetOrAdd(deviceId, _ => new FrameQueue
        {
            DeviceId = deviceId,
            MaxSize = _configuration.GetValue<int>("ScreenReader:MaxQueueSize", 10),
            MaxLatency = _configuration.GetValue<int>("ScreenReader:MaxLatency", 1000),
            DropThreshold = _configuration.GetValue<int>("ScreenReader:DropThreshold", 5)
        });

        var stats = _deviceStatistics.GetOrAdd(deviceId, _ => new FrameStatistics());

        // 检查队列大小
        if (queue.Frames.Count >= queue.MaxSize)
        {
            // 队列满，丢弃最旧的帧
            if (queue.Frames.TryDequeue(out var droppedFrame))
            {
                stats.DroppedFrames++;
                _logger.LogWarning($"[ScreenReader] 设备 {deviceId} 队列满，丢弃旧帧");
            }
        }

        // 添加新帧
        frame.EnqueueTime = DateTimeOffset.UtcNow;
        queue.Frames.Enqueue(frame);
        stats.TotalFrames++;

        // 更新最后接收时间
        queue.LastReceiveTime = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// 处理所有设备的队列
    /// </summary>
    private async void ProcessQueues(object? state)
    {
        var tasks = new List<Task>();

        foreach (var kvp in _deviceQueues)
        {
            var deviceId = kvp.Key;
            var queue = kvp.Value;

            // 跳过空队列
            if (queue.Frames.IsEmpty)
                continue;

            // 异步处理每个设备的队列
            tasks.Add(ProcessDeviceQueue(deviceId, queue));
        }

        if (tasks.Count > 0)
        {
            try
            {
                await Task.WhenAll(tasks);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[ScreenReader] 处理队列时出错");
            }
        }

        // 清理不活跃的队列（超过30秒没有数据）
        CleanupInactiveQueues();
    }

    /// <summary>
    /// 处理单个设备的队列
    /// </summary>
    private async Task ProcessDeviceQueue(string deviceId, FrameQueue queue)
    {
        var stats = _deviceStatistics.GetOrAdd(deviceId, _ => new FrameStatistics());
        var now = DateTimeOffset.UtcNow;

        // 批量处理，最多处理3帧
        var processCount = 0;
        var processedFrames = new List<ReaderFrame>();

        while (processCount < 3 && queue.Frames.TryPeek(out var frame))
        {
            // 检查帧延迟
            var latency = (now - frame.EnqueueTime).TotalMilliseconds;

            if (latency > queue.MaxLatency)
            {
                // 帧太旧，丢弃
                if (queue.Frames.TryDequeue(out _))
                {
                    stats.DroppedFrames++;
                    _logger.LogDebug($"[ScreenReader] 设备 {deviceId} 丢弃延迟帧，延迟: {latency:F0}ms");
                }

                // 如果队列太长，执行降级策略
                if (queue.Frames.Count > queue.DropThreshold)
                {
                    PerformDegradation(queue, stats);
                }

                continue;
            }

            // 帧有效，准备处理
            if (queue.Frames.TryDequeue(out frame))
            {
                processedFrames.Add(frame);
                processCount++;

                // 更新统计
                stats.ProcessedFrames++;
                stats.TotalLatency += latency;
                stats.LastProcessTime = now;

                // 计算处理速率
                UpdateProcessingRate(stats, now);
            }
        }

        // 发送处理的帧
        if (processedFrames.Count > 0)
        {
            await SendFramesToClient(deviceId, processedFrames, stats);
        }

        // 定期输出性能日志
        if ((now - stats.LastLogTime).TotalSeconds > 10)
        {
            LogPerformanceMetrics(deviceId, stats);
            stats.LastLogTime = now;
        }
    }

    /// <summary>
    /// 执行降级策略
    /// </summary>
    private void PerformDegradation(FrameQueue queue, FrameStatistics stats)
    {
        var dropCount = queue.Frames.Count / 2; // 丢弃一半的帧

        for (int i = 0; i < dropCount; i++)
        {
            if (queue.Frames.TryDequeue(out _))
            {
                stats.DroppedFrames++;
            }
        }

        _logger.LogWarning($"[ScreenReader] 设备 {queue.DeviceId} 执行降级策略，丢弃 {dropCount} 帧");
    }

    /// <summary>
    /// 发送帧到客户端
    /// </summary>
    private async Task SendFramesToClient(string deviceId, List<ReaderFrame> frames, FrameStatistics stats)
    {
        try
        {
            // 只发送最新的帧（可选：合并多帧数据）
            var latestFrame = frames.Last();

            await _hubContext.Clients.Group($"device_{deviceId}")
                .SendAsync("ReceiveReaderFrame", new
                {
                    deviceId,
                    uiData = latestFrame.UIData,
                    timestamp = latestFrame.Timestamp,
                    frameNumber = stats.ProcessedFrames,
                    droppedCount = stats.DroppedFrames,
                    avgLatency = stats.ProcessedFrames > 0 ? stats.TotalLatency / stats.ProcessedFrames : 0,
                    fps = stats.CurrentFPS
                });

            stats.SentFrames += frames.Count;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"[ScreenReader] 发送帧到客户端失败: {deviceId}");
        }
    }

    /// <summary>
    /// 更新处理速率
    /// </summary>
    private void UpdateProcessingRate(FrameStatistics stats, DateTimeOffset now)
    {
        if (stats.LastFPSCalculation != default)
        {
            var timeDiff = (now - stats.LastFPSCalculation).TotalSeconds;
            if (timeDiff > 0)
            {
                stats.CurrentFPS = 1.0 / timeDiff;
            }
        }

        stats.LastFPSCalculation = now;
    }

    /// <summary>
    /// 清理不活跃的队列
    /// </summary>
    private void CleanupInactiveQueues()
    {
        var now = DateTimeOffset.UtcNow;
        var inactiveTimeout = TimeSpan.FromSeconds(30);

        foreach (var kvp in _deviceQueues)
        {
            if ((now - kvp.Value.LastReceiveTime) > inactiveTimeout)
            {
                if (_deviceQueues.TryRemove(kvp.Key, out var queue))
                {
                    _logger.LogInformation($"[ScreenReader] 清理不活跃队列: {kvp.Key}");

                    // 清空队列
                    while (queue.Frames.TryDequeue(out _))
                    {
                        // 清空
                    }

                    // 移除统计信息
                    _deviceStatistics.TryRemove(kvp.Key, out _);
                }
            }
        }
    }

    /// <summary>
    /// 记录性能指标
    /// </summary>
    private void LogPerformanceMetrics(string deviceId, FrameStatistics stats)
    {
        var avgLatency = stats.ProcessedFrames > 0 ? stats.TotalLatency / stats.ProcessedFrames : 0;
        var dropRate = stats.TotalFrames > 0 ? (double)stats.DroppedFrames / stats.TotalFrames * 100 : 0;

        _logger.LogInformation($"[ScreenReader Performance] 设备: {deviceId}, " +
            $"总帧数: {stats.TotalFrames}, " +
            $"处理帧数: {stats.ProcessedFrames}, " +
            $"丢帧数: {stats.DroppedFrames} ({dropRate:F1}%), " +
            $"发送帧数: {stats.SentFrames}, " +
            $"平均延迟: {avgLatency:F0}ms, " +
            $"FPS: {stats.CurrentFPS:F1}");
    }

    /// <summary>
    /// 获取设备统计信息
    /// </summary>
    public FrameStatistics? GetDeviceStatistics(string deviceId)
    {
        return _deviceStatistics.TryGetValue(deviceId, out var stats) ? stats : null;
    }

    /// <summary>
    /// 重置设备统计信息
    /// </summary>
    public void ResetDeviceStatistics(string deviceId)
    {
        if (_deviceStatistics.TryGetValue(deviceId, out var stats))
        {
            stats.Reset();
            _logger.LogInformation($"[ScreenReader] 重置设备 {deviceId} 的统计信息");
        }
    }

    /// <summary>
    /// 停止设备的屏幕阅读器
    /// </summary>
    public void StopDevice(string deviceId)
    {
        // 移除队列
        if (_deviceQueues.TryRemove(deviceId, out var queue))
        {
            // 清空队列
            while (queue.Frames.TryDequeue(out _))
            {
                // 清空
            }

            _logger.LogInformation($"[ScreenReader] 停止设备 {deviceId} 的屏幕阅读器队列");
        }

        // 移除统计信息
        _deviceStatistics.TryRemove(deviceId, out _);
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _processTimer?.Dispose();

            // 清理所有队列
            foreach (var queue in _deviceQueues.Values)
            {
                while (queue.Frames.TryDequeue(out _))
                {
                    // 清空
                }
            }

            _deviceQueues.Clear();
            _deviceStatistics.Clear();

            _disposed = true;
        }
    }
}

/// <summary>
/// 帧队列
/// </summary>
public class FrameQueue
{
    public string DeviceId { get; set; } = string.Empty;
    public ConcurrentQueue<ReaderFrame> Frames { get; set; } = new();
    public DateTimeOffset LastReceiveTime { get; set; } = DateTimeOffset.UtcNow;
    public int MaxSize { get; set; } = 10;
    public int MaxLatency { get; set; } = 1000; // 毫秒
    public int DropThreshold { get; set; } = 5;
}

/// <summary>
/// 阅读器帧
/// </summary>
public class ReaderFrame
{
    public string UIData { get; set; } = string.Empty;
    public DateTimeOffset Timestamp { get; set; }
    public DateTimeOffset EnqueueTime { get; set; }
}

/// <summary>
/// 帧统计信息
/// </summary>
public class FrameStatistics
{
    public long TotalFrames { get; set; }
    public long ProcessedFrames { get; set; }
    public long DroppedFrames { get; set; }
    public long SentFrames { get; set; }
    public double TotalLatency { get; set; }
    public double CurrentFPS { get; set; }
    public DateTimeOffset LastProcessTime { get; set; }
    public DateTimeOffset LastFPSCalculation { get; set; }
    public DateTimeOffset LastLogTime { get; set; }

    public void Reset()
    {
        TotalFrames = 0;
        ProcessedFrames = 0;
        DroppedFrames = 0;
        SentFrames = 0;
        TotalLatency = 0;
        CurrentFPS = 0;
        LastProcessTime = default;
        LastFPSCalculation = default;
        LastLogTime = default;
    }
}