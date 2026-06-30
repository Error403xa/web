/**
 * H.264 视频解码器 - 性能优化版
 * 使用 WebCodecs API 解码 H.264 NAL 数据并渲染到 Canvas
 */

interface NALUnit {
  type: number;
  data: Uint8Array;
}

// 日志级别枚举
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

// 性能统计
interface PerformanceStats {
  decodedFrames: number;
  droppedFrames: number;
  peakQueueSize: number;
  avgDecodeTime: number;
  lastReportTime: number;
}

export class H264Decoder {
  private decoder: VideoDecoder | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private isConfigured = false;
  private frameCount = 0;
  private sps: Uint8Array | null = null;
  private pps: Uint8Array | null = null;
  private pendingFrames: Uint8Array[] = [];

  // 性能优化相关
  private logLevel: LogLevel = LogLevel.WARN;
  private stats: PerformanceStats = {
    decodedFrames: 0,
    droppedFrames: 0,
    peakQueueSize: 0,
    avgDecodeTime: 0,
    lastReportTime: Date.now()
  };

  // Buffer复用池 - 避免重复分配
  private bufferPool: Uint8Array[] = [];
  private readonly MAX_BUFFER_POOL_SIZE = 5;
  private readonly BUFFER_SIZE = 256 * 1024; // 256KB per buffer

  // 性能阈值
  private readonly MAX_DECODE_QUEUE = 2;
  private readonly STATS_REPORT_INTERVAL = 5000; // 5秒报告一次

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.initializeBufferPool();
  }

  /**
   * 初始化Buffer池
   */
  private initializeBufferPool(): void {
    for (let i = 0; i < this.MAX_BUFFER_POOL_SIZE; i++) {
      this.bufferPool.push(new Uint8Array(this.BUFFER_SIZE));
    }
  }

  /**
   * 从池中获取Buffer
   */
  private getPooledBuffer(size: number): Uint8Array {
    if (size > this.BUFFER_SIZE) {
      return new Uint8Array(size);
    }

    const buffer = this.bufferPool.pop();
    if (buffer) {
      return buffer.subarray(0, size);
    }

    return new Uint8Array(size);
  }

  // /**
  //  * 归还Buffer到池中（当前未使用，保留以备后续优化）
  //  */
  // private returnBufferToPool(buffer: Uint8Array): void {
  //   if (buffer.length === this.BUFFER_SIZE && this.bufferPool.length < this.MAX_BUFFER_POOL_SIZE) {
  //     this.bufferPool.push(buffer);
  //   }
  // }

  /**
   * 设置日志级别
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * 条件日志
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level <= this.logLevel) {
      const prefix = `[H264Decoder][${LogLevel[level]}]`;
      switch (level) {
        case LogLevel.ERROR:
          console.error(prefix, message, ...args);
          break;
        case LogLevel.WARN:
          console.warn(prefix, message, ...args);
          break;
        case LogLevel.INFO:
          console.info(prefix, message, ...args);
          break;
        case LogLevel.DEBUG:
          console.log(prefix, message, ...args);
          break;
      }
    }
  }

  /**
   * 初始化解码器
   */
  async initialize(): Promise<void> {
    if (!('VideoDecoder' in window)) {
      throw new Error('当前浏览器不支持 WebCodecs API，请使用 Chrome 94+ 或 Edge 94+');
    }

    try {
      this.decoder = new VideoDecoder({
        output: (frame) => this.handleFrame(frame),
        error: (error) => {
          this.log(LogLevel.ERROR, '解码错误:', error.message, error);
        },
      });

      this.log(LogLevel.INFO, '解码器实例创建成功');
    } catch (error) {
      this.log(LogLevel.ERROR, '初始化失败:', error);
      throw error;
    }
  }

  /**
   * 解码 H.264 帧数据（性能优化版）
   */
  async decode(data: Uint8Array): Promise<void> {
    if (!this.decoder) {
      this.log(LogLevel.WARN, '解码器未初始化');
      return;
    }

    if (this.decoder.state === 'closed') {
      this.log(LogLevel.WARN, '解码器已关闭');
      return;
    }

    // 检查解码队列，实施背压控制
    const queueSize = this.decoder.decodeQueueSize || 0;
    this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, queueSize);

    // 如果队列过载，丢弃非关键帧
    if (queueSize > this.MAX_DECODE_QUEUE) {
      const nalUnits = this.parseNALUnits(data);
      const hasIDR = nalUnits.some(nal => nal.type === 5);

      if (!hasIDR) {
        // 非关键帧，直接丢弃
        this.stats.droppedFrames++;
        this.log(LogLevel.DEBUG, `丢弃非关键帧，队列大小: ${queueSize}`);
        this.reportStatsIfNeeded();
        return;
      }

      // 是关键帧，清空队列后处理
      this.log(LogLevel.INFO, `队列过载(${queueSize})，保留关键帧`);
      await this.decoder.flush();
    }

    try {
      const startTime = performance.now();

      // 解析 NAL 单元
      const nalUnits = this.parseNALUnits(data);

      // 处理 SPS/PPS
      for (const nal of nalUnits) {
        if (nal.type === 7) {
          this.log(LogLevel.DEBUG, '收到 SPS');
          this.sps = nal.data;
        } else if (nal.type === 8) {
          this.log(LogLevel.DEBUG, '收到 PPS');
          this.pps = nal.data;
        }
      }

      // 配置解码器（如果需要）
      if (this.sps && this.pps && !this.isConfigured) {
        await this.configureDecoder();
      }

      // 解码视频帧
      if (this.isConfigured) {
        await this.decodeFrame(nalUnits);

        // 更新统计
        const decodeTime = performance.now() - startTime;
        this.stats.avgDecodeTime = (this.stats.avgDecodeTime * this.stats.decodedFrames + decodeTime) / (this.stats.decodedFrames + 1);
        this.stats.decodedFrames++;
      } else {
        // 缓存帧，但限制数量
        if (this.pendingFrames.length < 5) {
          this.pendingFrames.push(data);
          this.log(LogLevel.DEBUG, '缓存帧，等待 SPS/PPS...');
        } else {
          this.stats.droppedFrames++;
          this.log(LogLevel.DEBUG, '缓存已满，丢弃帧');
        }
      }

      this.reportStatsIfNeeded();
    } catch (error: any) {
      this.log(LogLevel.ERROR, '解码失败:', error.message, error);
    }
  }

  /**
   * 配置解码器
   */
  private async configureDecoder(): Promise<void> {
    if (!this.decoder || !this.sps || !this.pps) {
      return;
    }

    try {
      const { profile, compatibility, level } = this.parseSPS(this.sps);
      const codecString = `avc1.${profile.toString(16).padStart(2, '0')}${compatibility.toString(16).padStart(2, '0')}${level.toString(16).padStart(2, '0')}`;
      const description = this.buildAVCC(this.sps, this.pps);

      const config: VideoDecoderConfig = {
        codec: codecString,
        description: description,
        hardwareAcceleration: 'prefer-hardware',
        optimizeForLatency: true,
      };

      this.log(LogLevel.INFO, '配置解码器:', codecString);

      const support = await VideoDecoder.isConfigSupported(config);
      if (!support.supported) {
        throw new Error(`浏览器不支持 H.264 解码配置: ${codecString}`);
      }

      this.decoder.configure(config);
      this.isConfigured = true;
      this.log(LogLevel.INFO, '解码器配置成功');

      // 处理缓存的帧（限制数量）
      if (this.pendingFrames.length > 0) {
        const framesToProcess = this.pendingFrames.splice(0, 3); // 最多处理3个缓存帧
        this.log(LogLevel.DEBUG, `处理 ${framesToProcess.length} 个缓存帧`);

        for (const frameData of framesToProcess) {
          const nalUnits = this.parseNALUnits(frameData);
          await this.decodeFrame(nalUnits);
        }

        // 清空剩余缓存
        if (this.pendingFrames.length > 0) {
          this.stats.droppedFrames += this.pendingFrames.length;
          this.pendingFrames = [];
        }
      }
    } catch (error: any) {
      this.log(LogLevel.ERROR, '配置解码器失败:', error.message, error);
      throw error;
    }
  }

  /**
   * 解码视频帧
   */
  private async decodeFrame(nalUnits: NALUnit[]): Promise<void> {
    if (!this.decoder || !this.isConfigured) {
      return;
    }

    try {
      const sliceNALs = nalUnits.filter(nal => nal.type === 1 || nal.type === 5);

      if (sliceNALs.length === 0) {
        return;
      }

      const hasIDR = sliceNALs.some(nal => nal.type === 5);

      // 使用池化的buffer进行转换
      const avccData = this.convertAnnexBToAVCCPooled(sliceNALs);

      const chunk = new EncodedVideoChunk({
        type: hasIDR ? 'key' : 'delta',
        timestamp: performance.now() * 1000,
        data: avccData,
      });

      this.decoder.decode(chunk);
      this.frameCount++;

      // 减少日志输出频率
      if (this.frameCount % 100 === 0) {
        this.log(LogLevel.DEBUG, `已解码 ${this.frameCount} 帧`);
      }
    } catch (error: any) {
      this.log(LogLevel.ERROR, '解码帧失败:', error.message, error);
    }
  }

  /**
   * 使用池化buffer的AVCC转换
   */
  private convertAnnexBToAVCCPooled(nalUnits: NALUnit[]): Uint8Array {
    let totalSize = 0;
    for (const nal of nalUnits) {
      totalSize += 4 + nal.data.length;
    }

    const avccData = this.getPooledBuffer(totalSize);
    let offset = 0;

    for (const nal of nalUnits) {
      const length = nal.data.length;
      avccData[offset++] = (length >> 24) & 0xFF;
      avccData[offset++] = (length >> 16) & 0xFF;
      avccData[offset++] = (length >> 8) & 0xFF;
      avccData[offset++] = length & 0xFF;
      avccData.set(nal.data, offset);
      offset += nal.data.length;
    }

    return avccData;
  }

  // /**
  //  * 将 Annex-B 格式的 NAL 单元转换为 AVCC 格式（备用实现，当前未使用）
  //  */
  // private convertAnnexBToAVCC(nalUnits: NALUnit[]): Uint8Array {
  //   let totalSize = 0;
  //   for (const nal of nalUnits) {
  //     totalSize += 4 + nal.data.length;
  //   }
  //
  //   const avccData = new Uint8Array(totalSize);
  //   let offset = 0;
  //
  //   for (const nal of nalUnits) {
  //     const length = nal.data.length;
  //     avccData[offset++] = (length >> 24) & 0xFF;
  //     avccData[offset++] = (length >> 16) & 0xFF;
  //     avccData[offset++] = (length >> 8) & 0xFF;
  //     avccData[offset++] = length & 0xFF;
  //     avccData.set(nal.data, offset);
  //     offset += nal.data.length;
  //   }
  //
  //   return avccData;
  // }

  /**
   * 处理解码后的视频帧
   */
  private handleFrame(frame: VideoFrame): void {
    try {
      if (!this.ctx) {
        this.log(LogLevel.ERROR, 'Canvas context 不可用');
        frame.close();
        return;
      }

      // 调整 Canvas 尺寸
      if (this.canvas.width !== frame.displayWidth || this.canvas.height !== frame.displayHeight) {
        this.canvas.width = frame.displayWidth;
        this.canvas.height = frame.displayHeight;
        this.log(LogLevel.DEBUG, `Canvas 尺寸调整为 ${frame.displayWidth}x${frame.displayHeight}`);
      }

      // 使用 createImageBitmap 进行异步渲染（更高效）
      this.ctx.drawImage(frame, 0, 0);
      frame.close();
    } catch (error) {
      this.log(LogLevel.ERROR, '渲染帧失败:', error);
      frame.close();
    }
  }

  /**
   * 解析 NAL 单元（优化版）
   */
  private parseNALUnits(data: Uint8Array): NALUnit[] {
    const nalUnits: NALUnit[] = [];
    let i = 0;

    while (i < data.length - 3) {
      let startCodeLength = 0;

      if (data[i] === 0 && data[i + 1] === 0) {
        if (data[i + 2] === 1) {
          startCodeLength = 3;
        } else if (data[i + 2] === 0 && data[i + 3] === 1) {
          startCodeLength = 4;
        }
      }

      if (startCodeLength > 0) {
        const nalStart = i + startCodeLength;
        const nalHeader = data[nalStart];
        const nalType = nalHeader & 0x1f;

        // 快速查找下一个起始码
        let nextStart = data.length;
        for (let j = nalStart + 1; j <= data.length - 3; j++) {
          if (data[j] === 0 && data[j + 1] === 0 && (data[j + 2] === 1 || (data[j + 2] === 0 && data[j + 3] === 1))) {
            nextStart = j;
            break;
          }
        }

        const nalData = data.slice(nalStart, nextStart);
        nalUnits.push({ type: nalType, data: nalData });
        i = nextStart;
      } else {
        i++;
      }
    }

    return nalUnits;
  }

  /**
   * 解析 SPS
   */
  private parseSPS(sps: Uint8Array): { profile: number; compatibility: number; level: number } {
    if (sps.length < 4) {
      throw new Error('SPS 数据太短');
    }

    const profile = sps[1];
    const compatibility = sps[2];
    const level = sps[3];

    this.log(LogLevel.DEBUG, `SPS 解析: profile=${profile}, compatibility=${compatibility}, level=${level}`);
    return { profile, compatibility, level };
  }

  /**
   * 构建 AVCC
   */
  private buildAVCC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
    const spsLength = sps.length;
    const ppsLength = pps.length;
    const avccLength = 7 + 2 + spsLength + 1 + 2 + ppsLength;
    const avcc = new Uint8Array(avccLength);

    let offset = 0;
    avcc[offset++] = 1; // Configuration version
    avcc[offset++] = sps[1]; // Profile
    avcc[offset++] = sps[2]; // Compatibility
    avcc[offset++] = sps[3]; // Level
    avcc[offset++] = 0xFF; // Length size minus one
    avcc[offset++] = 0xE1; // Number of SPS
    avcc[offset++] = (spsLength >> 8) & 0xFF;
    avcc[offset++] = spsLength & 0xFF;
    avcc.set(sps, offset);
    offset += spsLength;
    avcc[offset++] = 1; // Number of PPS
    avcc[offset++] = (ppsLength >> 8) & 0xFF;
    avcc[offset++] = ppsLength & 0xFF;
    avcc.set(pps, offset);

    this.log(LogLevel.DEBUG, `AVCC 构建完成，长度: ${avccLength} bytes`);
    return avcc;
  }

  /**
   * 报告性能统计
   */
  private reportStatsIfNeeded(): void {
    const now = Date.now();
    if (now - this.stats.lastReportTime > this.STATS_REPORT_INTERVAL) {
      const dropRate = this.stats.decodedFrames > 0
        ? (this.stats.droppedFrames / (this.stats.decodedFrames + this.stats.droppedFrames) * 100).toFixed(1)
        : '0';

      this.log(LogLevel.INFO,
        `性能统计 - 解码: ${this.stats.decodedFrames}, 丢弃: ${this.stats.droppedFrames}, ` +
        `丢帧率: ${dropRate}%, 峰值队列: ${this.stats.peakQueueSize}, ` +
        `平均解码时间: ${this.stats.avgDecodeTime.toFixed(2)}ms`
      );

      this.stats.lastReportTime = now;
      this.stats.peakQueueSize = 0; // 重置峰值
    }
  }

  /**
   * 获取性能统计
   */
  getStats(): PerformanceStats {
    return { ...this.stats };
  }

  /**
   * 重置解码器
   */
  async reset(): Promise<void> {
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        await this.decoder.flush();
        this.decoder.reset();
        this.log(LogLevel.INFO, '解码器已重置');
      } catch (error) {
        this.log(LogLevel.ERROR, '重置失败:', error);
      }
    }
    this.isConfigured = false;
    this.sps = null;
    this.pps = null;
    this.pendingFrames = [];
    this.frameCount = 0;

    // 重置统计
    this.stats = {
      decodedFrames: 0,
      droppedFrames: 0,
      peakQueueSize: 0,
      avgDecodeTime: 0,
      lastReportTime: Date.now()
    };
  }

  /**
   * 关闭解码器
   */
  close(): void {
    if (this.decoder && this.decoder.state !== 'closed') {
      try {
        this.decoder.close();
        this.log(LogLevel.INFO, '解码器已关闭');
      } catch (error) {
        this.log(LogLevel.ERROR, '关闭失败:', error);
      }
    }
    this.decoder = null;
    this.isConfigured = false;
    this.sps = null;
    this.pps = null;
    this.pendingFrames = [];
    this.frameCount = 0;
  }

  /**
   * 获取解码队列大小
   */
  getDecodeQueueSize(): number {
    return this.decoder?.decodeQueueSize || 0;
  }

  /**
   * 获取解码器状态
   */
  getState(): string {
    return this.decoder?.state || 'not-initialized';
  }

  /**
   * 获取帧计数
   */
  getFrameCount(): number {
    return this.frameCount;
  }

  /**
   * 是否已配置
   */
  isDecoderConfigured(): boolean {
    return this.isConfigured;
  }
}