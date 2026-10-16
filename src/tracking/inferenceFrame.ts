import type { TrackingQuality } from '../store/trackingSettings';

export function inferenceDimensions(width: number, height: number, quality: TrackingQuality, low: boolean) {
  const target = low ? 360 : quality === 'quality' ? 540 : quality === 'audio' || quality === 'performance' ? 400 : 460;
  const outputWidth = Math.min(width, target);
  return { width: outputWidth, height: Math.max(1, Math.round(outputWidth * height / width)) };
}

/** Reuses a single canvas; fallback inference follows the worker's resolution budget. */
export class MainInferenceFrame {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;

  capture(video: HTMLVideoElement, quality: TrackingQuality, low: boolean): HTMLVideoElement | HTMLCanvasElement {
    const size = inferenceDimensions(video.videoWidth, video.videoHeight, quality, low);
    if (size.width === video.videoWidth) return video;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.context = this.canvas.getContext('2d', { alpha: false });
    }
    if (!this.context) return video;
    if (this.canvas.width !== size.width) this.canvas.width = size.width;
    if (this.canvas.height !== size.height) this.canvas.height = size.height;
    this.context.drawImage(video, 0, 0, size.width, size.height);
    return this.canvas;
  }
}

export async function captureInferenceBitmap(video: HTMLVideoElement, quality: TrackingQuality, low: boolean): Promise<ImageBitmap> {
  const size = inferenceDimensions(video.videoWidth, video.videoHeight, quality, low);
  if (video.videoWidth > size.width && video.videoHeight > 0) {
    try {
      return await createImageBitmap(video, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'low' });
    } catch { /* Retain browser compatibility when bitmap resize options are unsupported. */ }
  }
  return createImageBitmap(video);
}
