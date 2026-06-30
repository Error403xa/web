import { create } from 'zustand';
import type { DeviceInfo } from '@/types/device';

interface DeviceStore {
  devices: DeviceInfo[];
  selectedDevice: DeviceInfo | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setDevices: (devices: DeviceInfo[]) => void;
  addDevice: (device: DeviceInfo) => void;
  updateDevice: (device: DeviceInfo) => void;
  removeDevice: (deviceId: string) => void;
  selectDevice: (device: DeviceInfo | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearDevices: () => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  devices: [],
  selectedDevice: null,
  isLoading: false,
  error: null,

  setDevices: (devices) => set({ devices }),

  addDevice: (device) =>
    set((state) => {
      const exists = state.devices.some((d) => d.deviceId === device.deviceId);
      if (exists) {
        return {
          devices: state.devices.map((d) =>
            d.deviceId === device.deviceId ? device : d
          ),
        };
      }
      return { devices: [...state.devices, device] };
    }),

  updateDevice: (device) =>
    set((state) => ({
      devices: state.devices.map((d) =>
        d.deviceId === device.deviceId ? { ...d, ...device } : d
      ),
      selectedDevice:
        state.selectedDevice?.deviceId === device.deviceId
          ? { ...state.selectedDevice, ...device }
          : state.selectedDevice,
    })),

  removeDevice: (deviceId) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.deviceId !== deviceId),
      selectedDevice:
        state.selectedDevice?.deviceId === deviceId ? null : state.selectedDevice,
    })),

  selectDevice: (device) => set({ selectedDevice: device }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  clearDevices: () => set({ devices: [], selectedDevice: null }),
}));

