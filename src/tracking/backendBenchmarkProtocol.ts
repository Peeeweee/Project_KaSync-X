export type BenchmarkDelegate = 'GPU' | 'CPU';
export interface BenchmarkSample { frame: number; pass: number; inferenceMs: number; hands: number }
export interface BenchmarkResult {
  delegate: BenchmarkDelegate;
  initializationMs: number;
  samples: BenchmarkSample[];
  averageMs: number;
  medianMs: number;
  p95Ms: number;
}
export interface BenchmarkRequest {
  type: 'BENCHMARK';
  images: ImageBitmap[];
  wasmRoot: string;
  modelAssetPath: string;
  order: BenchmarkDelegate[];
}
export type BenchmarkResponse =
  | { type: 'BENCHMARK_PROGRESS'; message: string }
  | { type: 'BENCHMARK_DONE'; results: BenchmarkResult[] }
  | { type: 'BENCHMARK_ERROR'; error: string };

export function summarizeBenchmark(delegate: BenchmarkDelegate, initializationMs: number, samples: BenchmarkSample[]): BenchmarkResult {
  const sorted = samples.map(sample => sample.inferenceMs).sort((a, b) => a - b);
  if (!sorted.length) throw new Error('Benchmark produced no timed frames.');
  const middle = Math.floor(sorted.length / 2);
  return {
    delegate, initializationMs, samples,
    averageMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}
