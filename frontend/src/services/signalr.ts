import * as signalR from '@microsoft/signalr';
import type { DeviceInfo, VideoFrameData, StatusMessageData, LogData } from '@/types/device';

const HUB_URL = (import.meta as any).env?.VITE_HUB_URL || 'http://localhost:5000/hubs/device';

/**
 * SignalR 连接管理器
 */
class SignalRService {
  public connection: signalR.HubConnection | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  /**
   * 初始化连接
   */
  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      console.log('SignalR 已连接');
      return;
    }

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          if (retryContext.previousRetryCount >= this.maxReconnectAttempts) {
            return null; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
        },
      })
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // 连接事件
    this.connection.onclose((error) => {
      console.error('SignalR 连接关闭:', error);
    });

    this.connection.onreconnecting((error) => {
      console.warn('SignalR 正在重连...', error);
    });

    this.connection.onreconnected((connectionId) => {
      console.log('SignalR 重连成功:', connectionId);
      this.reconnectAttempts = 0;
    });

    try {
      await this.connection.start();
      console.log('SignalR 连接成功');
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('SignalR 连接失败:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => this.connect(), 5000);
      }
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }

  /**
   * 加入设备组
   */
  async joinDeviceGroup(deviceId: string): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('JoinDeviceGroup', deviceId);
      console.log(`已加入设备组: ${deviceId}`);
    }
  }

  /**
   * 离开设备组
   */
  async leaveDeviceGroup(deviceId: string): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      await this.connection.invoke('LeaveDeviceGroup', deviceId);
      console.log(`已离开设备组: ${deviceId}`);
    }
  }

  /**
   * 监听设备连接事件
   */
  onDeviceConnected(callback: (device: DeviceInfo) => void): void {
    this.connection?.on('DeviceConnected', callback);
  }

  /**
   * 监听设备断开事件
   */
  onDeviceDisconnected(callback: (deviceId: string) => void): void {
    this.connection?.on('DeviceDisconnected', callback);
  }

  /**
   * 监听设备信息更新事件
   */
  onDeviceInfoUpdated(callback: (device: DeviceInfo) => void): void {
    this.connection?.on('DeviceInfoUpdated', callback);
  }

  /**
   * 监听视频帧
   */
  onReceiveVideoFrame(callback: (data: VideoFrameData) => void): void {
    this.connection?.on('ReceiveVideoFrame', callback);
  }

  /**
   * 监听摄像头帧
   */
  onReceiveCameraFrame(callback: (data: VideoFrameData) => void): void {
    this.connection?.on('ReceiveCameraFrame', callback);
  }

  /**
   * 监听音频帧
   */
  onReceiveAudioFrame(callback: (data: { deviceId: string; audioData: string; timestamp: string }) => void): void {
    this.connection?.on('ReceiveAudioFrame', callback);
  }

  /**
   * 监听状态消息
   */
  onReceiveStatusMessage(callback: (data: StatusMessageData) => void): void {
    this.connection?.on('ReceiveStatusMessage', callback);
  }

  /**
   * 监听日志消息
   */
  onReceiveLog(callback: (data: LogData) => void): void {
    this.connection?.on('ReceiveLog', callback);
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.connection?.off('DeviceConnected');
    this.connection?.off('DeviceDisconnected');
    this.connection?.off('DeviceInfoUpdated');
    this.connection?.off('ReceiveVideoFrame');
    this.connection?.off('ReceiveCameraFrame');
    this.connection?.off('ReceiveAudioFrame');
    this.connection?.off('ReceiveStatusMessage');
    this.connection?.off('ReceiveLog');
  }

  /**
   * 移除视频帧监听器（精确移除指定的callback）
   */
  offReceiveVideoFrame(callback?: (data: VideoFrameData) => void): void {
    if (callback) {
      this.connection?.off('ReceiveVideoFrame', callback);
      console.log('[SignalR] 已移除指定的视频帧监听器');
    } else {
      this.connection?.off('ReceiveVideoFrame');
      console.log('[SignalR] 已移除所有视频帧监听器');
    }
  }

  /**
   * 发送点击命令
   */
  async sendTap(deviceId: string, x: number, y: number): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('SendTap', deviceId, x, y);
    }
    return false;
  }

  /**
   * 发送滑动命令
   */
  async sendSwipe(deviceId: string, x1: number, y1: number, x2: number, y2: number): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('SendSwipe', deviceId, x1, y1, x2, y2);
    }
    return false;
  }

  /**
   * 发送返回键
   */
  async sendBack(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('SendBack', deviceId);
    }
    return false;
  }

  /**
   * 发送 Home 键
   */
  async sendHome(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('SendHome', deviceId);
    }
    return false;
  }

  /**
   * 发送任务键
   */
  async sendTask(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('SendTask', deviceId);
    }
    return false;
  }

  /**
   * 启动屏幕捕获
   */
  async startScreenCapture(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('StartScreenCapture', deviceId);
    }
    return false;
  }

  /**
   * 停止屏幕捕获
   */
  async stopScreenCapture(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('StopScreenCapture', deviceId);
    }
    return false;
  }

  /**
   * 启动遥控模式（关键！必须先调用才能使用 Home/Back/Task 等控制命令）
   */
  async startScreenControl(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('StartScreenControl', deviceId);
    }
    return false;
  }

  /**
   * 停止遥控模式
   */
  async stopScreenControl(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('StopScreenControl', deviceId);
    }
    return false;
  }

  /**
   * 唤醒屏幕
   */
  async wakeScreen(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('WakeScreen', deviceId);
    }
    return false;
  }

  /**
   * 锁定屏幕
   */
  async lockScreen(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('LockScreen', deviceId);
    }
    return false;
  }

  /**
   * 解锁屏幕
   */
  async unlockScreen(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('UnlockScreen', deviceId);
    }
    return false;
  }

  /**
   * 启动黑屏
   */
  async startBlackScreen(deviceId: string, alpha: number = 245): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('StartBlackScreen', deviceId, alpha);
    }
    return false;
  }

  /**
   * 停止黑屏
   */
  async stopBlackScreen(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('StopBlackScreen', deviceId);
    }
    return false;
  }

  /**
   * 请求位置信息
   */
  async requestLocation(deviceId: string): Promise<boolean> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return await this.connection.invoke<boolean>('RequestLocation', deviceId);
    }
    return false;
  }
}

// 导出单例
export const signalRService = new SignalRService();
export default signalRService;

