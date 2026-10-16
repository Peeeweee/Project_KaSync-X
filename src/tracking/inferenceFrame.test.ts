import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferenceDimensions, MainInferenceFrame } from './inferenceFrame';

afterEach(() => vi.restoreAllMocks());

describe('shared inference resolution', () => {
  it('preserves aspect ratio, preset budgets and small inputs', () => {
    expect(inferenceDimensions(1280, 720, 'auto', false)).toEqual({ width: 460, height: 259 });
    expect(inferenceDimensions(1280, 720, 'quality', false)).toEqual({ width: 540, height: 304 });
    expect(inferenceDimensions(1280, 720, 'audio', false)).toEqual({ width: 400, height: 225 });
    expect(inferenceDimensions(640, 480, 'auto', true)).toEqual({ width: 360, height: 270 });
    expect(inferenceDimensions(320, 240, 'auto', false)).toEqual({ width: 320, height: 240 });
  });
  it('reuses a resized canvas and adapts when quality changes', () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    const frames = new MainInferenceFrame();
    const first = frames.capture(video, 'auto', false) as HTMLCanvasElement;
    expect(first.width).toBe(460);
    expect(first.height).toBe(259);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 460, 259);
    expect(frames.capture(video, 'quality', false)).toBe(first);
    expect(first.width).toBe(540);
    expect(first.height).toBe(304);
    expect(drawImage).toHaveBeenCalledTimes(2);
  });
  it('retains direct-video compatibility when a canvas context is unavailable', () => {
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    expect(new MainInferenceFrame().capture(video, 'auto', false)).toBe(video);
  });
});
