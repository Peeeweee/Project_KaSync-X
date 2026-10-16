import { create } from 'zustand';
import { useHandStore } from '../store/handState';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useTrackingCaptureStore } from './trackingCapture';
import { captureInferenceBitmap } from '../tracking/inferenceFrame';
import type { BenchmarkDelegate, BenchmarkRequest, BenchmarkResponse, BenchmarkResult } from '../tracking/backendBenchmarkProtocol';

export interface BackendBenchmarkReport {
  schemaVersion: 1;
  createdAt: string;
  modelAssetPath: string;
  width: number;
  height: number;
  quality: string;
  order: BenchmarkDelegate[];
  clipFrames: number;
  warmupFramesPerBackend: number;
  timedPassesPerBackend: number;
  results: BenchmarkResult[];
  handCountAgreementPercent: number;
  notes: string;
}
interface BenchmarkState {
  status: 'idle' | 'capturing' | 'running' | 'done' | 'error';
  message: string;
  report: BackendBenchmarkReport | null;
}
export const useBackendBenchmarkStore = create<BenchmarkState>(() => ({ status: 'idle', message: '', report: null }));
let video: HTMLVideoElement | null = null;
let worker: Worker | null = null;
let liveInferenceIdle: () => boolean = () => true;
let timeout: ReturnType<typeof setTimeout> | undefined;
let pendingImages: ImageBitmap[] = [];
let generation = 0;

export function isBenchmarkActive() {
  const { status } = useBackendBenchmarkStore.getState();
  return status === 'capturing' || status === 'running';
}
function releaseResources() {
  const restartLive = isBenchmarkActive();
  clearTimeout(timeout);
  worker?.terminate();
  worker = null;
  pendingImages.forEach(image => image.close());
  pendingImages = [];
  if (restartLive) useTrackingSettingsStore.getState().restartTracking();
}
export function cancelBackendBenchmark() {
  generation++;
  releaseResources();
  useBackendBenchmarkStore.setState({ status: 'idle', message: 'Benchmark cancelled. Live tracker restarting.' });
}
export function attachBenchmarkVideo(element: HTMLVideoElement, isIdle: () => boolean = () => true) {
  video = element;
  liveInferenceIdle = isIdle;
  return () => {
    if (video !== element) return;
    if (isBenchmarkActive()) cancelBackendBenchmark();
    video = null;
    liveInferenceIdle = () => true;
  };
}
export async function startBackendBenchmark() {
  if (isBenchmarkActive()) return;
  if (useTrackingCaptureStore.getState().status !== 'idle') {
    useBackendBenchmarkStore.setState({ status: 'error', message: 'Stop the current capture before benchmarking.' });
    return;
  }
  const source = video;
  if (!source || source.readyState < 2 || source.paused || !source.videoWidth || !useTrackingSettingsStore.getState().backend) {
    useBackendBenchmarkStore.setState({ status: 'error', message: 'Wait for the camera and tracker to be ready.' });
    return;
  }
  const run = ++generation;
  const settings = useTrackingSettingsStore.getState();
  const order: BenchmarkDelegate[] = Math.random() < 0.5 ? ['GPU', 'CPU'] : ['CPU', 'GPU'];
  const current = () => run === generation;
  const fail = (message: string) => {
    if (!current()) return;
    generation++;
    releaseResources();
    useBackendBenchmarkStore.setState({ status: 'error', message: `${message} Live tracker restarting.` });
  };
  useBackendBenchmarkStore.setState({ status: 'capturing', message: 'Collecting 12 camera frames… Move both hands through the view.', report: null });
  // Pause live inference and release held notes while the benchmark owns detector work.
  useHandStore.getState().setHands([], []);
  useHandStore.getState().setIsTracking(false);
  timeout = setTimeout(() => fail('Benchmark timed out after 120 seconds.'), 120000);
  try {
    // Drain the one outstanding live request before creating benchmark detector work.
    for (let attempt = 0; attempt < 30 && !liveInferenceIdle(); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!current()) return;
    }
    if (!liveInferenceIdle()) throw new Error('Live inference did not finish. Try the benchmark again.');
    let lastTime = -1;
    for (let attempt = 0; attempt < 100 && pendingImages.length < 12; attempt++) {
      if (!current()) return;
      if (source.paused || source.readyState < 2) throw new Error('Camera stopped during collection.');
      if (source.currentTime !== lastTime) {
        lastTime = source.currentTime;
        const image = await captureInferenceBitmap(source, settings.quality, settings.isLowPerformance);
        if (!current()) { image.close(); return; }
        if (pendingImages.length && (image.width !== pendingImages[0].width || image.height !== pendingImages[0].height)) {
          image.close();
          throw new Error('Camera dimensions changed during collection. Run the comparison again.');
        }
        pendingImages.push(image);
      }
      if (pendingImages.length < 12) await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!current()) return;
    if (pendingImages.length !== 12) throw new Error('Camera did not supply 12 distinct frames.');
    const width = pendingImages[0].width;
    const height = pendingImages[0].height;
    worker = new Worker(new URL('/hand-tracking.worker.js', window.location.origin), { name: 'kasync-backend-benchmark' });
    worker.onerror = event => fail(`Benchmark worker failed: ${event.message}`);
    worker.onmessage = (event: MessageEvent<BenchmarkResponse>) => {
      if (!current()) return;
      const message = event.data;
      if (message.type === 'BENCHMARK_PROGRESS') {
        useBackendBenchmarkStore.setState({ message: message.message });
      } else if (message.type === 'BENCHMARK_ERROR') {
        fail(message.error);
      } else if (message.type === 'BENCHMARK_DONE') {
        const gpu = message.results.find(result => result.delegate === 'GPU');
        const cpu = message.results.find(result => result.delegate === 'CPU');
        if (!gpu || !cpu || gpu.samples.length !== 24 || cpu.samples.length !== 24) { fail('Benchmark returned incomplete results.'); return; }
        const matches = gpu.samples.filter((sample, index) => sample.hands === cpu.samples[index].hands).length;
        const report: BackendBenchmarkReport = {
          schemaVersion: 1, createdAt: new Date().toISOString(), modelAssetPath: '/hand_landmarker.task',
          width, height, quality: settings.quality, order, clipFrames: 12,
          warmupFramesPerBackend: 12, timedPassesPerBackend: 2, results: message.results,
          handCountAgreementPercent: matches * 100 / gpu.samples.length,
          notes: 'Identical in-memory clip, model, timestamps and confidence settings. Each backend runs alone after an untimed warm-up. Order is randomized per run. Live inference is paused, then resumed. Timings measure detector calls, not live FPS or end-to-end response. Hand-count agreement is not model accuracy. No images or landmarks are exported; repeat runs to check variability.',
        };
        generation++;
        releaseResources();
        useBackendBenchmarkStore.setState({ status: 'done', message: 'Comparison complete. Live tracker restarting.', report });
      }
    };
    useBackendBenchmarkStore.setState({ status: 'running', message: 'Starting comparison…' });
    const request: BenchmarkRequest = { type: 'BENCHMARK', images: pendingImages,
      wasmRoot: `${window.location.origin}/wasm`, modelAssetPath: '/hand_landmarker.task', order };
    worker.postMessage(request, pendingImages);
    pendingImages = []; // Ownership transferred; worker closes or termination releases the images.
  } catch (error) { fail(String(error)); }
}
export function downloadBackendBenchmark() {
  const report = useBackendBenchmarkStore.getState().report;
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `kasync-gpu-cpu-${report.createdAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click(); link.remove(); URL.revokeObjectURL(url);
}
