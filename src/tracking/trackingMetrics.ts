export interface TrackingMetricsSnapshot {
  actualTrackingFps: number | null;
  pipelineLatencyMs: number | null;
  pipelineP95Ms: number | null;
  captureLatencyMs: number | null;
}

export const EMPTY_TRACKING_METRICS: TrackingMetricsSnapshot = {
  actualTrackingFps: null,
  pipelineLatencyMs: null,
  pipelineP95Ms: null,
  captureLatencyMs: null,
};

/** Numeric timings only; bounded to the latest 120 completed frames. */
export class TrackingMetrics {
  private samples: { completedAt: number; pipelineMs: number; captureMs: number }[] = [];
  private nextIndex = 0;
  private lastPublishedAt: number | null = null;

  reset() {
    this.samples = [];
    this.nextIndex = 0;
    this.lastPublishedAt = null;
  }

  record(completedAt: number, pipelineMs: number, captureMs: number): TrackingMetricsSnapshot | null {
    this.samples[this.nextIndex] = { completedAt, pipelineMs, captureMs };
    this.nextIndex = (this.nextIndex + 1) % 120;
    // Keep percentile sorting and diagnostic notifications out of the per-frame hot path.
    if (this.lastPublishedAt !== null && completedAt - this.lastPublishedAt < 500) return null;
    this.lastPublishedAt = completedAt;
    const count = this.samples.length;
    const oldest = this.samples[count === 120 ? this.nextIndex : 0];
    const elapsed = completedAt - oldest.completedAt;
    const pipeline = this.samples.map(sample => sample.pipelineMs).sort((a, b) => a - b);
    return {
      actualTrackingFps: count > 1 && elapsed > 0 ? (count - 1) * 1000 / elapsed : null,
      pipelineLatencyMs: pipeline.reduce((sum, value) => sum + value, 0) / count,
      pipelineP95Ms: pipeline[Math.ceil(count * 0.95) - 1],
      captureLatencyMs: this.samples.reduce((sum, sample) => sum + sample.captureMs, 0) / count,
    };
  }
}
