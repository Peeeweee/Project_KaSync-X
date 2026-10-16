import { describe, expect, it } from 'vitest';
import { calibratePinchThresholds, loadPinchThresholds, normalizePinchThresholds, PINCH_METRIC_VERSION } from './pinchSettings';

describe('pinch calibration compatibility', () => {
  it('learns contact with a narrow release band even from a widely spread hand', () => {
    const result = calibratePinchThresholds(1.2, 0.08)!;
    expect(result.pinchThreshold).toBeGreaterThan(0.08);
    expect(result.pinchReleaseThreshold - result.pinchThreshold).toBeLessThanOrEqual(0.05);
    expect(result.pinchReleaseThreshold).toBeLessThan(0.3);
    expect(calibratePinchThresholds(0.3, 0.28)).toBeNull();
  });
  it('replaces calibration made with mixed coordinate units', () => {
    expect(loadPinchThresholds({ pinchThreshold: 0.55, pinchReleaseThreshold: 0.75 }))
      .toEqual({ pinchThreshold: 0.32, pinchReleaseThreshold: 0.36 });
  });
  it('retains valid calibration in the current metric', () => {
    expect(loadPinchThresholds({ pinchMetricVersion: PINCH_METRIC_VERSION,
      pinchThreshold: 0.2, pinchReleaseThreshold: 0.26 }))
      .toEqual({ pinchThreshold: 0.2, pinchReleaseThreshold: 0.26 });
  });
  it('rejects nonnumeric thresholds that otherwise silently prevent all pinch edges', () => {
    expect(normalizePinchThresholds('0.32', NaN)).toEqual({ pinchThreshold: 0.32, pinchReleaseThreshold: 0.36 });
    expect(normalizePinchThresholds(Infinity, -10)).toEqual({ pinchThreshold: 0.32, pinchReleaseThreshold: 0.35 });
  });
});
