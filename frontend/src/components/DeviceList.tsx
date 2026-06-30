import React, { useEffect } from 'react';
import { Card, List, Tag, Badge, Button, Space, Tooltip, Empty } from 'antd';
import {
  MobileOutlined,
  WifiOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useQuery } from 'react-query';
import { deviceApi } from '../services/api';
import { useDeviceStore } from '../store/deviceStore';
import type { DeviceInfo } from '../types/device';

interface DeviceListProps {
  onSelectDevice: (device: DeviceInfo) => void;
}

const DeviceList: React.FC<DeviceListProps> = ({ onSelectDevice }) => {
  const { devices, selectedDevice, setDevices, removeDevice } = useDeviceStore();

  // 获取设备列表
  const { isLoading, refetch } = useQuery('devices', deviceApi.getDevices, {
    refetchInterval: 5000, // 每 5 秒刷新一次
    onSuccess: (data) => {
      setDevices(data);
    },
  });

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleDisconnect = async (deviceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deviceApi.disconnectDevice(deviceId);
      removeDevice(deviceId);
    } catch (error) {
      console.error('断开设备失败:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    return status === '在线' ? (
      <Badge status="success" text="在线" />
    ) : (
      <Badge status="default" text="离线" />
    );
  };

  const formatTime = (time: string) => {
    if (!time) return '-';
    const date = new Date(time);
    return date.toLocaleString('zh-CN');
  };

  return (
    <Card
      title={
        <Space>
          <MobileOutlined />
          <span>设备列表</span>
          <Tag color="blue">{devices.length} 台设备</Tag>
        </Space>
      }
      extra={
        <Button type="primary" onClick={() => refetch()}>
          刷新
        </Button>
      }
      loading={isLoading}
    >
      {devices.length === 0 ? (
        <Empty description="暂无设备连接" />
      ) : (
        <List
          dataSource={devices}
          renderItem={(device) => (
            <List.Item
              key={device.deviceId}
              onClick={() => onSelectDevice(device)}
              style={{
                cursor: 'pointer',
                backgroundColor:
                  selectedDevice?.deviceId === device.deviceId ? '#e6f7ff' : 'transparent',
                padding: '12px',
                borderRadius: '4px',
                marginBottom: '8px',
              }}
              actions={[
                <Tooltip title="断开连接" key="disconnect">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => handleDisconnect(device.deviceId, e)}
                  />
                </Tooltip>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: '#1890ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '20px',
                    }}
                  >
                    <MobileOutlined />
                  </div>
                }
                title={
                  <Space>
                    <span style={{ fontWeight: 'bold' }}>{device.displayName}</span>
                    {getStatusBadge(device.status)}
                  </Space>
                }
                description={
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Space>
                      <Tag icon={<MobileOutlined />}>{device.model}</Tag>
                      <Tag>{device.osVersion}</Tag>
                    </Space>
                    <Space>
                      <Tooltip title="IP 地址">
                        <Tag icon={<WifiOutlined />}>{device.ipAddress}</Tag>
                      </Tooltip>
                      <Tooltip title="电池电量">
                        <Tag icon={<ThunderboltOutlined />}>{device.battery}</Tag>
                      </Tooltip>
                    </Space>
                    <Space>
                      <Tooltip title="连接时间">
                        <Tag icon={<ClockCircleOutlined />} color="green">
                          {formatTime(device.connectedTime)}
                        </Tag>
                      </Tooltip>
                    </Space>
                    {device.tags && device.tags.length > 0 && (
                      <Space>
                        {device.tags.map((tag) => (
                          <Tag key={tag} color="purple">
                            {tag}
                          </Tag>
                        ))}
                      </Space>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

export default DeviceList;

