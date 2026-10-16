import { describe, expect, it } from 'vitest';
import { TrackingMetrics } from './trackingMetrics';

describe('tracking measurements', () => {
  it('measures completed FPS independently of the requested frame rate', () => {
    const metrics = new TrackingMetrics();
    metrics.record(0, 10, 2);
    expect(metrics.record(100, 10, 2)).toBeNull();
    metrics.record(200, 10, 2);
    metrics.record(300, 10, 2);
    metrics.record(400, 10, 2);
    const snapshot = metrics.record(500, 100, 8)!;
    expect(snapshot.actualTrackingFps).toBe(10);
    expect(snapshot.pipelineLatencyMs).toBe(25);
    expect(snapshot.pipelineP95Ms).toBe(100);
    expect(snapshot.captureLatencyMs).toBe(3);
  });

  it('bounds the window and ages out startup spikes', () => {
    const metrics = new TrackingMetrics();
    metrics.record(0, 2000, 1000);
    let snapshot = metrics.record(500, 10, 2)!;
    for (let frame = 2; frame <= 200; frame++) {
      snapshot = metrics.record(frame * 500, 10, 2)!;
    }
    expect(snapshot.pipelineP95Ms).toBe(10);
    expect(snapshot.pipelineLatencyMs).toBe(10);
    expect(snapshot.captureLatencyMs).toBe(2);
    expect(snapshot.actualTrackingFps).toBe(2);
  });

  it('resets on a camera or backend restart without inventing an initial FPS', () => {
    const metrics = new TrackingMetrics();
    metrics.record(0, 500, 50);
    metrics.reset();
    expect(metrics.record(10, 12, 1)).toEqual({
      actualTrackingFps: null, pipelineLatencyMs: 12, pipelineP95Ms: 12, captureLatencyMs: 1,
    });
  });
});
