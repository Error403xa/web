using Microsoft.AspNetCore.SignalR;
using WebRemoteControl.API.Hubs;
using WebRemoteControl.API.Services;
using WebRemoteControl.Core.Interfaces;
using WebRemoteControl.Core.Services;

var builder = WebApplication.CreateBuilder(args);

// 添加服务到容器
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "Android 远程控制 API",
        Version = "v1",
        Description = "Android 设备远程控制系统 Web API"
    });
});

// 添加 SignalR
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.MaximumReceiveMessageSize = 10 * 1024 * 1024; // 10MB for video frames
});

// 添加 CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
    
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// 注册应用服务
builder.Services.AddSingleton<IActiveDeviceTracker, ActiveDeviceTracker>(); // 设备连接跟踪服务
builder.Services.AddSingleton<IDeviceConnectionService, DeviceConnectionService>();
builder.Services.AddSingleton<IDeviceControlService, DeviceControlService>();
builder.Services.AddSingleton<ScreenReaderFrameService>(); // 屏幕阅读器帧管理服务
builder.Services.AddHostedService<DeviceConnectionHostedService>();
builder.Services.AddHostedService<VideoFrameForwardingService>(); // 视频帧转发服务
builder.Services.AddSingleton<DeviceMessageBroadcaster>();

// 配置日志
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var app = builder.Build();

// 配置 HTTP 请求管道
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Android 远程控制 API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseCors("AllowFrontend");

app.UseAuthorization();

app.MapControllers();
app.MapHub<DeviceHub>("/hubs/device");

// 启动欢迎信息
app.Lifetime.ApplicationStarted.Register(() =>
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    logger.LogInformation("========================================");
    logger.LogInformation("Android 远程控制系统 Web API 已启动");
    logger.LogInformation("API 文档: http://localhost:5000/swagger");
    logger.LogInformation("SignalR Hub: http://localhost:5000/hubs/device");
    logger.LogInformation("========================================");
});

app.Run();

