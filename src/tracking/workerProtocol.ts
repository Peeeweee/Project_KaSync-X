import type { BenchmarkRequest, BenchmarkResponse } from './backendBenchmarkProtocol';
import type { Category, Landmark } from '@mediapipe/tasks-vision';

export type TrackingBackend = 'worker-gpu' | 'worker-cpu' | 'main-gpu' | 'main-cpu';

export type HandTrackingWorkerRequest =
  | BenchmarkRequest
  | {
      type: 'INIT';
      wasmRoot: string;
      modelAssetPath: string;
    }
  | {
      type: 'PROCESS';
      image: ImageBitmap;
      timestamp: number;
      requestId: number;
    }
  | { type: 'DISPOSE' };

export type HandTrackingWorkerResponse =
  | BenchmarkResponse
  | { type: 'INIT_DONE'; backend: TrackingBackend }
  | { type: 'INIT_ERROR'; error: string }
  | {
      type: 'RESULTS';
      requestId: number;
      landmarks: Landmark[][];
      handednesses: Category[][];
      inferenceMs: number;
    }
  | { type: 'PROCESS_ERROR'; requestId: number; error: string };
