using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Services;

namespace WebRemoteControl.API.Services;

/// <summary>
/// 设备连接后台服务
/// </summary>
public class DeviceConnectionHostedService : IHostedService
{
    private readonly IDeviceConnectionService _connectionService;
    private readonly ILogger<DeviceConnectionHostedService> _logger;
    private readonly IConfiguration _configuration;

    public DeviceConnectionHostedService(
        IDeviceConnectionService connectionService,
        ILogger<DeviceConnectionHostedService> logger,
        IConfiguration configuration)
    {
        _connectionService = connectionService;
        _logger = logger;
        _configuration = configuration;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("设备连接服务正在启动...");

        var port = _configuration.GetValue<int>("DeviceServer:Port", 5555);
        
        if (_connectionService is DeviceConnectionService service)
        {
            await service.StartAsync(port);
            _logger.LogInformation($"设备连接服务已启动，监听端口: {port}");
        }
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("设备连接服务正在停止...");

        if (_connectionService is DeviceConnectionService service)
        {
            service.Stop();
            _logger.LogInformation("设备连接服务已停止");
        }

        return Task.CompletedTask;
    }
}

