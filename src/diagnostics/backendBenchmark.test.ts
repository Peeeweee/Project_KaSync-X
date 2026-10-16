import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBenchmarkVideo, cancelBackendBenchmark, isBenchmarkActive, startBackendBenchmark, useBackendBenchmarkStore } from './backendBenchmark';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useTrackingCaptureStore } from './trackingCapture';
import { useHandStore } from '../store/handState';
import { summarizeBenchmark } from '../tracking/backendBenchmarkProtocol';
const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../tracking/inferenceFrame', () => ({ captureInferenceBitmap: capture }));
class BenchmarkWorker {
  static latest: BenchmarkWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { BenchmarkWorker.latest = this; }
  receive(data: object) { this.onmessage?.({ data } as MessageEvent); }
}
let detach: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', BenchmarkWorker);
  capture.mockReset().mockImplementation(async () => ({ width: 460, height: 259, close: vi.fn() }));
  useTrackingSettingsStore.getState().setRuntime({ backend: 'worker-gpu' });
  useTrackingCaptureStore.setState({ status: 'idle' });
  useBackendBenchmarkStore.setState({ status: 'idle', message: '', report: null });
  const video = document.createElement('video');
  let clock = 0;
  Object.defineProperties(video, {
    readyState: { value: 4 }, paused: { value: false }, videoWidth: { value: 1280 },
    currentTime: { get: () => ++clock / 10 },
  });
  detach = attachBenchmarkVideo(video);
});
afterEach(() => {
  cancelBackendBenchmark(); detach();
  useTrackingSettingsStore.getState().setRuntime({ backend: null });
  useTrackingCaptureStore.setState({ status: 'idle' });
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('benchmark lifecycle', () => {
  it('transfers a bounded clip, pauses live inference, and resumes without changing backend', async () => {
    const pending = startBackendBenchmark();
    expect(isBenchmarkActive()).toBe(true);
    expect(useHandStore.getState().smoothedHands).toEqual([]);
    await vi.advanceTimersByTimeAsync(1200);
    await pending;
    const worker = BenchmarkWorker.latest;
    const request = worker.postMessage.mock.calls[0][0];
    expect(request.images).toHaveLength(12);
    expect(worker.postMessage.mock.calls[0][1]).toBe(request.images);
    expect(useBackendBenchmarkStore.getState().status).toBe('running');
    const samples = Array.from({ length: 24 }, (_, index) => ({ frame: index % 12, pass: Math.floor(index / 12), inferenceMs: 10, hands: 2 }));
    worker.receive({ type: 'BENCHMARK_DONE', results: [summarizeBenchmark('GPU', 100, samples), summarizeBenchmark('CPU', 100, samples)] });
    expect(isBenchmarkActive()).toBe(false);
    expect(useTrackingSettingsStore.getState().backend).toBe('worker-gpu');
    expect(useBackendBenchmarkStore.getState().report).toMatchObject({ width: 460, height: 259, handCountAgreementPercent: 100 });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it('releases collected images when cancelled and ignores pending collection work', async () => {
    const image = { width: 460, height: 259, close: vi.fn() };
    capture.mockResolvedValue(image);
    const pending = startBackendBenchmark();
    await Promise.resolve();
    cancelBackendBenchmark();
    await vi.advanceTimersByTimeAsync(200);
    await pending;
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(isBenchmarkActive()).toBe(false);
  });
  it('does not run concurrently with a normal capture', async () => {
    useTrackingCaptureStore.setState({ status: 'recording' });
    await startBackendBenchmark();
    expect(capture).not.toHaveBeenCalled();
    expect(useBackendBenchmarkStore.getState().status).toBe('error');
  });
  it('resumes live tracking after worker initialization failure', async () => {
    const pending = startBackendBenchmark();
    await vi.advanceTimersByTimeAsync(1200);
    await pending;
    BenchmarkWorker.latest.receive({ type: 'BENCHMARK_ERROR', error: 'CPU unavailable' });
    expect(isBenchmarkActive()).toBe(false);
    expect(useBackendBenchmarkStore.getState().message).toContain('CPU unavailable');
    expect(BenchmarkWorker.latest.terminate).toHaveBeenCalledTimes(1);
  });
});
