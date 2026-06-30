import React, { useEffect, useState } from 'react';
import { Layout, Row, Col, message, Tabs } from 'antd';
import { QueryClient, QueryClientProvider } from 'react-query';
import DeviceList from './components/DeviceList';
import ControlAndReaderPanel from './components/ControlAndReaderPanel';
import PasswordManager from './components/PasswordManager';
import { signalRService } from './services/signalr';
import { useDeviceStore } from './store/deviceStore';
import type { DeviceInfo } from './types/device';
import './App.css';

const { Header, Content } = Layout;
const { TabPane } = Tabs;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AppContent: React.FC = () => {
  const { selectedDevice, selectDevice, addDevice, removeDevice, updateDevice } = useDeviceStore();
  const [signalRConnected, setSignalRConnected] = useState(false);

  useEffect(() => {
    // 初始化 SignalR 连接
    const initSignalR = async () => {
      try {
        await signalRService.connect();
        setSignalRConnected(true);
        message.success('实时通信已连接');

        // 监听设备事件
        signalRService.onDeviceConnected((device) => {
          console.log('设备已连接:', device);
          addDevice(device);
          message.info(`设备已连接: ${device.displayName}`);
        });

        signalRService.onDeviceDisconnected((deviceId) => {
          console.log('设备已断开:', deviceId);
          removeDevice(deviceId);
          message.warning(`设备已断开: ${deviceId}`);
        });

        signalRService.onDeviceInfoUpdated((device) => {
          console.log('设备信息已更新:', device);
          updateDevice(device);
        });
      } catch (error) {
        console.error('SignalR 连接失败:', error);
        message.error('实时通信连接失败');
      }
    };

    initSignalR();

    return () => {
      signalRService.disconnect();
    };
  }, [addDevice, removeDevice, updateDevice]);

  const handleSelectDevice = (device: DeviceInfo) => {
    selectDevice(device);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#001529',
          color: 'white',
          fontSize: '20px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ marginRight: '10px' }}>📱</span>
          Android 远程控制系统
        </div>
        <div style={{ fontSize: '14px', fontWeight: 'normal' }}>
          {signalRConnected ? (
            <span style={{ color: '#52c41a' }}>● 已连接</span>
          ) : (
            <span style={{ color: '#ff4d4f' }}>● 未连接</span>
          )}
        </div>
      </Header>
      <Content style={{ padding: '24px', background: '#f0f2f5' }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={8}>
            <DeviceList onSelectDevice={handleSelectDevice} />
          </Col>
          <Col xs={24} lg={16}>
            {selectedDevice ? (
              <Tabs defaultActiveKey="combined" type="card">
                <TabPane tab="控制 + 阅读器" key="combined">
                  <ControlAndReaderPanel device={selectedDevice} />
                </TabPane>
                <TabPane tab="密码管理" key="password">
                  <PasswordManager device={selectedDevice} />
                </TabPane>
              </Tabs>
            ) : (
              <div
                style={{
                  background: 'white',
                  padding: '48px',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#999',
                }}
              >
                <h2>请从左侧选择一个设备</h2>
                <p>选择设备后即可进行远程控制</p>
              </div>
            )}
          </Col>
        </Row>
      </Content>
    </Layout>
  );
};

const App: React.FC = () => {
  // 临时测试：显示简单内容
  const [testMode] = useState(false); // 改为 false 显示完整应用

  if (testMode) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', background: '#f0f2f5', minHeight: '100vh' }}>
        <div style={{ background: 'white', padding: '40px', borderRadius: '8px', maxWidth: '600px', margin: '0 auto' }}>
          <h1 style={{ color: '#1890ff', fontSize: '32px' }}>🎉 前端正常运行！</h1>
          <p style={{ fontSize: '18px', color: '#666' }}>如果您看到这个页面，说明 React 应用已成功加载。</p>
          <hr style={{ margin: '20px 0' }} />
          <div style={{ textAlign: 'left', marginTop: '20px' }}>
            <h3>✅ 已验证的功能：</h3>
            <ul style={{ fontSize: '16px', lineHeight: '2' }}>
              <li>React 18 正常运行</li>
              <li>Ant Design 组件库已加载</li>
              <li>TypeScript 编译成功</li>
              <li>Vite 开发服务器正常</li>
            </ul>
            <h3 style={{ marginTop: '20px' }}>📝 下一步：</h3>
            <p style={{ fontSize: '16px' }}>修复组件导入问题后，将显示完整的设备控制界面。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
};

export default App;

