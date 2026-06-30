import React from 'react';
import { Space } from 'antd';
import RemoteControl from './RemoteControl';
import ScreenReader from './ScreenReader';
import type { DeviceInfo } from '../types/device';

interface ControlAndReaderPanelProps {
  device: DeviceInfo;
}

const ControlAndReaderPanel: React.FC<ControlAndReaderPanelProps> = ({ device }) => {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 屏幕投屏卡片 */}
      <RemoteControl device={device} />
      {/* 桌面阅读器卡片 */}
      <ScreenReader device={device} />
    </Space>
  );
};

export default ControlAndReaderPanel;

