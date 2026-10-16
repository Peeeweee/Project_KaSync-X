import { runBackendBenchmark } from './runBackendBenchmark';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandTrackingWorkerRequest, HandTrackingWorkerResponse, TrackingBackend } from './workerProtocol';

let handLandmarker: HandLandmarker | null = null;
let lastVideoTime = -1;

function respond(message: HandTrackingWorkerResponse) {
  self.postMessage(message);
}

async function createLandmarker(
  wasmRoot: string,
  modelAssetPath: string,
): Promise<{ landmarker: HandLandmarker; backend: TrackingBackend }> {
  const vision = await FilesetResolver.forVisionTasks(wasmRoot);
  const sharedOptions = {
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };

  try {
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      ...sharedOptions,
      baseOptions: { modelAssetPath, delegate: 'GPU' },
    });
    return { landmarker, backend: 'worker-gpu' };
  } catch {
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      ...sharedOptions,
      baseOptions: { modelAssetPath, delegate: 'CPU' },
    });
    return { landmarker, backend: 'worker-cpu' };
  }
}

async function initialize(wasmRoot: string, modelAssetPath: string) {
  try {
    handLandmarker?.close();
    const result = await createLandmarker(wasmRoot, modelAssetPath);
    handLandmarker = result.landmarker;
    lastVideoTime = -1;
    respond({ type: 'INIT_DONE', backend: result.backend });
  } catch (error) {
    respond({ type: 'INIT_ERROR', error: String(error) });
  }
}

function processFrame(image: ImageBitmap, timestamp: number, requestId: number) {
  const startedAt = performance.now();
  try {
    if (!handLandmarker) throw new Error('Hand tracker is not initialized.');
    // Enforce strictly monotonic timestamps for MediaPipe VIDEO mode without dropping frames
    const effectiveTimestamp = timestamp > lastVideoTime ? timestamp : lastVideoTime + 1;

    const results = handLandmarker.detectForVideo(image, effectiveTimestamp);
    lastVideoTime = effectiveTimestamp;
    respond({
      type: 'RESULTS',
      requestId,
      landmarks: results.landmarks,
      handednesses: results.handednesses,
      inferenceMs: performance.now() - startedAt,
    });
  } catch (error) {
    respond({ type: 'PROCESS_ERROR', requestId, error: String(error) });
  } finally {
    image.close();
  }
}

self.onmessage = (event: MessageEvent<HandTrackingWorkerRequest>) => {
  const message = event.data;
  switch (message.type) {
    case 'BENCHMARK':
      void runBackendBenchmark(message, respond);
      break;
    case 'INIT':
      void initialize(message.wasmRoot, message.modelAssetPath);
      break;
    case 'PROCESS':
      processFrame(message.image, message.timestamp, message.requestId);
      break;
    case 'DISPOSE':
      handLandmarker?.close();
      handLandmarker = null;
      break;
  }
};
