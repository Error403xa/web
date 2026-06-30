/**
 * 屏幕状态枚举
 */
export enum ScreenState {
  ScreenOnUnlocked = 0,
  ScreenOnLocked = 1,
  ScreenOffUnlocked = 2,
  ScreenOffLocked = 3,
}

/**
 * 设备信息接口
 */
export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  model: string;
  osVersion: string;
  battery: string;
  manufacturer: string;
  resolution: string;
  apiLevel: number;
  cpuModel: string;
  memory: string;
  storage: string;
  buildNumber: string;
  ipAddress: string;
  status: string;
  connectedTime: string;
  lastActivity: string;
  lastLockActivity: string;
  accessibilityStatus: string;
  appName?: string;
  channelName?: string;
  latitude?: number;
  longitude?: number;
  locationTime?: string;
  screenState: ScreenState;
  alias?: string;
  notes?: string;
  tags: string[];
  displayName: string;
  isOnline: boolean;
}

/**
 * 点击请求
 */
export interface TapRequest {
  x: number;
  y: number;
}

/**
 * 滑动请求
 */
export interface SwipeRequest {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 黑屏请求
 */
export interface BlackScreenRequest {
  action: 'start' | 'stop';
  alpha?: number;
}

/**
 * 视频帧数据
 */
export interface VideoFrameData {
  deviceId: string;
  frameData: string; // Base64 编码
  timestamp: string;
}

/**
 * 状态消息数据
 */
export interface StatusMessageData {
  deviceId: string;
  data: string;
  timestamp: string;
}

/**
 * 日志数据
 */
export interface LogData {
  deviceId: string;
  logType: string;
  data: string;
  timestamp: string;
}

