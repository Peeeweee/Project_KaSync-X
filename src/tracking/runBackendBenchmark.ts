import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { summarizeBenchmark, type BenchmarkRequest, type BenchmarkResponse, type BenchmarkSample } from './backendBenchmarkProtocol';

/** One detector at a time; identical clip, model, options and warm-up for each delegate. */
export async function runBackendBenchmark(request: BenchmarkRequest, respond: (message: BenchmarkResponse) => void) {
  let detector: HandLandmarker | null = null;
  try {
    if (request.images.length !== 12 || request.order.length !== 2 || new Set(request.order).size !== 2) {
      throw new Error('Benchmark requires 12 frames and both GPU and CPU.');
    }
    const vision = await FilesetResolver.forVisionTasks(request.wasmRoot);
    const results = [];
    for (const delegate of request.order) {
      respond({ type: 'BENCHMARK_PROGRESS', message: `Initializing ${delegate}…` });
      const startedAt = performance.now();
      // An unavailable delegate fails explicitly; silently falling back would invalidate the comparison.
      detector = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: request.modelAssetPath, delegate },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      const initializationMs = performance.now() - startedAt;
      let timestamp = 0;
      const samples: BenchmarkSample[] = [];
      for (let pass = -1; pass < 2; pass++) {
        respond({ type: 'BENCHMARK_PROGRESS', message: pass < 0 ? `Warming up ${delegate}…` : `Testing ${delegate} · pass ${pass + 1} / 2` });
        for (let frame = 0; frame < request.images.length; frame++) {
          // Both detectors receive the same ordered frames and VIDEO timestamps.
          timestamp += 100;
          const before = performance.now();
          const result = detector.detectForVideo(request.images[frame], timestamp);
          const inferenceMs = performance.now() - before;
          if (pass >= 0) samples.push({ frame, pass, inferenceMs, hands: result.landmarks.length });
        }
      }
      detector.close();
      detector = null;
      results.push(summarizeBenchmark(delegate, initializationMs, samples));
    }
    respond({ type: 'BENCHMARK_DONE', results });
  } catch (error) {
    respond({ type: 'BENCHMARK_ERROR', error: String(error) });
  } finally {
    detector?.close();
    request.images.forEach(image => image.close());
  }
}
