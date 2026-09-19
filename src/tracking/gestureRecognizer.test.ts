import { describe, it, expect } from 'vitest';
import { computeGestures } from './gestureRecognizer';
import type { Landmark } from '@mediapipe/tasks-vision';

function createMockLandmarks(thumbTip: Landmark, indexTip: Landmark): Landmark[] {
  const landmarks: Landmark[] = new Array(21).fill({ x: 0, y: 0, z: 0 });
  landmarks[4] = thumbTip;
  landmarks[8] = indexTip;
  // Mock palm bases to avoid NaN
  [0, 5, 9, 13, 17].forEach((idx) => {
    landmarks[idx] = { x: 0.5, y: 0.5, z: 0 };
  });
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
    expect(result.pinchStrength).toBe(1); // 0 < MIN_PINCH_DIST (0.02), so clamped to 0.02, 1 - (0)/0.08 = 1
  });

  it('detects when not pinching', () => {
    // Distance is 0.2 (way past MAX_PINCH_DIST 0.1 and PINCH_THRESHOLD 0.06)
    const landmarks = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.7, y: 0.5, z: 0 }
    );
    const result = computeGestures(landmarks);
    expect(result.isPinching).toBe(false);
    expect(result.pinchStrength).toBe(0); // clamped to 0.1, 1 - (0.08)/0.08 = 0
  });

  it('handles boundary threshold', () => {
    // Distance is exactly 0.059 (just under threshold 0.06)
    const justUnder = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.559, y: 0.5, z: 0 }
    );
    expect(computeGestures(justUnder).isPinching).toBe(true);

    // Distance is exactly 0.061 (just over threshold 0.06)
    const justOver = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.561, y: 0.5, z: 0 }
    );
    expect(computeGestures(justOver).isPinching).toBe(false);
  });
});
