using Microsoft.AspNetCore.Mvc;
using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Models;

namespace WebRemoteControl.API.Controllers;

/// <summary>
/// 设备管理 API
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class DevicesController : ControllerBase
{
    private readonly IDeviceConnectionService _connectionService;
    private readonly IDeviceControlService _controlService;
    private readonly ILogger<DevicesController> _logger;

    public DevicesController(
        IDeviceConnectionService connectionService,
        IDeviceControlService controlService,
        ILogger<DevicesController> logger)
    {
        _connectionService = connectionService;
        _controlService = controlService;
        _logger = logger;
    }

    /// <summary>
    /// 获取所有已连接的设备
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<DeviceInfo>>> GetDevices()
    {
        var devices = await _connectionService.GetConnectedDevicesAsync();
        return Ok(devices);
    }

    /// <summary>
    /// 根据 ID 获取设备信息
    /// </summary>
    [HttpGet("{deviceId}")]
    public async Task<ActionResult<DeviceInfo>> GetDevice(string deviceId)
    {
        var device = await _connectionService.GetDeviceByIdAsync(deviceId);
        if (device == null)
        {
            return NotFound(new { message = $"设备 {deviceId} 未找到" });
        }

        return Ok(device);
    }

    /// <summary>
    /// 断开设备连接
    /// </summary>
    [HttpPost("{deviceId}/disconnect")]
    public async Task<ActionResult> DisconnectDevice(string deviceId)
    {
        await _connectionService.DisconnectDeviceAsync(deviceId);
        return Ok(new { message = "设备已断开连接" });
    }

    /// <summary>
    /// 发送点击命令
    /// </summary>
    [HttpPost("{deviceId}/tap")]
    public async Task<ActionResult> SendTap(string deviceId, [FromBody] TapRequest request)
    {
        var result = await _controlService.SendTapAsync(deviceId, request.X, request.Y);
        if (!result)
        {
            return BadRequest(new { message = "发送命令失败" });
        }

        return Ok(new { message = "命令已发送" });
    }

    /// <summary>
    /// 发送滑动命令
    /// </summary>
    [HttpPost("{deviceId}/swipe")]
    public async Task<ActionResult> SendSwipe(string deviceId, [FromBody] SwipeRequest request)
    {
        var result = await _controlService.SendSwipeAsync(deviceId, 
            request.X1, request.Y1, request.X2, request.Y2);
        
        if (!result)
        {
            return BadRequest(new { message = "发送命令失败" });
        }

        return Ok(new { message = "命令已发送" });
    }

    /// <summary>
    /// 发送按键命令
    /// </summary>
    [HttpPost("{deviceId}/key/{keyType}")]
    public async Task<ActionResult> SendKey(string deviceId, string keyType)
    {
        bool result = keyType.ToLower() switch
        {
            "back" => await _controlService.SendBackAsync(deviceId),
            "home" => await _controlService.SendHomeAsync(deviceId),
            "task" => await _controlService.SendTaskAsync(deviceId),
            _ => false
        };

        if (!result)
        {
            return BadRequest(new { message = "发送命令失败或不支持的按键类型" });
        }

        return Ok(new { message = "命令已发送" });
    }

    /// <summary>
    /// 屏幕控制
    /// </summary>
    [HttpPost("{deviceId}/screen/{action}")]
    public async Task<ActionResult> ScreenControl(string deviceId, string action)
    {
        bool result = action.ToLower() switch
        {
            "wake" => await _controlService.WakeScreenAsync(deviceId),
            "lock" => await _controlService.LockScreenAsync(deviceId),
            "unlock" => await _controlService.UnlockScreenAsync(deviceId),
            "startcapture" => await _controlService.StartScreenCaptureAsync(deviceId),
            "stopcapture" => await _controlService.StopScreenCaptureAsync(deviceId),
            "startcontrol" => await _controlService.StartScreenControlAsync(deviceId),
            "stopcontrol" => await _controlService.StopScreenControlAsync(deviceId),
            _ => false
        };

        if (!result)
        {
            return BadRequest(new { message = "发送命令失败或不支持的操作" });
        }

        return Ok(new { message = "命令已发送" });
    }

    /// <summary>
    /// 黑屏控制
    /// </summary>
    [HttpPost("{deviceId}/blackscreen")]
    public async Task<ActionResult> BlackScreenControl(string deviceId, [FromBody] BlackScreenRequest request)
    {
        bool result = request.Action.ToLower() switch
        {
            "start" => await _controlService.StartBlackScreenAsync(deviceId, request.Alpha),
            "stop" => await _controlService.StopBlackScreenAsync(deviceId),
            _ => false
        };

        if (!result)
        {
            return BadRequest(new { message = "发送命令失败" });
        }

        return Ok(new { message = "命令已发送" });
    }

    /// <summary>
    /// 位置控制
    /// </summary>
    [HttpPost("{deviceId}/location/{action}")]
    public async Task<ActionResult> LocationControl(string deviceId, string action)
    {
        bool result = action.ToLower() switch
        {
            "request" => await _controlService.RequestLocationAsync(deviceId),
            "start" => await _controlService.StartLocationTrackingAsync(deviceId),
            "stop" => await _controlService.StopLocationTrackingAsync(deviceId),
            _ => false
        };

        if (!result)
        {
            return BadRequest(new { message = "发送命令失败" });
        }

        return Ok(new { message = "命令已发送" });
    }
}

// 请求模型
public record TapRequest(int X, int Y);
public record SwipeRequest(int X1, int Y1, int X2, int Y2);
public record BlackScreenRequest(string Action, int Alpha = 245);

