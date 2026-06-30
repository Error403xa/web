using WebRemoteControl.Core.Models;
using WebRemoteControl.Core.Services;

namespace WebRemoteControl.Core.Interfaces;

/// <summary>
/// 设备连接服务接口
/// </summary>
public interface IDeviceConnectionService
{
    /// <summary>
    /// 获取所有已连接的设备
    /// </summary>
    Task<List<DeviceInfo>> GetConnectedDevicesAsync();

    /// <summary>
    /// 根据设备ID获取设备信息
    /// </summary>
    Task<DeviceInfo?> GetDeviceByIdAsync(string deviceId);

    /// <summary>
    /// 发送消息到设备
    /// </summary>
    Task<bool> SendMessageToDeviceAsync(string deviceId, NetworkMessage message);

    /// <summary>
    /// 断开设备连接
    /// </summary>
    Task DisconnectDeviceAsync(string deviceId);

    /// <summary>
    /// 设备连接事件
    /// </summary>
    event EventHandler<DeviceInfo>? DeviceConnected;

    /// <summary>
    /// 设备断开事件
    /// </summary>
    event EventHandler<string>? DeviceDisconnected;

    /// <summary>
    /// 设备消息接收事件
    /// </summary>
    event EventHandler<MessageReceivedEventArgs>? MessageReceived;
}

