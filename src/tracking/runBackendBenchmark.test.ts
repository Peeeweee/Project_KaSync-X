import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBackendBenchmark } from './runBackendBenchmark';
import { summarizeBenchmark, type BenchmarkRequest, type BenchmarkResponse } from './backendBenchmarkProtocol';

const { createDetector, resolveVision } = vi.hoisted(() => ({ createDetector: vi.fn(), resolveVision: vi.fn().mockResolvedValue({}) }));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: resolveVision }, HandLandmarker: { createFromOptions: createDetector },
}));
const request = (): BenchmarkRequest => ({
  type: 'BENCHMARK', wasmRoot: '/wasm', modelAssetPath: '/hand_landmarker.task', order: ['GPU', 'CPU'],
  images: Array.from({ length: 12 }, () => ({ width: 460, height: 259, close: vi.fn() } as unknown as ImageBitmap)),
});
beforeEach(() => { createDetector.mockReset(); resolveVision.mockClear(); });

describe('GPU versus CPU replay', () => {
  it('uses identical frames, timestamps, options and warm-ups, excluding warm-up timings', async () => {
    const gpu = { detectForVideo: vi.fn<(image: ImageBitmap, timestamp: number) => { landmarks: number[][] }>().mockReturnValue({ landmarks: [[]] }), close: vi.fn() };
    const cpu = { detectForVideo: vi.fn<(image: ImageBitmap, timestamp: number) => { landmarks: number[][] }>().mockReturnValue({ landmarks: [[]] }), close: vi.fn() };
    createDetector.mockResolvedValueOnce(gpu).mockResolvedValueOnce(cpu);
    const input = request();
    const messages: BenchmarkResponse[] = [];
    await runBackendBenchmark(input, message => messages.push(message));
    expect(createDetector).toHaveBeenCalledTimes(2);
    const options = createDetector.mock.calls.map(call => call[1]);
    expect(options[0].baseOptions).toEqual({ modelAssetPath: '/hand_landmarker.task', delegate: 'GPU' });
    expect(options[1]).toEqual({ ...options[0], baseOptions: { ...options[0].baseOptions, delegate: 'CPU' } });
    expect(gpu.detectForVideo.mock.calls).toEqual(cpu.detectForVideo.mock.calls);
    expect(gpu.detectForVideo).toHaveBeenCalledTimes(36);
    for (let index = 0; index < 36; index++) {
      expect(gpu.detectForVideo.mock.calls[index]).toEqual([input.images[index % 12], (index + 1) * 100]);
    }
    const done = messages.find(message => message.type === 'BENCHMARK_DONE');
    expect(done?.type).toBe('BENCHMARK_DONE');
    if (done?.type === 'BENCHMARK_DONE') {
      expect(done.results.map(result => result.samples.length)).toEqual([24, 24]);
      expect(done.results[0].samples[0]).toMatchObject({ frame: 0, pass: 0, hands: 1 });
    }
    expect(gpu.close).toHaveBeenCalledTimes(1);
    expect(cpu.close).toHaveBeenCalledTimes(1);
    input.images.forEach(image => expect(image.close).toHaveBeenCalledTimes(1));
  });
  it('reports an unavailable delegate explicitly without substituting another backend', async () => {
    createDetector.mockRejectedValueOnce(new Error('GPU unavailable'));
    const input = request();
    const respond = vi.fn();
    await runBackendBenchmark(input, respond);
    expect(createDetector).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith({ type: 'BENCHMARK_ERROR', error: 'Error: GPU unavailable' });
    input.images.forEach(image => expect(image.close).toHaveBeenCalledTimes(1));
  });
  it('cleans up the detector and clip if inference fails', async () => {
    const detector = { detectForVideo: vi.fn(() => { throw new Error('Frame failed'); }), close: vi.fn() };
    createDetector.mockResolvedValue(detector);
    const input = request();
    const respond = vi.fn();
    await runBackendBenchmark(input, respond);
    expect(respond).toHaveBeenCalledWith({ type: 'BENCHMARK_ERROR', error: 'Error: Frame failed' });
    expect(detector.close).toHaveBeenCalledTimes(1);
    input.images.forEach(image => expect(image.close).toHaveBeenCalledTimes(1));
  });
  it('computes median and p95 from timed samples only', () => {
    const samples = [4, 2, 10, 8].map((inferenceMs, frame) => ({ frame, pass: 0, inferenceMs, hands: 1 }));
    expect(summarizeBenchmark('CPU', 100, samples)).toMatchObject({ averageMs: 6, medianMs: 6, p95Ms: 10 });
  });
});
