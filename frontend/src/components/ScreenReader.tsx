import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, Button, Space, message, Switch, Slider, Spin, Alert, Tooltip, Tag } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  SaveOutlined,
  ClearOutlined,
  ReloadOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { signalRService } from '../services/signalr';
import type { DeviceInfo } from '../types/device';

interface ScreenReaderProps {
  device: DeviceInfo;
}

// UI数据结构接口
interface UIDataFrame {
  screenWidth: number;
  screenHeight: number;
  currentAppName?: string;
  currentAppPackage?: string;
  rootNode: UINode;
  frameNumber?: number;
  captureTime?: number;
}

interface UINode {
  bounds: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
  text?: string;
  className?: string;
  contentDescription?: string;
  isClickable?: boolean;
  isScrollable?: boolean;
  isChecked?: boolean;
  isEnabled?: boolean;
  isSelected?: boolean;
  isVisibleToUser?: boolean;
  children?: UINode[];
  nodeId?: string;
}

// 颜色配置
const COLORS = {
  background: '#FFFFFF',
  elementBorder: '#000000',
  clickableElement: 'rgba(144, 200, 255, 0.4)',
  textElement: 'rgba(255, 200, 150, 0.4)',
  selectedElement: 'rgba(150, 255, 150, 0.4)',
  switchOn: 'rgba(50, 200, 50, 0.6)',
  switchOff: 'rgba(150, 150, 150, 0.6)',
  imageElement: 'rgba(180, 120, 200, 0.4)',
  scrollableElement: 'rgba(255, 165, 0, 0.4)',
  disabledElement: 'rgba(128, 128, 128, 0.3)',
  hoveredElement: 'rgba(255, 255, 0, 0.5)',
};

// 帧队列配置
interface FrameQueueConfig {
  maxSize: number;
  maxLatency: number;
  dropThreshold: number;
}

// 性能统计
interface PerformanceStats {
  frameCount: number;
  droppedFrames: number;
  avgRenderTime: number;
  lastFrameTime: number;
  fps: number;
}

const ScreenReader: React.FC<ScreenReaderProps> = ({ device }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReading, setIsReading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentApp, setCurrentApp] = useState<{ name: string; package: string } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<UINode | null>(null);
  const [selectedNode, setSelectedNode] = useState<UINode | null>(null);
  const [currentFrame, setCurrentFrame] = useState<UIDataFrame | null>(null);

  // 渲染设置
  const [renderSettings, setRenderSettings] = useState({
    showClassNames: false,
    showClickable: true,
    showText: true,
    maxDepth: 50,
    minElementSize: 8,
    enableHover: true,
    enablePerformanceLog: false,
    snapshotMode: false,
  });

  // 性能相关
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({
    frameCount: 0,
    droppedFrames: 0,
    avgRenderTime: 0,
    lastFrameTime: 0,
    fps: 0,
  });

  // 帧队列管理
  const frameQueueRef = useRef<UIDataFrame[]>([]);
  const frameQueueConfig = useRef<FrameQueueConfig>({
    maxSize: 10,
    maxLatency: 1000,
    dropThreshold: 5,
  });

  // 引用管理
  const readerHandlerRef = useRef<((data: any) => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const performanceIntervalRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const nodeMapRef = useRef<Map<string, UINode>>(new Map());

  // 清理函数
  const cleanup = useCallback(() => {
    // 清理监听器
    if (readerHandlerRef.current && signalRService.connection) {
      signalRService.connection.off('ReceiveReaderFrame', readerHandlerRef.current);
      readerHandlerRef.current = null;
    }

    // 清理动画帧
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 清理定时器
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (performanceIntervalRef.current) {
      clearInterval(performanceIntervalRef.current);
      performanceIntervalRef.current = null;
    }

    // 清空队列
    frameQueueRef.current = [];
    nodeMapRef.current.clear();
  }, []);

  // 处理 SignalR 重连
  const handleSignalRReconnection = useCallback(() => {
    if (isReading && readerHandlerRef.current && signalRService.connection) {
      signalRService.connection.on('ReceiveReaderFrame', readerHandlerRef.current);
      message.info('SignalR 已重连，恢复数据接收');
    }
  }, [isReading]);

  // 监听 SignalR 连接状态
  useEffect(() => {
    const handleReconnected = () => {
      handleSignalRReconnection();
    };

    const handleReconnecting = () => {
      setError('连接中断，正在重连...');
    };

    const handleDisconnected = () => {
      setError('连接已断开');
      if (isReading) {
        // 尝试自动重连
        reconnectTimeoutRef.current = setTimeout(() => {
          handleStart();
        }, 3000);
      }
    };

    if (signalRService.connection) {
      signalRService.connection.on('Reconnected', handleReconnected);
      signalRService.connection.on('Reconnecting', handleReconnecting);
      signalRService.connection.on('Disconnected', handleDisconnected);
    }

    return () => {
      if (signalRService.connection) {
        signalRService.connection.off('Reconnected', handleReconnected);
        signalRService.connection.off('Reconnecting', handleReconnecting);
        signalRService.connection.off('Disconnected', handleDisconnected);
      }
    };
  }, [isReading, handleSignalRReconnection]);

  // 性能监控
  useEffect(() => {
    if (renderSettings.enablePerformanceLog && isReading) {
      performanceIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const timeDiff = now - lastRenderTimeRef.current;
        const fps = timeDiff > 0 ? 1000 / timeDiff : 0;

        setPerformanceStats(prev => ({
          ...prev,
          fps: Math.round(fps),
        }));

        if (renderSettings.enablePerformanceLog) {
          console.log('[ScreenReader Performance]', {
            fps: Math.round(fps),
            frameCount: performanceStats.frameCount,
            droppedFrames: performanceStats.droppedFrames,
            queueSize: frameQueueRef.current.length,
            avgRenderTime: `${performanceStats.avgRenderTime.toFixed(2)}ms`,
          });
        }
      }, 1000);
    }

    return () => {
      if (performanceIntervalRef.current) {
        clearInterval(performanceIntervalRef.current);
        performanceIntervalRef.current = null;
      }
    };
  }, [renderSettings.enablePerformanceLog, isReading, performanceStats]);

  // 处理帧队列
  const processFrameQueue = useCallback(() => {
    if (frameQueueRef.current.length === 0) {
      animationFrameRef.current = requestAnimationFrame(processFrameQueue);
      return;
    }

    const startTime = performance.now();
    const frame = frameQueueRef.current.shift();

    if (frame) {
      // 检查帧延迟
      const now = Date.now();
      const latency = frame.captureTime ? now - frame.captureTime : 0;

      if (latency > frameQueueConfig.current.maxLatency) {
        // 帧太旧，丢弃
        setPerformanceStats(prev => ({
          ...prev,
          droppedFrames: prev.droppedFrames + 1,
        }));

        // 如果队列太长，清空旧帧
        if (frameQueueRef.current.length > frameQueueConfig.current.dropThreshold) {
          const dropped = frameQueueRef.current.length;
          frameQueueRef.current = frameQueueRef.current.slice(-2);
          setPerformanceStats(prev => ({
            ...prev,
            droppedFrames: prev.droppedFrames + dropped,
          }));
        }
      } else {
        // 渲染帧
        renderUIStructure(frame);
        setCurrentFrame(frame);

        const renderTime = performance.now() - startTime;
        lastRenderTimeRef.current = now;

        setPerformanceStats(prev => ({
          ...prev,
          frameCount: prev.frameCount + 1,
          avgRenderTime: (prev.avgRenderTime * prev.frameCount + renderTime) / (prev.frameCount + 1),
          lastFrameTime: now,
        }));
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrameQueue);
  }, []);

  // 创建阅读器数据处理函数
  const createReaderHandler = useCallback(() => {
    return (data: any) => {
      if (data.deviceId !== device.deviceId) return;

      try {
        const uiData: UIDataFrame = JSON.parse(data.uiData);

        // 添加时间戳和帧号
        uiData.captureTime = data.timestamp || Date.now();
        uiData.frameNumber = performanceStats.frameCount + 1;

        if (renderSettings.enablePerformanceLog) {
          console.log('[ScreenReader] 收到UI数据:', {
            app: uiData.currentAppName,
            screenSize: `${uiData.screenWidth}x${uiData.screenHeight}`,
            frameNumber: uiData.frameNumber,
          });
        }

        // 更新当前应用信息
        if (uiData.currentAppName) {
          setCurrentApp({
            name: uiData.currentAppName,
            package: uiData.currentAppPackage || '',
          });
        }

        // 快照模式：直接渲染
        if (renderSettings.snapshotMode) {
          renderUIStructure(uiData);
          setCurrentFrame(uiData);
          return;
        }

        // 添加到帧队列
        if (frameQueueRef.current.length >= frameQueueConfig.current.maxSize) {
          // 队列满，丢弃最旧的帧
          frameQueueRef.current.shift();
          setPerformanceStats(prev => ({
            ...prev,
            droppedFrames: prev.droppedFrames + 1,
          }));
        }

        frameQueueRef.current.push(uiData);
        setError(null);
      } catch (error) {
        console.error('[ScreenReader] 解析UI数据失败:', error);
        setError('解析UI数据失败，请检查数据格式');
      }
    };
  }, [device.deviceId, renderSettings.snapshotMode, renderSettings.enablePerformanceLog, performanceStats.frameCount]);

  useEffect(() => {
    readerHandlerRef.current = createReaderHandler();
  }, [createReaderHandler]);

  // 启动帧处理循环
  useEffect(() => {
    if (isReading && !renderSettings.snapshotMode) {
      animationFrameRef.current = requestAnimationFrame(processFrameQueue);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isReading, renderSettings.snapshotMode, processFrameQueue]);

  // 组件卸载和页面刷新时的清理
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      if (isReading) {
        e.preventDefault();
        e.returnValue = '屏幕阅读器正在运行，确定要离开吗？';

        // 尝试停止阅读器
        try {
          await signalRService.connection?.invoke<boolean>(
            'StopScreenReader',
            device.deviceId
          );
        } catch (error) {
          console.error('[ScreenReader] 页面卸载时停止失败:', error);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      cleanup();

      // 组件卸载时停止阅读器
      if (isReading) {
        handleStop();
      }
    };
  }, [isReading, device.deviceId, cleanup]);

  // 渲染UI结构到Canvas
  const renderUIStructure = (uiData: UIDataFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置Canvas尺寸
    const targetWidth = 720;
    const targetHeight = 1280;
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    // 计算缩放比例
    const scaleX = targetWidth / uiData.screenWidth;
    const scaleY = targetHeight / uiData.screenHeight;
    const scale = Math.min(scaleX, scaleY);

    // 清空画布
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    // 设置渲染属性
    ctx.save();
    ctx.scale(scale, scale);

    // 清空节点映射
    nodeMapRef.current.clear();

    // 递归渲染节点
    let nodeCount = 0;
    renderNode(ctx, uiData.rootNode, 0, nodeCount, scale);

    ctx.restore();

    // 绘制图例
    drawLegend(ctx, targetWidth);

    // 显示统计信息
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.fillText(`App: ${uiData.currentAppName || 'Unknown'}`, 10, targetHeight - 60);
    ctx.fillText(`Package: ${uiData.currentAppPackage || 'N/A'}`, 10, targetHeight - 40);
    ctx.fillText(`Nodes: ${nodeMapRef.current.size}`, 10, targetHeight - 20);

    if (renderSettings.enablePerformanceLog) {
      ctx.fillText(`FPS: ${performanceStats.fps}`, targetWidth - 100, targetHeight - 40);
      ctx.fillText(`Dropped: ${performanceStats.droppedFrames}`, targetWidth - 100, targetHeight - 20);
    }
  };

  // 递归渲染节点
  const renderNode = (
    ctx: CanvasRenderingContext2D,
    node: UINode,
    depth: number,
    nodeCount: number,
    scale: number
  ): number => {
    if (!node || depth > renderSettings.maxDepth || nodeCount > 5000) {
      return nodeCount;
    }

    nodeCount++;

    const bounds = node.bounds;
    if (!bounds) return nodeCount;

    const x = bounds.left;
    const y = bounds.top;
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;

    // 生成节点ID
    node.nodeId = `${x}_${y}_${width}_${height}_${depth}`;
    nodeMapRef.current.set(node.nodeId, node);

    // 跳过太小的元素
    if (width < renderSettings.minElementSize || height < renderSettings.minElementSize) {
      return nodeCount;
    }

    // 检查可见性
    if (node.isVisibleToUser === false) {
      return nodeCount;
    }

    // 绘制元素背景
    ctx.save();

    // 检查是否为悬停或选中的节点
    const isHovered = hoveredNode?.nodeId === node.nodeId;
    const isSelected = selectedNode?.nodeId === node.nodeId;

    // 处理特殊元素类型
    const className = node.className || '';

    // Switch/CheckBox
    if (className.includes('Switch') || className.includes('CheckBox')) {
      ctx.fillStyle = node.isChecked ? COLORS.switchOn : COLORS.switchOff;
      ctx.fillRect(x, y, width, height);

      // 绘制开关状态
      const switchWidth = Math.min(70, width - 10);
      const switchHeight = 24;
      const switchX = x + width - switchWidth - 5;
      const switchY = y + (height - switchHeight) / 2;

      ctx.fillStyle = node.isChecked ? COLORS.switchOn : COLORS.switchOff;
      ctx.fillRect(switchX, switchY, switchWidth, switchHeight);

      // 绘制滑块
      ctx.fillStyle = '#FFFFFF';
      const knobX = node.isChecked ? switchX + switchWidth - 20 : switchX + 5;
      ctx.beginPath();
      ctx.arc(knobX + 10, switchY + 12, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    // ImageView
    else if (className.includes('Image')) {
      ctx.fillStyle = COLORS.imageElement;
      ctx.fillRect(x, y, width, height);

      // 绘制图片图标
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + width/4, y + height/4, width/2, height/2);

      // 绘制对角线表示图片
      ctx.beginPath();
      ctx.moveTo(x + width/4, y + 3*height/4);
      ctx.lineTo(x + 3*width/4, y + height/4);
      ctx.stroke();
    }
    // ScrollView/RecyclerView/ListView
    else if (className.includes('RecyclerView') || className.includes('ListView') || className.includes('ScrollView')) {
      ctx.fillStyle = COLORS.scrollableElement;
      ctx.fillRect(x, y, width, height);

      // 绘制滚动条
      if (node.isScrollable) {
        const scrollbarWidth = 8;
        const scrollbarX = x + width - scrollbarWidth - 4;
        ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
        ctx.fillRect(scrollbarX, y + 6, scrollbarWidth, height - 12);

        // 绘制滚动条滑块
        ctx.fillStyle = 'rgba(128, 128, 128, 0.6)';
        ctx.fillRect(scrollbarX, y + 10, scrollbarWidth, Math.max(50, height / 4));
      }
    }
    // 可点击元素
    else if (node.isClickable && renderSettings.showClickable) {
      ctx.fillStyle = COLORS.clickableElement;
      ctx.fillRect(x, y, width, height);
    }

    // 绘制文本
    if (node.text && renderSettings.showText) {
      ctx.fillStyle = COLORS.textElement;
      ctx.fillRect(x, y, width, height);

      // 绘制文本内容
      ctx.fillStyle = '#000000';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const text = node.text.length > 50 ? node.text.substring(0, 47) + '...' : node.text;
      ctx.fillText(text, x + width/2, y + height/2);
    }

    // 绘制悬停效果
    if (isHovered && renderSettings.enableHover) {
      ctx.fillStyle = COLORS.hoveredElement;
      ctx.fillRect(x, y, width, height);

      // 绘制提示框
      drawNodeTooltip(ctx, node, x, y, width, height);
    }

    // 绘制选中状态
    if (isSelected || node.isSelected) {
      ctx.strokeStyle = COLORS.selectedElement;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    }

    // 绘制禁用状态
    if (node.isEnabled === false) {
      ctx.fillStyle = COLORS.disabledElement;
      ctx.fillRect(x, y, width, height);
    }

    // 绘制边框
    ctx.strokeStyle = COLORS.elementBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    // 显示类名（如果开启）
    if (renderSettings.showClassNames && className) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fillRect(x + 2, y + 2, 100, 16);

      ctx.fillStyle = '#0066CC';
      ctx.font = '10px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const shortName = className.split('.').pop() || className;
      ctx.fillText(shortName.substring(0, 15), x + 4, y + 4);
    }

    ctx.restore();

    // 递归渲染子节点
    if (node.children) {
      for (const child of node.children) {
        nodeCount = renderNode(ctx, child, depth + 1, nodeCount, scale);
      }
    }

    return nodeCount;
  };

  // 绘制节点提示框
  const drawNodeTooltip = (
    ctx: CanvasRenderingContext2D,
    node: UINode,
    x: number,
    y: number,
    width: number,
    height: number
  ) => {
    const tooltipLines = [];
    if (node.text) tooltipLines.push(`Text: ${node.text}`);
    if (node.className) tooltipLines.push(`Class: ${node.className.split('.').pop()}`);
    if (node.contentDescription) tooltipLines.push(`Desc: ${node.contentDescription}`);
    tooltipLines.push(`Clickable: ${node.isClickable ? 'Yes' : 'No'}`);
    tooltipLines.push(`Size: ${width}x${height}`);

    const tooltipHeight = tooltipLines.length * 16 + 10;
    const tooltipWidth = 200;
    const tooltipX = x + width + 10;
    const tooltipY = y;

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);

    // 文本
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    tooltipLines.forEach((line, index) => {
      ctx.fillText(line, tooltipX + 5, tooltipY + 5 + index * 16);
    });
  };

  // 绘制图例
  const drawLegend = (ctx: CanvasRenderingContext2D, width: number) => {
    const legendY = 5;
    const legendHeight = 30;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(5, legendY, width - 10, legendHeight);

    let x = 10;
    const items = [
      { color: COLORS.clickableElement, label: '可点击' },
      { color: COLORS.textElement, label: '文本' },
      { color: COLORS.switchOn, label: '开关' },
      { color: COLORS.imageElement, label: '图片' },
      { color: COLORS.scrollableElement, label: '可滚动' },
      { color: COLORS.hoveredElement, label: '悬停' },
    ];

    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const item of items) {
      // 绘制颜色块
      ctx.fillStyle = item.color;
      ctx.fillRect(x, legendY + 7, 16, 16);

      // 绘制标签
      ctx.fillStyle = '#333';
      ctx.fillText(item.label, x + 20, legendY + 15);

      x += 75;
    }
  };

  // Canvas 鼠标事件处理
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!renderSettings.enableHover || !currentFrame) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    // 计算缩放比例
    const scaleX = canvas.width / currentFrame.screenWidth;
    const scaleY = canvas.height / currentFrame.screenHeight;
    const scale = Math.min(scaleX, scaleY);

    // 转换为原始坐标
    const originalX = x / scale;
    const originalY = y / scale;

    // 查找悬停的节点
    let foundNode: UINode | null = null;
    nodeMapRef.current.forEach((node) => {
      if (node.bounds &&
          originalX >= node.bounds.left &&
          originalX <= node.bounds.right &&
          originalY >= node.bounds.top &&
          originalY <= node.bounds.bottom) {
        foundNode = node;
      }
    });

    if (foundNode !== hoveredNode) {
      setHoveredNode(foundNode);
      // 重新渲染以显示悬停效果
      if (currentFrame) {
        renderUIStructure(currentFrame);
      }
    }
  }, [renderSettings.enableHover, currentFrame, hoveredNode]);

  const handleCanvasClick = useCallback(() => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
      if (currentFrame) {
        renderUIStructure(currentFrame);
      }
    }
  }, [hoveredNode, currentFrame]);

  const handleStart = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 确保 SignalR 已连接
      if (!signalRService.isConnected()) {
        const msg = '实时通信未连接，请稍后再试或刷新页面';
        console.warn('[ScreenReader] 启动失败：SignalR 未连接');
        setError(msg);
        message.error(msg);
        return;
      }

      // 先加入设备组
      await signalRService.joinDeviceGroup(device.deviceId);

      // 注册监听器
      if (readerHandlerRef.current && signalRService.connection) {
        signalRService.connection.on('ReceiveReaderFrame', readerHandlerRef.current);
      }

      // 启动桌面阅读器
      const success = await signalRService.connection?.invoke<boolean>(
        'StartScreenReader',
        device.deviceId
      );

      if (success) {
        setIsReading(true);
        message.success('桌面阅读器已启动');
      } else {
        setError('启动桌面阅读器失败');
        message.error('启动桌面阅读器失败');
      }
    } catch (error) {
      console.error('[ScreenReader] 启动失败:', error);
      setError('启动桌面阅读器失败: ' + (error as Error).message);
      message.error('启动桌面阅读器失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setIsLoading(true);

      // 停止桌面阅读器
      const success = await signalRService.connection?.invoke<boolean>(
        'StopScreenReader',
        device.deviceId
      );

      if (success) {
        setIsReading(false);
        message.success('桌面阅读器已停止');
      }

      // 清理
      cleanup();

      // 离开设备组
      await signalRService.leaveDeviceGroup(device.deviceId);

      setError(null);
    } catch (error) {
      console.error('[ScreenReader] 停止失败:', error);
      setError('停止桌面阅读器失败: ' + (error as Error).message);
      message.error('停止桌面阅读器失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 将Canvas转换为图片并下载
    const link = document.createElement('a');
    link.download = `screen-reader-${device.deviceId}-${Date.now()}.png`;
    link.href = canvas.toDataURL();
    link.click();

    message.success('UI结构图已保存');
  };

  const handleExportJSON = () => {
    if (!currentFrame) {
      message.warning('当前没有UI数据可导出');
      return;
    }

    const dataStr = JSON.stringify(currentFrame, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);

    const link = document.createElement('a');
    link.download = `ui-structure-${device.deviceId}-${Date.now()}.json`;
    link.href = dataUri;
    link.click();

    message.success('UI结构JSON已导出');
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCurrentApp(null);
    setCurrentFrame(null);
    setHoveredNode(null);
    setSelectedNode(null);
    nodeMapRef.current.clear();
    message.info('画布已清空');
  };

  const handleSnapshot = async () => {
    if (!isReading) {
      message.warning('请先启动屏幕阅读器');
      return;
    }

    try {
      setIsLoading(true);
      message.info('正在获取快照...');

      // 临时切换到快照模式
      setRenderSettings(prev => ({ ...prev, snapshotMode: true }));

      // 等待下一帧
      setTimeout(() => {
        setRenderSettings(prev => ({ ...prev, snapshotMode: false }));
        message.success('快照已获取');
      }, 2000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card
      title={
        <Space>
          <span>桌面阅读器 - {device.displayName}</span>
          {isReading && <Tag color="green">运行中</Tag>}
          {error && <Tag color="red">错误</Tag>}
        </Space>
      }
      extra={
        <Space>
          {currentApp && (
            <Tooltip title="当前应用包名">
              <span style={{ marginRight: 16, color: '#666' }}>
                <InfoCircleOutlined /> {currentApp.name}
              </span>
            </Tooltip>
          )}
          {renderSettings.enablePerformanceLog && (
            <Tag>FPS: {performanceStats.fps}</Tag>
          )}
          {isReading ? (
            <Button
              type="primary"
              danger
              icon={<PauseCircleOutlined />}
              onClick={handleStop}
              loading={isLoading}
            >
              停止读取
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
              loading={isLoading}
            >
              开始读取
            </Button>
          )}
        </Space>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 错误提示 */}
        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            icon={<WarningOutlined />}
            closable
            onClose={() => setError(null)}
          />
        )}

        {/* 无数据提示 */}
        {isReading && !currentFrame && !error && (
          <Alert
            message="等待数据"
            description="正在等待安卓端的无障碍数据，请确保设备已开启无障碍服务"
            type="info"
            showIcon
          />
        )}

        {/* UI结构显示区域 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: '#f0f0f0',
            padding: '20px',
            borderRadius: '8px',
            position: 'relative',
          }}
        >
          {isLoading && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 10,
            }}>
              <Spin size="large" />
            </div>
          )}
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '600px',
              border: '2px solid #d9d9d9',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: renderSettings.enableHover ? 'crosshair' : 'default',
            }}
            onMouseMove={handleCanvasMouseMove}
            onClick={handleCanvasClick}
            onMouseLeave={() => setHoveredNode(null)}
          />
        </div>

        {/* 选中节点信息 */}
        {selectedNode && (
          <Card title="选中节点信息" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div><strong>类名:</strong> {selectedNode.className || 'N/A'}</div>
              <div><strong>文本:</strong> {selectedNode.text || 'N/A'}</div>
              <div><strong>描述:</strong> {selectedNode.contentDescription || 'N/A'}</div>
              <div><strong>可点击:</strong> {selectedNode.isClickable ? '是' : '否'}</div>
              <div><strong>已启用:</strong> {selectedNode.isEnabled !== false ? '是' : '否'}</div>
              <div><strong>边界:</strong> {`(${selectedNode.bounds.left}, ${selectedNode.bounds.top}) - (${selectedNode.bounds.right}, ${selectedNode.bounds.bottom})`}</div>
            </Space>
          </Card>
        )}

        {/* 控制选项 */}
        <Card title="渲染选项" size="small">
          <Space direction="vertical" style={{ width: '100%' }}>
            <Space wrap>
              <span>显示类名:</span>
              <Switch
                checked={renderSettings.showClassNames}
                onChange={(checked) =>
                  setRenderSettings({ ...renderSettings, showClassNames: checked })
                }
              />
              <span style={{ marginLeft: 20 }}>显示可点击:</span>
              <Switch
                checked={renderSettings.showClickable}
                onChange={(checked) =>
                  setRenderSettings({ ...renderSettings, showClickable: checked })
                }
              />
              <span style={{ marginLeft: 20 }}>显示文本:</span>
              <Switch
                checked={renderSettings.showText}
                onChange={(checked) =>
                  setRenderSettings({ ...renderSettings, showText: checked })
                }
              />
              <span style={{ marginLeft: 20 }}>启用悬停:</span>
              <Switch
                checked={renderSettings.enableHover}
                onChange={(checked) =>
                  setRenderSettings({ ...renderSettings, enableHover: checked })
                }
              />
              <span style={{ marginLeft: 20 }}>性能日志:</span>
              <Switch
                checked={renderSettings.enablePerformanceLog}
                onChange={(checked) =>
                  setRenderSettings({ ...renderSettings, enablePerformanceLog: checked })
                }
              />
            </Space>

            <div>
              <span>最大渲染深度: {renderSettings.maxDepth}</span>
              <Slider
                min={10}
                max={100}
                value={renderSettings.maxDepth}
                onChange={(value) =>
                  setRenderSettings({ ...renderSettings, maxDepth: value })
                }
              />
            </div>

            <div>
              <span>最小元素尺寸: {renderSettings.minElementSize}px</span>
              <Slider
                min={1}
                max={20}
                value={renderSettings.minElementSize}
                onChange={(value) =>
                  setRenderSettings({ ...renderSettings, minElementSize: value })
                }
              />
            </div>
          </Space>
        </Card>

        {/* 性能统计 */}
        {renderSettings.enablePerformanceLog && (
          <Card title="性能统计" size="small">
            <Space>
              <Tag>总帧数: {performanceStats.frameCount}</Tag>
              <Tag color="orange">丢帧数: {performanceStats.droppedFrames}</Tag>
              <Tag color="blue">平均渲染时间: {performanceStats.avgRenderTime.toFixed(2)}ms</Tag>
              <Tag color="green">FPS: {performanceStats.fps}</Tag>
              <Tag>队列长度: {frameQueueRef.current.length}</Tag>
            </Space>
          </Card>
        )}

        {/* 操作按钮 */}
        <Space wrap>
          <Button icon={<SaveOutlined />} onClick={handleSaveCanvas}>
            保存为图片
          </Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportJSON}>
            导出JSON
          </Button>
          <Button icon={<ClearOutlined />} onClick={handleClearCanvas}>
            清空画布
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleSnapshot}
            disabled={!isReading}
          >
            获取快照
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default ScreenReader;