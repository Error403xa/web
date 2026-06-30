import React, { useEffect, useRef, useState } from 'react';
import { Card, Button, Space, message, Slider, Select } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  HomeOutlined,
  RollbackOutlined,
  AppstoreOutlined,
  LockOutlined,
  UnlockOutlined,
  BulbOutlined,
} from '@ant-design/icons';
import { signalRService } from '../services/signalr';
import type { DeviceInfo, VideoFrameData } from '../types/device';
import { H264Decoder, LogLevel } from '../utils/H264Decoder';

// Base64 转换的复用池，避免重复分配内存
class Base64BufferPool {
  private buffers: Uint8Array[] = [];
  private readonly maxSize = 5;
  private readonly bufferSize = 512 * 1024; // 512KB

  constructor() {
    // 预分配buffers
    for (let i = 0; i < this.maxSize; i++) {
      this.buffers.push(new Uint8Array(this.bufferSize));
    }
  }

  getBuffer(size: number): Uint8Array {
    if (size > this.bufferSize) {
      return new Uint8Array(size);
    }

    const buffer = this.buffers.pop();
    if (buffer) {
      return buffer.subarray(0, size);
    }

    return new Uint8Array(size);
  }

  returnBuffer(buffer: Uint8Array): void {
    if (buffer.length === this.bufferSize && this.buffers.length < this.maxSize) {
      this.buffers.push(buffer);
    }
  }

  // 优化的 Base64 解码
  decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = this.getBuffer(len);

    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }
}

interface RemoteControlProps {
  device: DeviceInfo;
}

const RemoteControl: React.FC<RemoteControlProps> = ({ device }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<H264Decoder | null>(null);
  const dragStateRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [blackScreenAlpha, setBlackScreenAlpha] = useState(245);
  const [isBlackScreen, setIsBlackScreen] = useState(false);
  const [isRemoteControlReady, setIsRemoteControlReady] = useState(false);
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('low');
  const qualityRef = useRef<'low' | 'medium' | 'high'>('low');
  const DRAG_THRESHOLD = 5;
  // 保存视频帧处理函数的引用，用于精确移除
  const videoFrameHandlerRef = useRef<((data: VideoFrameData) => Promise<void>) | null>(null);

  // 添加背压控制相关的状态
  const frameQueueRef = useRef<VideoFrameData[]>([]);
  const isProcessingRef = useRef(false);
  const droppedFramesCountRef = useRef(0);
  const processedFramesCountRef = useRef(0);
  const lastRenderTimeRef = useRef<number>(0);

  // 背压控制参数 - 优化为更激进的策略
  const MAX_DECODE_QUEUE_SIZE = 2;  // WebCodecs 解码队列最大值，降低到2

  // 创建Base64 Buffer池实例
  const base64BufferPoolRef = useRef<Base64BufferPool>(new Base64BufferPool());

  // 使用 ref 来跟踪状态，避免依赖数组问题
  const isCapturingRef = useRef(isCapturing);
  const isRemoteControlReadyRef = useRef(isRemoteControlReady);

  // 更新 ref 当状态改变时
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  useEffect(() => {
    isRemoteControlReadyRef.current = isRemoteControlReady;
  }, [isRemoteControlReady]);

  useEffect(() => {
    qualityRef.current = quality;
  }, [quality]);

  useEffect(() => {
    let isInitializing = false;
    let cleanupExecuted = false; // 防止重复清理

    // 定义清理函数，可以在多个地方调用
    const executeCleanup = async () => {
      if (cleanupExecuted) return;
      cleanupExecuted = true;

      console.log('[RemoteControl] 执行清理...');

      // 清理视频帧监听器（重要！使用保存的引用进行精确移除）
      if (videoFrameHandlerRef.current) {
        console.log('[RemoteControl] 精确移除视频帧监听器...');
        signalRService.offReceiveVideoFrame(videoFrameHandlerRef.current);
        videoFrameHandlerRef.current = null;
      }

      // 清空帧队列
      frameQueueRef.current = [];
      isProcessingRef.current = false;

      try {
        // 1. 关闭 H.264 解码器
        if (decoderRef.current) {
          console.log('[RemoteControl] 关闭 H.264 解码器...');
          decoderRef.current.close();
          decoderRef.current = null;
        }

        // 2. 停止屏幕捕获（使用 ref 获取最新状态）
        if (isCapturingRef.current) {
          console.log('[RemoteControl] 停止屏幕捕获...');
          await signalRService.stopScreenCapture(device.deviceId);
        }

        // 3. 停止遥控模式（使用 ref 获取最新状态）
        if (isRemoteControlReadyRef.current) {
          console.log('[RemoteControl] 停止遥控模式...');
          await signalRService.stopScreenControl(device.deviceId);
        }

        // 4. 离开设备组
        console.log('[RemoteControl] 离开设备组...');
        await signalRService.leaveDeviceGroup(device.deviceId);
      } catch (error) {
        console.error('[RemoteControl] 清理时出错:', error);
      }
    };

    // beforeunload 事件处理 - 处理页面刷新/关闭
    const handleBeforeUnload = () => {
      console.log('[RemoteControl] 页面即将卸载，执行紧急清理...');

      // 使用 sendBeacon 发送停止命令（使用 ref 获取最新状态）
      if (isCapturingRef.current) {
        const stopCaptureData = JSON.stringify({
          deviceId: device.deviceId,
          action: 'stopScreenCapture'
        });
        navigator.sendBeacon('/api/device/stop-capture', stopCaptureData);
      }

      if (isRemoteControlReadyRef.current) {
        const stopControlData = JSON.stringify({
          deviceId: device.deviceId,
          action: 'stopScreenControl'
        });
        navigator.sendBeacon('/api/device/stop-control', stopControlData);
      }

      // 尝试同步清理（可能来不及完成）
      if (decoderRef.current) {
        try {
          decoderRef.current.close();
        } catch (err) {
          console.error('[RemoteControl] 紧急关闭解码器失败:', err);
        }
      }

      // 清理监听器
      if (videoFrameHandlerRef.current) {
        signalRService.offReceiveVideoFrame(videoFrameHandlerRef.current);
      }
    };

    // 注册 beforeunload 事件
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 等待SignalR连接成功后再初始化
    const initRemoteControl = async () => {
      if (isInitializing) return;
      isInitializing = true;

      try {
        // 等待SignalR连接就绪
        let retries = 0;
        while (retries < 10) {
          if (signalRService.isConnected()) {
            console.log('[RemoteControl] SignalR已连接，开始初始化...');
            break;
          }
          console.log(`[RemoteControl] 等待SignalR连接... (${retries + 1}/10)`);
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }

        if (retries >= 10) {
          message.error('SignalR连接超时，请刷新页面重试');
          return;
        }

        // 加入设备组以接收视频流
        await signalRService.joinDeviceGroup(device.deviceId);
        console.log('[RemoteControl] 已加入设备组');

        // 启动遥控模式（关键！必须先启动才能使用 Home/Back/Task 等控制命令）
        console.log('[RemoteControl] 启动遥控模式...');
        const controlSuccess = await signalRService.startScreenControl(device.deviceId);
        if (controlSuccess) {
          console.log('[RemoteControl] 遥控模式已启动');
          setIsRemoteControlReady(true);
          message.success('遥控模式已启动，请点击"开始投屏"查看屏幕', 2);
        } else {
          console.error('[RemoteControl] 启动遥控模式失败');
          message.warning('启动遥控模式失败，控制功能可能不可用', 2);
        }

        // 初始化 H.264 解码器
        if (canvasRef.current && !decoderRef.current) {
          try {
            console.log('[RemoteControl] 初始化 H.264 解码器...');
            const decoder = new H264Decoder(canvasRef.current);

            // 设置日志级别为 WARN，减少控制台输出
            decoder.setLogLevel(LogLevel.WARN);

            await decoder.initialize();
            decoderRef.current = decoder;
            console.log('[RemoteControl] H.264 解码器初始化成功，日志级别设置为 WARN');
          } catch (error) {
            console.error('[RemoteControl] H.264 解码器初始化失败:', error);
            message.error('视频解码器初始化失败，可能不支持 H.264 解码', 3);
          }
        }

        // 先定义 processFrameQueue 函数，这样 videoFrameHandler 可以引用它
        const processFrameQueue = async () => {
          while (frameQueueRef.current.length > 0 && decoderRef.current) {
            // 检查解码队列大小
            const queueSize = decoderRef.current.getDecodeQueueSize();

            // 如果队列过载，直接清空所有待处理帧，只保留最新的
            if (queueSize > MAX_DECODE_QUEUE_SIZE) {
              const totalFrames = frameQueueRef.current.length;
              // 保留最后一帧
              const lastFrame = frameQueueRef.current[frameQueueRef.current.length - 1];
              frameQueueRef.current = [lastFrame];
              droppedFramesCountRef.current += totalFrames - 1;

              console.log(`[RemoteControl] 解码队列过载(size=${queueSize})，丢弃 ${totalFrames - 1} 帧，只保留最新帧`);

              // 等待解码队列有空间
              await new Promise(resolve => setTimeout(resolve, 10));
              continue;
            }

            const data = frameQueueRef.current.shift();
            if (!data) break;

            try {
              // 再次检查解码器状态和队列
              if (decoderRef.current.getDecodeQueueSize() > MAX_DECODE_QUEUE_SIZE) {
                droppedFramesCountRef.current++;
                console.log(`[RemoteControl] 跳过帧解码，队列大小: ${decoderRef.current.getDecodeQueueSize()}`);
                continue; // 直接跳过这一帧，不进行解码
              }

              // 使用池化的Buffer进行 Base64 转换，避免频繁内存分配
              const bytes = base64BufferPoolRef.current.decodeBase64(data.frameData);

              // 解码视频帧
              await decoderRef.current.decode(bytes);
              processedFramesCountRef.current++;

              // 归还 buffer 到池中（如果是池中的buffer）
              base64BufferPoolRef.current.returnBuffer(bytes);

              // 记录性能统计
              if ((droppedFramesCountRef.current > 0 || processedFramesCountRef.current > 0)
                  && processedFramesCountRef.current % 30 === 0) {
                const dropRate = (droppedFramesCountRef.current / (droppedFramesCountRef.current + processedFramesCountRef.current) * 100).toFixed(1);
                console.log(`[RemoteControl] 性能统计 - 处理: ${processedFramesCountRef.current}, 丢弃: ${droppedFramesCountRef.current}, 丢帧率: ${dropRate}%, 队列: ${queueSize}`);
              }
            } catch (error) {
              console.error('[RemoteControl] 处理视频帧失败:', error);
            }
          }

          isProcessingRef.current = false;

          // 如果还有待处理的帧，继续处理
          if (frameQueueRef.current.length > 0) {
            isProcessingRef.current = true;
            // 使用 requestAnimationFrame 而不是 setTimeout
            requestAnimationFrame(() => processFrameQueue());
          }
        };

        // 创建视频帧处理函数并保存引用（重要！用于精确移除）
        const videoFrameHandler = async (data: VideoFrameData) => {
          if (data.deviceId !== device.deviceId) return;

          // 根据画质限制最大解码帧率，优先保证流畅和CPU占用
          const quality = qualityRef.current;
          let minInterval = 0;
          if (quality === 'low') {
            minInterval = 100; // 约 10 FPS（最低画质，最省CPU）
          } else if (quality === 'medium') {
            minInterval = 50; // 约 20 FPS
          } else {
            minInterval = 33; // 约 30 FPS
          }

          const now = performance.now();
          if (now - lastRenderTimeRef.current < minInterval) {
            // 直接丢弃当前帧，减少CPU占用
            droppedFramesCountRef.current++;
            if (droppedFramesCountRef.current % 20 === 0) {
              console.log(`[RemoteControl] 画质=${quality}，为降低CPU丢弃帧 ${droppedFramesCountRef.current}`);
            }
            return;
          }
          lastRenderTimeRef.current = now;

          // 激进的背压控制：如果正在处理或队列有帧，直接替换为最新帧
          if (isProcessingRef.current || frameQueueRef.current.length > 0) {
            // 清空队列，只保留最新帧
            const oldQueueLength = frameQueueRef.current.length;
            frameQueueRef.current = [data];

            if (oldQueueLength > 0) {
              droppedFramesCountRef.current += oldQueueLength;
              if (droppedFramesCountRef.current % 10 === 0) {
                console.log(`[RemoteControl] 性能优化：已丢弃 ${droppedFramesCountRef.current} 帧，保持流畅`);
              }
            }

            // 如果没有正在处理，启动处理
            if (!isProcessingRef.current) {
              isProcessingRef.current = true;
              processFrameQueue();
            }
            return;
          }

          // 检查解码器队列
          if (decoderRef.current && decoderRef.current.getDecodeQueueSize() > MAX_DECODE_QUEUE_SIZE) {
            droppedFramesCountRef.current++;
            console.log(`[RemoteControl] 解码队列满(size=${decoderRef.current.getDecodeQueueSize()})，丢弃帧`);
            return;
          }

          // 直接处理最新帧
          frameQueueRef.current = [data];
          isProcessingRef.current = true;
          processFrameQueue();
        };

        // 保存处理函数的引用，用于后续精确移除
        videoFrameHandlerRef.current = videoFrameHandler;

        // 在SignalR连接成功后注册视频帧监听（重要！）
        console.log('[RemoteControl] 注册视频帧监听器...');
        signalRService.onReceiveVideoFrame(videoFrameHandler);
        console.log('[RemoteControl] 视频帧监听器已注册');

      } catch (error) {
        console.error('[RemoteControl] 启动遥控模式异常:', error);
        message.warning('启动遥控模式异常，控制功能可能不可用', 2);
      } finally {
        isInitializing = false;
      }
    };

    initRemoteControl();

    return () => {
      // 移除 beforeunload 事件监听器
      window.removeEventListener('beforeunload', handleBeforeUnload);

      // 执行清理
      executeCleanup();
    };
  }, [device.deviceId]); // 只依赖设备ID，不依赖其他状态

  const getCanvasCoordinates = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    return { x, y };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !canvasRef.current || !isRemoteControlReady) return;

    event.preventDefault();
    const { x, y } = getCanvasCoordinates(event);
    dragStateRef.current = {
      isDragging: true,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current?.isDragging || !canvasRef.current) return;

    const { x, y } = getCanvasCoordinates(event);
    dragStateRef.current.lastX = x;
    dragStateRef.current.lastY = y;
  };

  const handleMouseUp = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current?.isDragging || event.button !== 0 || !isRemoteControlReady) {
      return;
    }

    event.preventDefault();
    const { startX, startY, lastX, lastY } = dragStateRef.current;
    dragStateRef.current = null;

    const deltaX = lastX - startX;
    const deltaY = lastY - startY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance >= DRAG_THRESHOLD) {
      try {
        await signalRService.sendSwipe(device.deviceId, startX, startY, lastX, lastY);
      } catch (error) {
        message.error('发送滑动命令失败');
      }
    } else {
      await sendTap(lastX, lastY);
    }
  };

  const handleMouseLeave = () => {
    dragStateRef.current = null;
  };

  const handleContextMenu = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !isRemoteControlReady) return;

    event.preventDefault();
    const { x, y } = getCanvasCoordinates(event);
    await sendTap(x, y);
  };


  const handleStartCapture = async () => {
    try {
      const success = await signalRService.startScreenCapture(device.deviceId);
      if (success) {
        setIsCapturing(true);
        message.success('屏幕捕获已启动');
      } else {
        message.error('启动屏幕捕获失败');
      }
    } catch (error) {
      message.error('启动屏幕捕获失败');
    }
  };

  const handleStopCapture = async () => {
    try {
      const success = await signalRService.stopScreenCapture(device.deviceId);
      if (success) {
        setIsCapturing(false);
        message.success('屏幕捕获已停止');
      } else {
        message.error('停止屏幕捕获失败');
      }
    } catch (error) {
      message.error('停止屏幕捕获失败');
    }
  };

  const sendTap = async (x: number, y: number) => {
    try {
      await signalRService.sendTap(device.deviceId, x, y);
    } catch (error) {
      message.error('发送点击命令失败');
    }
  };

  const handleBack = async () => {
    try {
      await signalRService.sendBack(device.deviceId);
      message.success('返回键已发送');
    } catch (error) {
      message.error('发送返回键失败');
    }
  };

  const handleHome = async () => {
    try {
      await signalRService.sendHome(device.deviceId);
      message.success('Home 键已发送');
    } catch (error) {
      message.error('发送 Home 键失败');
    }
  };

  const handleTask = async () => {
    try {
      await signalRService.sendTask(device.deviceId);
      message.success('任务键已发送');
    } catch (error) {
      message.error('发送任务键失败');
    }
  };

  const handleWakeScreen = async () => {
    try {
      await signalRService.wakeScreen(device.deviceId);
      message.success('屏幕已唤醒');
    } catch (error) {
      message.error('唤醒屏幕失败');
    }
  };

  const handleLockScreen = async () => {
    try {
      await signalRService.lockScreen(device.deviceId);
      message.success('屏幕已锁定');
    } catch (error) {
      message.error('锁定屏幕失败');
    }
  };

  const handleUnlockScreen = async () => {
    try {
      await signalRService.unlockScreen(device.deviceId);
      message.success('屏幕已解锁');
    } catch (error) {
      message.error('解锁屏幕失败');
    }
  };

  const handleToggleBlackScreen = async () => {
    try {
      if (isBlackScreen) {
        await signalRService.stopBlackScreen(device.deviceId);
        setIsBlackScreen(false);
        message.success('黑屏已停止');
      } else {
        await signalRService.startBlackScreen(device.deviceId, blackScreenAlpha);
        setIsBlackScreen(true);
        message.success('黑屏已启动');
      }
    } catch (error) {
      message.error('黑屏操作失败');
    }
  };

  return (
    <Card
      title={`远程控制 - ${device.displayName}`}
      extra={
        <Space>
          <span>画质：</span>
          <Select
            size="small"
            style={{ width: 120 }}
            value={quality}
            onChange={(value) => setQuality(value as 'low' | 'medium' | 'high')}
            options={[
              { value: 'low', label: '低（省资源）' },
              { value: 'medium', label: '中' },
              { value: 'high', label: '高' },
            ]}
          />
          {isCapturing ? (
            <Button
              type="primary"
              danger
              icon={<PauseCircleOutlined />}
              onClick={handleStopCapture}
            >
              停止投屏
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartCapture}
            >
              开始投屏
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 屏幕显示区域 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: '#000',
            padding: '20px',
            borderRadius: '8px',
          }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onContextMenu={handleContextMenu}
            style={{
              maxWidth: '100%',
              maxHeight: '600px',
              cursor: isRemoteControlReady ? 'pointer' : 'not-allowed',
              border: '2px solid #1890ff',
            }} 
          />
        </div>

        {/* 控制按钮区域 */}
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 基础按键 */}
          <Card title="基础按键" size="small">
            <Space wrap>
              <Button icon={<HomeOutlined />} onClick={handleHome}>
                桌面
              </Button>
              <Button icon={<RollbackOutlined />} onClick={handleBack}>
                返回
              </Button>
              <Button icon={<AppstoreOutlined />} onClick={handleTask}>
                任务栏
              </Button>
            </Space>
          </Card>

          {/* 屏幕控制 */}
          <Card title="屏幕控制" size="small">
            <Space wrap>
              <Button icon={<BulbOutlined />} onClick={handleWakeScreen}>
                点亮
              </Button>
              <Button icon={<LockOutlined />} onClick={handleLockScreen}>
                锁定
              </Button>
              <Button icon={<UnlockOutlined />} onClick={handleUnlockScreen}>
                解锁
              </Button>
            </Space>
          </Card>

          {/* 黑屏控制 */}
          <Card title="黑屏控制" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <span>透明度: {blackScreenAlpha}</span>
                <Slider
                  min={220}
                  max={255}
                  value={blackScreenAlpha}
                  onChange={setBlackScreenAlpha}
                  disabled={isBlackScreen}
                />
              </div>
              <Button
                type={isBlackScreen ? 'primary' : 'default'}
                danger={isBlackScreen}
                onClick={handleToggleBlackScreen}
              >
                {isBlackScreen ? '停止黑屏' : '启动黑屏'}
              </Button>
            </Space>
          </Card>
        </Space>
      </Space>
    </Card>
  );
};

export default RemoteControl;
