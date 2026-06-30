using System.Collections.Concurrent;

namespace WebRemoteControl.API.Services;

/// <summary>
/// 跟踪活动设备组的服务
/// </summary>
public interface IActiveDeviceTracker
{
    void AddConnection(string deviceId, string connectionId);
    void RemoveConnection(string deviceId, string connectionId);
    bool HasActiveConnections(string deviceId);
    int GetConnectionCount(string deviceId);
}

public class ActiveDeviceTracker : IActiveDeviceTracker
{
    // 设备ID -> 连接ID集合的映射
    private readonly ConcurrentDictionary<string, HashSet<string>> _deviceConnections = new();
    private readonly object _lock = new object();
    private readonly ILogger<ActiveDeviceTracker> _logger;

    public ActiveDeviceTracker(ILogger<ActiveDeviceTracker> logger)
    {
        _logger = logger;
    }

    public void AddConnection(string deviceId, string connectionId)
    {
        lock (_lock)
        {
            if (!_deviceConnections.ContainsKey(deviceId))
            {
                _deviceConnections[deviceId] = new HashSet<string>();
            }
            _deviceConnections[deviceId].Add(connectionId);
            _logger.LogDebug($"设备 {deviceId} 添加连接 {connectionId}，当前连接数: {_deviceConnections[deviceId].Count}");
        }
    }

    public void RemoveConnection(string deviceId, string connectionId)
    {
        lock (_lock)
        {
            if (_deviceConnections.TryGetValue(deviceId, out var connections))
            {
                connections.Remove(connectionId);
                if (connections.Count == 0)
                {
                    _deviceConnections.TryRemove(deviceId, out _);
                    _logger.LogDebug($"设备 {deviceId} 已无活动连接，已移除");
                }
                else
                {
                    _logger.LogDebug($"设备 {deviceId} 移除连接 {connectionId}，剩余连接数: {connections.Count}");
                }
            }
        }
    }

    public bool HasActiveConnections(string deviceId)
    {
        lock (_lock)
        {
            return _deviceConnections.ContainsKey(deviceId) && _deviceConnections[deviceId].Count > 0;
        }
    }

    public int GetConnectionCount(string deviceId)
    {
        lock (_lock)
        {
            if (_deviceConnections.TryGetValue(deviceId, out var connections))
            {
                return connections.Count;
            }
            return 0;
        }
    }
}