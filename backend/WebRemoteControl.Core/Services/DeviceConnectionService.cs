using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Models;

namespace WebRemoteControl.Core.Services;

/// <summary>
/// 消息接收事件参数
/// </summary>
public class MessageReceivedEventArgs : EventArgs
{
    public string DeviceId { get; set; } = string.Empty;
    public NetworkMessage Message { get; set; } = null!;
}

/// <summary>
/// 设备连接服务实现
/// </summary>
public class DeviceConnectionService : IDeviceConnectionService, IDisposable
{
    private const ushort MAGIC_NUMBER = 0xA501;
    private const int CLIENT_TIMEOUT_SECONDS = 120;
    private const byte COMPRESSION_FLAG = 0x80;

    private TcpListener? _listener;
    private bool _isRunning;
    private readonly ConcurrentDictionary<string, DeviceConnection> _devices = new();
    private readonly ConcurrentDictionary<TcpClient, string> _clientToDeviceId = new();
    private readonly ConcurrentDictionary<string, Queue<NetworkMessage>> _pendingCommands = new();
    private Timer? _connectionMonitorTimer;

    public event EventHandler<DeviceInfo>? DeviceConnected;
    public event EventHandler<string>? DeviceDisconnected;
    public event EventHandler<MessageReceivedEventArgs>? MessageReceived;

    private class DeviceConnection
    {
        public DeviceInfo Info { get; set; } = new();
        public TcpClient Client { get; set; } = null!;
        public NetworkStream Stream { get; set; } = null!;
        public DateTime LastActivity { get; set; } = DateTime.Now;
        public SemaphoreSlim SendLock { get; set; } = new(1, 1);
    }

    /// <summary>
    /// 启动 TCP 监听服务
    /// </summary>
    public async Task StartAsync(int port = 5555)
    {
        if (_isRunning) return;

        _isRunning = true;
        _listener = new TcpListener(IPAddress.Any, port);
        _listener.Start();

        Console.WriteLine($"设备连接服务已启动，监听端口 {port}");

        // 启动连接超时检查定时器
        _connectionMonitorTimer = new Timer(CheckConnectionTimeouts, null, 
            TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));

        // 开始接受客户端连接
        _ = Task.Run(AcceptClientsAsync);
    }

    /// <summary>
    /// 停止服务
    /// </summary>
    public void Stop()
    {
        _isRunning = false;
        _connectionMonitorTimer?.Dispose();
        _listener?.Stop();

        foreach (var device in _devices.Values)
        {
            device.Client?.Close();
        }

        _devices.Clear();
        _clientToDeviceId.Clear();
    }

    /// <summary>
    /// 接受客户端连接
    /// </summary>
    private async Task AcceptClientsAsync()
    {
        while (_isRunning && _listener != null)
        {
            try
            {
                var client = await _listener.AcceptTcpClientAsync();
                _ = Task.Run(() => HandleClientAsync(client));
            }
            catch (Exception ex)
            {
                if (_isRunning)
                {
                    Console.WriteLine($"接受客户端连接错误: {ex.Message}");
                }
            }
        }
    }

    /// <summary>
    /// 处理客户端连接
    /// </summary>
    private async Task HandleClientAsync(TcpClient client)
    {
        NetworkStream? stream = null;
        string? deviceId = null;

        try
        {
            stream = client.GetStream();
            var endpoint = client.Client.RemoteEndPoint as IPEndPoint;
            var ipAddress = endpoint?.Address.ToString() ?? "unknown";
            Console.WriteLine($"新客户端连接: {ipAddress}");

            // 配置客户端（模仿原版 EXE）
            client.SendBufferSize = 65536;
            client.ReceiveBufferSize = 65536;
            client.NoDelay = true;

            // 使用 IP 地址生成设备 ID
            deviceId = ipAddress.Replace(".", "_");

            // 创建设备连接对象
            var deviceConnection = new DeviceConnection
            {
                Client = client,
                Stream = stream,
                Info = new DeviceInfo
                {
                    DeviceId = deviceId,
                    DeviceName = $"Android 设备",
                    Alias = $"Android 设备 ({ipAddress})",
                    Model = "未知型号",
                    OsVersion = "Android",
                    IpAddress = ipAddress,
                    Battery = "未知",
                    Status = "在线",
                    ConnectedTime = DateTime.Now,
                    LastActivity = DateTime.Now
                }
            };

            _devices[deviceId] = deviceConnection;
            _clientToDeviceId[client] = deviceId;

            Console.WriteLine($"设备已添加: {deviceId}");
            DeviceConnected?.Invoke(this, deviceConnection.Info);

            // 发送所有待处理的命令
            if (_pendingCommands.TryGetValue(deviceId, out var commandQueue))
            {
                Console.WriteLine($"发现 {commandQueue.Count} 个待处理命令，立即发送...");
                while (commandQueue.TryDequeue(out var command))
                {
                    try
                    {
                        await SendMessageInternalAsync(stream, command);
                        Console.WriteLine($"已发送待处理命令: {command.Type}");
                        await Task.Delay(50); // 短暂延迟，确保 Android 端能处理
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"发送待处理命令失败: {ex.Message}");
                        // 重新加入队列
                        commandQueue.Enqueue(command);
                        break;
                    }
                }
            }

            // 持续接收消息
            await ReceiveMessagesLoopAsync(deviceId, stream);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"处理客户端错误: {ex.Message}");
            Console.WriteLine($"错误堆栈: {ex.StackTrace}");
        }
        finally
        {
            if (deviceId != null)
            {
                _devices.TryRemove(deviceId, out _);
                _clientToDeviceId.TryRemove(client, out _);
                DeviceDisconnected?.Invoke(this, deviceId);
            }

            stream?.Close();
            client?.Close();
        }
    }

    /// <summary>
    /// 接收消息循环
    /// </summary>
    private async Task ReceiveMessagesLoopAsync(string deviceId, NetworkStream stream)
    {
        while (_isRunning && stream.CanRead)
        {
            try
            {
                var message = await ReceiveMessageAsync(stream);
                if (message != null)
                {
                    if (_devices.TryGetValue(deviceId, out var device))
                    {
                        device.LastActivity = DateTime.Now;
                    }

                    MessageReceived?.Invoke(this, new MessageReceivedEventArgs
                    {
                        DeviceId = deviceId,
                        Message = message
                    });
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"接收消息错误 [{deviceId}]: {ex.Message}");
                break;
            }
        }
    }

    /// <summary>
    /// 读取指定数量的字节，如果流结束则返回实际读取的字节数
    /// </summary>
    private async Task<int> ReadExactlyOrEndAsync(NetworkStream stream, byte[] buffer, int offset, int count)
    {
        int totalRead = 0;
        while (totalRead < count)
        {
            int read = await stream.ReadAsync(buffer, offset + totalRead, count - totalRead);
            if (read == 0) break; // 流已结束
            totalRead += read;
        }
        return totalRead;
    }

    /// <summary>
    /// 接收单个消息
    /// </summary>
    private async Task<NetworkMessage?> ReceiveMessageAsync(NetworkStream stream)
    {
        // 读取魔数 (2 bytes)
        var magicBuffer = new byte[2];
        var bytesRead = await ReadExactlyOrEndAsync(stream, magicBuffer, 0, 2);
        if (bytesRead < 2) return null; // 流已结束

        var magic = (ushort)((magicBuffer[0] << 8) | magicBuffer[1]);

        if (magic != MAGIC_NUMBER)
        {
            throw new InvalidDataException($"无效的魔数: 0x{magic:X4}");
        }

        // 读取消息类型 (1 byte)
        var typeBuffer = new byte[1];
        bytesRead = await ReadExactlyOrEndAsync(stream, typeBuffer, 0, 1);
        if (bytesRead < 1) return null;

        var messageType = (MessageType)(typeBuffer[0] & 0x7F);
        var isCompressed = (typeBuffer[0] & COMPRESSION_FLAG) != 0;

        // 读取负载长度 (4 bytes)
        var lengthBuffer = new byte[4];
        bytesRead = await ReadExactlyOrEndAsync(stream, lengthBuffer, 0, 4);
        if (bytesRead < 4) return null;

        var payloadLength = (lengthBuffer[0] << 24) | (lengthBuffer[1] << 16) |
                           (lengthBuffer[2] << 8) | lengthBuffer[3];

        Console.WriteLine($"[收到消息] 类型: {messageType}, 长度: {payloadLength}");

        // 读取负载
        var payload = new byte[payloadLength];
        if (payloadLength > 0)
        {
            bytesRead = await ReadExactlyOrEndAsync(stream, payload, 0, payloadLength);
            if (bytesRead < payloadLength) return null;
            if (payloadLength <= 100)
            {
                Console.WriteLine($"[收到消息] 负载: {BitConverter.ToString(payload)}");
            }
            else
            {
                Console.WriteLine($"[收到消息] 负载前100字节: {BitConverter.ToString(payload, 0, 100)}...");
            }
        }

        // 处理压缩数据
        if (isCompressed)
        {
            Console.WriteLine($"[解压] 压缩数据，原始大小: {payload.Length} bytes");
            payload = DecompressData(payload);
            Console.WriteLine($"[解压] 解压后大小: {payload.Length} bytes");
        }

        return new NetworkMessage
        {
            Type = messageType,
            Payload = payload,
            Timestamp = DateTime.Now
        };
    }

    /// <summary>
    /// 解压 GZip 压缩数据
    /// </summary>
    private byte[] DecompressData(byte[] compressedData)
    {
        if (compressedData == null || compressedData.Length == 0)
        {
            return compressedData;
        }

        try
        {
            using var compressedStream = new MemoryStream(compressedData);
            using var gzipStream = new GZipStream(compressedStream, CompressionMode.Decompress);
            using var decompressedStream = new MemoryStream();

            var buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = gzipStream.Read(buffer, 0, buffer.Length)) > 0)
            {
                decompressedStream.Write(buffer, 0, bytesRead);
            }

            return decompressedStream.ToArray();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"解压数据错误: {ex.Message}");
            return compressedData;
        }
    }

    /// <summary>
    /// 解析设备信息
    /// </summary>
    private async Task<string?> ParseDeviceInfoAsync(byte[] payload, string ipAddress)
    {
        try
        {
            var text = System.Text.Encoding.UTF8.GetString(payload);
            Console.WriteLine($"尝试解析设备信息: {text}");

            // 尝试解析 JSON
            try
            {
                var deviceInfo = JsonSerializer.Deserialize<DeviceInfo>(text);
                if (deviceInfo != null && !string.IsNullOrEmpty(deviceInfo.DeviceId))
                {
                    return deviceInfo.DeviceId;
                }
            }
            catch
            {
                // JSON 解析失败，使用简单文本格式
            }

            // 如果不是 JSON，使用 IP 地址作为设备 ID
            var deviceId = ipAddress.Replace(".", "_");
            Console.WriteLine($"使用 IP 地址生成设备 ID: {deviceId}");

            // 创建默认设备信息并存储
            var defaultDevice = new DeviceInfo
            {
                DeviceId = deviceId,
                DeviceName = $"Android 设备",
                Alias = $"Android 设备 ({ipAddress})",
                Model = "未知型号",
                OsVersion = "Android",
                IpAddress = ipAddress,
                Battery = "未知",
                Status = "在线",
                ConnectedTime = DateTime.Now,
                LastActivity = DateTime.Now
            };

            // 更新设备信息
            if (_devices.TryGetValue(deviceId, out var existing))
            {
                existing.Info = defaultDevice;
            }

            return deviceId;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"解析设备信息失败: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// 检查连接超时
    /// </summary>
    private void CheckConnectionTimeouts(object? state)
    {
        var now = DateTime.Now;
        var timeoutDevices = _devices
            .Where(kvp => (now - kvp.Value.LastActivity).TotalSeconds > CLIENT_TIMEOUT_SECONDS)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var deviceId in timeoutDevices)
        {
            Console.WriteLine($"设备连接超时: {deviceId}");
            _ = DisconnectDeviceAsync(deviceId);
        }
    }

    public async Task<List<DeviceInfo>> GetConnectedDevicesAsync()
    {
        return await Task.FromResult(_devices.Values.Select(d => d.Info).ToList());
    }

    public async Task<DeviceInfo?> GetDeviceByIdAsync(string deviceId)
    {
        return await Task.FromResult(
            _devices.TryGetValue(deviceId, out var device) ? device.Info : null
        );
    }

    public async Task<bool> SendMessageToDeviceAsync(string deviceId, NetworkMessage message)
    {
        if (!_devices.TryGetValue(deviceId, out var device))
        {
            Console.WriteLine($"设备 {deviceId} 未连接，将命令加入待处理队列");
            // 设备未连接，加入待处理队列
            var queue = _pendingCommands.GetOrAdd(deviceId, _ => new Queue<NetworkMessage>());
            queue.Enqueue(message);
            return true; // 返回 true 表示已加入队列
        }

        await device.SendLock.WaitAsync();
        try
        {
            await SendMessageInternalAsync(device.Stream, message);
            device.LastActivity = DateTime.Now;
            Console.WriteLine($"命令已立即发送到设备 {deviceId}: {message.Type}");
            return true;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"发送消息失败 [{deviceId}]: {ex.Message}，加入待处理队列");
            // 发送失败，加入待处理队列
            var queue = _pendingCommands.GetOrAdd(deviceId, _ => new Queue<NetworkMessage>());
            queue.Enqueue(message);
            return false;
        }
        finally
        {
            device.SendLock.Release();
        }
    }

    /// <summary>
    /// 发送消息到流
    /// </summary>
    private async Task SendMessageInternalAsync(NetworkStream stream, NetworkMessage message)
    {
        // 构建消息包: [魔数(2)] [类型(1)] [长度(4)] [负载(n)]
        var packet = new byte[7 + message.Payload.Length];

        // 魔数
        packet[0] = (byte)(MAGIC_NUMBER >> 8);
        packet[1] = (byte)(MAGIC_NUMBER & 0xFF);

        // 类型
        packet[2] = (byte)message.Type;

        // 长度
        var length = message.Payload.Length;
        packet[3] = (byte)(length >> 24);
        packet[4] = (byte)(length >> 16);
        packet[5] = (byte)(length >> 8);
        packet[6] = (byte)(length & 0xFF);

        // 负载
        Array.Copy(message.Payload, 0, packet, 7, message.Payload.Length);

        // 调试日志
        if (message.Type == MessageType.SystemControl)
        {
            Console.WriteLine($"[发送] SystemControl - 头部: {BitConverter.ToString(packet, 0, 7)}, 负载: {BitConverter.ToString(message.Payload)}");
        }
        else if (message.Type == MessageType.ControlCommand)
        {
            Console.WriteLine($"[发送] ControlCommand - 头部: {BitConverter.ToString(packet, 0, 7)}, 负载: {BitConverter.ToString(message.Payload)}");
        }

        await stream.WriteAsync(packet);
        await stream.FlushAsync();
    }

    public async Task DisconnectDeviceAsync(string deviceId)
    {
        if (_devices.TryRemove(deviceId, out var device))
        {
            device.Client?.Close();
            DeviceDisconnected?.Invoke(this, deviceId);
        }
        await Task.CompletedTask;
    }

    public void Dispose()
    {
        Stop();
        _connectionMonitorTimer?.Dispose();
    }
}

