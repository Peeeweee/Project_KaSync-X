import { describe, it, expect } from 'vitest';
import { computeGestures } from './gestureRecognizer';
import type { Landmark } from '@mediapipe/tasks-vision';

function createMockLandmarks(thumbTip: Landmark, indexTip: Landmark): Landmark[] {
  const landmarks: Landmark[] = new Array(21).fill({ x: 0, y: 0, z: 0 });
  landmarks[4] = thumbTip;
  landmarks[8] = indexTip;
  landmarks[0] = { x: 0.5, y: 0.7, z: 0 };
  landmarks[5] = { x: 0.4, y: 0.5, z: 0 };
  landmarks[9] = { x: 0.5, y: 0.5, z: 0 };
  landmarks[13] = { x: 0.56, y: 0.5, z: 0 };
  landmarks[17] = { x: 0.6, y: 0.5, z: 0 };
  return landmarks;
}

describe('computeGestures', () => {
  it('detects when pinching', () => {
    // Distance exactly 0
    const landmarks = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.5, y: 0.5, z: 0 }
    );
    const result = computeGestures(landmarks);
    expect(result.isPinching).toBe(true);
    expect(result.pinchStrength).toBe(1);
  });

  it('detects when not pinching', () => {
    // Normalized distance is 1.0, far beyond the release threshold.
    const landmarks = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.7, y: 0.5, z: 0 }
    );
    const result = computeGestures(landmarks);
    expect(result.isPinching).toBe(false);
    expect(result.pinchStrength).toBe(0);
  });

  it('handles boundary threshold', () => {
    // Effective scale is 0.3, so these become normalized distances just below/above 0.32.
    const justUnder = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.595, y: 0.5, z: 0 }
    );
    expect(computeGestures(justUnder).isPinching).toBe(true);

    const justOver = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.597, y: 0.5, z: 0 }
    );
    expect(computeGestures(justOver).isPinching).toBe(false);
  });

  it('uses hysteresis to avoid flickering near the pinch boundary', () => {
    const betweenThresholds = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.615, y: 0.5, z: 0 },
    );

    expect(computeGestures(betweenThresholds, null, { previousPinching: false }).isPinching).toBe(false);
    expect(computeGestures(betweenThresholds, null, { previousPinching: true }).isPinching).toBe(true);
  });

  it('normalizes pinch distance by hand size', () => {
    const largeHand = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.56, y: 0.5, z: 0 },
    );
    const smallHand = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.53, y: 0.5, z: 0 },
    );
    smallHand[0] = { x: 0.5, y: 0.6, z: 0 };
    smallHand[5] = { x: 0.45, y: 0.5, z: 0 };
    smallHand[17] = { x: 0.55, y: 0.5, z: 0 };

    expect(computeGestures(largeHand).pinchDistance).toBeCloseTo(
      computeGestures(smallHand).pinchDistance,
    );
  });
});
