namespace WebRemoteControl.Core.Models;

/// <summary>
/// 设备信息模型
/// </summary>
public class DeviceInfo
{
    /// <summary>
    /// 设备唯一标识
    /// </summary>
    public string DeviceId { get; set; } = string.Empty;

    /// <summary>
    /// 设备名称
    /// </summary>
    public string DeviceName { get; set; } = string.Empty;

    /// <summary>
    /// 设备型号
    /// </summary>
    public string Model { get; set; } = string.Empty;

    /// <summary>
    /// 操作系统版本
    /// </summary>
    public string OsVersion { get; set; } = string.Empty;

    /// <summary>
    /// 电池电量
    /// </summary>
    public string Battery { get; set; } = string.Empty;

    /// <summary>
    /// 制造商
    /// </summary>
    public string Manufacturer { get; set; } = string.Empty;

    /// <summary>
    /// 屏幕分辨率
    /// </summary>
    public string Resolution { get; set; } = string.Empty;

    /// <summary>
    /// API 级别
    /// </summary>
    public int ApiLevel { get; set; }

    /// <summary>
    /// CPU 型号
    /// </summary>
    public string CpuModel { get; set; } = string.Empty;

    /// <summary>
    /// 内存信息
    /// </summary>
    public string Memory { get; set; } = string.Empty;

    /// <summary>
    /// 存储信息
    /// </summary>
    public string Storage { get; set; } = string.Empty;

    /// <summary>
    /// 构建号
    /// </summary>
    public string BuildNumber { get; set; } = string.Empty;

    /// <summary>
    /// IP 地址
    /// </summary>
    public string IpAddress { get; set; } = string.Empty;

    /// <summary>
    /// 连接状态
    /// </summary>
    public string Status { get; set; } = "离线";

    /// <summary>
    /// 连接时间
    /// </summary>
    public DateTime ConnectedTime { get; set; }

    /// <summary>
    /// 最后活动时间
    /// </summary>
    public DateTime LastActivity { get; set; }

    /// <summary>
    /// 最后锁屏活动时间
    /// </summary>
    public DateTime LastLockActivity { get; set; }

    /// <summary>
    /// 无障碍服务状态
    /// </summary>
    public string AccessibilityStatus { get; set; } = "未开启";

    /// <summary>
    /// 当前应用名称
    /// </summary>
    public string? AppName { get; set; }

    /// <summary>
    /// 渠道名称
    /// </summary>
    public string? ChannelName { get; set; }

    /// <summary>
    /// 纬度
    /// </summary>
    public double? Latitude { get; set; }

    /// <summary>
    /// 经度
    /// </summary>
    public double? Longitude { get; set; }

    /// <summary>
    /// 位置更新时间
    /// </summary>
    public DateTime? LocationTime { get; set; }

    /// <summary>
    /// 屏幕状态
    /// </summary>
    public ScreenState ScreenState { get; set; } = ScreenState.ScreenOffLocked;

    /// <summary>
    /// 设备别名
    /// </summary>
    public string? Alias { get; set; }

    /// <summary>
    /// 备注
    /// </summary>
    public string? Notes { get; set; }

    /// <summary>
    /// 标签列表
    /// </summary>
    public List<string> Tags { get; set; } = new();

    /// <summary>
    /// 显示名称（优先使用别名）
    /// </summary>
    public string DisplayName => !string.IsNullOrEmpty(Alias) ? Alias : DeviceName;

    /// <summary>
    /// 是否在线
    /// </summary>
    public bool IsOnline => Status == "在线";
}

/// <summary>
/// 屏幕状态枚举
/// </summary>
public enum ScreenState
{
    /// <summary>
    /// 屏幕开启且未锁定
    /// </summary>
    ScreenOnUnlocked = 0,

    /// <summary>
    /// 屏幕开启但已锁定
    /// </summary>
    ScreenOnLocked = 1,

    /// <summary>
    /// 屏幕关闭且未锁定
    /// </summary>
    ScreenOffUnlocked = 2,

    /// <summary>
    /// 屏幕关闭且已锁定
    /// </summary>
    ScreenOffLocked = 3
}

