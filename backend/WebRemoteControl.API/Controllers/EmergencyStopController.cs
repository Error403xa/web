using Microsoft.AspNetCore.Mvc;
using WebRemoteControl.Core.Interfaces;
using System.Text.Json;

namespace WebRemoteControl.API.Controllers;

[ApiController]
[Route("api/device")]
public class EmergencyStopController : ControllerBase
{
    private readonly IDeviceControlService _controlService;
    private readonly ILogger<EmergencyStopController> _logger;

    public EmergencyStopController(
        IDeviceControlService controlService,
        ILogger<EmergencyStopController> logger)
    {
        _controlService = controlService;
        _logger = logger;
    }

    /// <summary>
    /// 紧急停止屏幕捕获（用于页面刷新/关闭时）
    /// </summary>
    [HttpPost("stop-capture")]
    public async Task<IActionResult> EmergencyStopCapture([FromBody] JsonElement data)
    {
        try
        {
            var deviceId = data.GetProperty("deviceId").GetString();
            if (string.IsNullOrEmpty(deviceId))
            {
                return BadRequest("Device ID is required");
            }

            _logger.LogInformation("[EmergencyStop] 收到紧急停止屏幕捕获请求: {DeviceId}", deviceId);

            await _controlService.StopScreenCaptureAsync(deviceId);

            _logger.LogInformation("[EmergencyStop] 已停止设备 {DeviceId} 的屏幕捕获", deviceId);

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[EmergencyStop] 停止屏幕捕获失败");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }

    /// <summary>
    /// 紧急停止遥控模式（用于页面刷新/关闭时）
    /// </summary>
    [HttpPost("stop-control")]
    public async Task<IActionResult> EmergencyStopControl([FromBody] JsonElement data)
    {
        try
        {
            var deviceId = data.GetProperty("deviceId").GetString();
            if (string.IsNullOrEmpty(deviceId))
            {
                return BadRequest("Device ID is required");
            }

            _logger.LogInformation("[EmergencyStop] 收到紧急停止遥控模式请求: {DeviceId}", deviceId);

            await _controlService.StopScreenControlAsync(deviceId);

            _logger.LogInformation("[EmergencyStop] 已停止设备 {DeviceId} 的遥控模式", deviceId);

            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[EmergencyStop] 停止遥控模式失败");
            return StatusCode(500, new { success = false, error = ex.Message });
        }
    }
}