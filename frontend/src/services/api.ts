import axios from 'axios';
import type { DeviceInfo, TapRequest, SwipeRequest, BlackScreenRequest } from '@/types/device';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证 token
    // const token = localStorage.getItem('authToken');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

/**
 * 设备 API
 */
export const deviceApi = {
  /**
   * 获取所有设备
   */
  getDevices: async (): Promise<DeviceInfo[]> => {
    const response = await apiClient.get<DeviceInfo[]>('/api/devices');
    return response.data;
  },

  /**
   * 获取单个设备信息
   */
  getDevice: async (deviceId: string): Promise<DeviceInfo> => {
    const response = await apiClient.get<DeviceInfo>(`/api/devices/${deviceId}`);
    return response.data;
  },

  /**
   * 断开设备连接
   */
  disconnectDevice: async (deviceId: string): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/disconnect`);
  },

  /**
   * 发送点击命令
   */
  sendTap: async (deviceId: string, request: TapRequest): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/tap`, request);
  },

  /**
   * 发送滑动命令
   */
  sendSwipe: async (deviceId: string, request: SwipeRequest): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/swipe`, request);
  },

  /**
   * 发送按键命令
   */
  sendKey: async (deviceId: string, keyType: 'back' | 'home' | 'task'): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/key/${keyType}`);
  },

  /**
   * 屏幕控制
   */
  screenControl: async (
    deviceId: string,
    action: 'wake' | 'lock' | 'unlock' | 'startcapture' | 'stopcapture' | 'startcontrol' | 'stopcontrol'
  ): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/screen/${action}`);
  },

  /**
   * 黑屏控制
   */
  blackScreenControl: async (deviceId: string, request: BlackScreenRequest): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/blackscreen`, request);
  },

  /**
   * 位置控制
   */
  locationControl: async (deviceId: string, action: 'request' | 'start' | 'stop'): Promise<void> => {
    await apiClient.post(`/api/devices/${deviceId}/location/${action}`);
  },
};

export default apiClient;

