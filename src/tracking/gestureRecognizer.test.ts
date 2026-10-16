import { describe, it, expect } from 'vitest';
import { computeGestures } from './gestureRecognizer';
import type { Landmark } from '@mediapipe/tasks-vision';

function createMockLandmarks(thumbTip: Landmark, indexTip: Landmark): Landmark[] {
  const landmarks: Landmark[] = new Array(21).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));
  landmarks[0] = { x: 0.5, y: 0.7, z: 0 };
  landmarks[4] = thumbTip;
  landmarks[5] = { x: 0.4, y: 0.5, z: 0 };
  landmarks[6] = { x: 0.4, y: 0.4, z: 0 };
  landmarks[8] = indexTip;
  landmarks[9] = { x: 0.5, y: 0.5, z: 0 };
  landmarks[12] = { x: 0.5, y: 0.3, z: 0 };
  landmarks[13] = { x: 0.56, y: 0.5, z: 0 };
  landmarks[17] = { x: 0.6, y: 0.5, z: 0 };
  return landmarks;
}

describe('computeGestures', () => {
  it('measures the same physical gap after rotation on a widescreen camera', () => {
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    const pose = createMockLandmarks({ x: 0.45, y: 0.32, z: 0 }, { x: 0.515, y: 0.32, z: 0 });
    const yScale = 720 / 1280;
    const rotated = pose.map(p => ({ ...p, x: 0.5 - (p.y - 0.5) * yScale,
      y: 0.5 + (p.x - 0.5) / yScale }));
    const initial = computeGestures(pose, video);
    const turned = computeGestures(rotated, video);
    expect(initial.pinchDistance).toBeCloseTo(turned.pinchDistance, 6);
    expect(initial.isPinching).toBe(turned.isPinching);
  });

  it('recognizes a small opening after contact instead of retaining a pinch in the old release band', () => {
    const closed = createMockLandmarks({ x: 0.45, y: 0.32, z: 0 }, { x: 0.46, y: 0.32, z: 0 });
    const opening = createMockLandmarks({ x: 0.45, y: 0.32, z: 0 }, { x: 0.565, y: 0.32, z: 0 });
    expect(computeGestures(closed).isPinching).toBe(true);
    expect(computeGestures(opening, null, { previousPinching: true }).isPinching).toBe(false);
    expect(computeGestures(opening, null, { previousPinching: true, pinchReleaseThreshold: 0.44 }).isPinching).toBe(true);
  });

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
      { x: 0.602, y: 0.5, z: 0 },
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

  it('detects forward point / push-in air-tap towards camera', () => {
    // Hand scale: wrist to middle knuckle span = 0.2, handScale = 0.3
    // Index knuckle (landmark 5) is at z: 0. Index tip (landmark 8) thrust forward to z: -0.07.
    // forwardThrust = (0 - (-0.07)) / 0.3 = 0.233 (> pointThreshold 0.16)
    const landmarks = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },       // thumb tip (far from index, no pinch)
      { x: 0.42, y: 0.35, z: -0.07 }, // index tip thrust forward towards camera
    );
    landmarks[5] = { x: 0.42, y: 0.45, z: 0 }; // index knuckle
    landmarks[6] = { x: 0.42, y: 0.40, z: -0.02 }; // index PIP
    const result = computeGestures(landmarks);
    expect(result.isPinching).toBe(false);
    expect(result.isPointPressed).toBe(true);
    expect(result.isTriggerActive).toBe(true);
    expect(result.triggerVelocity).toBeGreaterThanOrEqual(0.6);
  });

  it('detects pull-out / release when finger is pulled back away from camera', () => {
    // Index tip pulled back to neutral depth (z: 0, same plane as knuckle)
    const landmarks = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.42, y: 0.30, z: 0 }, // index tip upright in hover
    );
    landmarks[5] = { x: 0.42, y: 0.50, z: 0 };
    landmarks[6] = { x: 0.42, y: 0.40, z: 0 };
    const result = computeGestures(landmarks);
    expect(result.isPointPressed).toBe(false);
    expect(result.isTriggerActive).toBe(false);
  });

  it('uses hysteresis on forward point threshold to prevent fluttering', () => {
    // Forward thrust is at 0.11: above release threshold (0.07) but below strike threshold (0.16)
    // handScale = 0.3, z = -0.033 => thrust = 0.11
    const landmarks = createMockLandmarks(
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.42, y: 0.30, z: -0.033 },
    );
    landmarks[5] = { x: 0.42, y: 0.50, z: 0 };
    landmarks[6] = { x: 0.42, y: 0.40, z: 0 };

    // When starting from neutral (not previously pressed), it should not trigger yet
    expect(computeGestures(landmarks, null, { previousPointPressed: false }).isPointPressed).toBe(false);
    // When already held (previously pressed), it should remain held
    expect(computeGestures(landmarks, null, { previousPointPressed: true }).isPointPressed).toBe(true);
  });

  it('detects air-piano vertical tap down (piano key press)', () => {
    // Hand scale: 0.3. Index knuckle at y: 0.38, PIP at y: 0.44, Tip taps down to y: 0.49.
    const landmarks = createMockLandmarks(
      { x: 0.25, y: 0.5, z: 0 },       // thumb tip (far from index, no pinch)
      { x: 0.42, y: 0.49, z: 0 },     // index tip tapped down past PIP
    );
    landmarks[5] = { x: 0.42, y: 0.38, z: 0 }; // index knuckle
    landmarks[6] = { x: 0.42, y: 0.44, z: 0 }; // index PIP
    landmarks[12] = { x: 0.50, y: 0.35, z: 0 }; // middle tip (stays up)

    const result = computeGestures(landmarks);
    expect(result.isPinching).toBe(false);
    expect(result.isPointPressed).toBe(true);
    expect(result.isTriggerActive).toBe(true);
    expect(result.triggerVelocity).toBeGreaterThanOrEqual(0.65);
  });

  it('detects air-piano lift up release (staccato cutoff)', () => {
    // Index tip lifted up to upright hover at y: 0.30 (well above PIP at y: 0.45).
    const landmarks = createMockLandmarks(
      { x: 0.25, y: 0.5, z: 0 },
      { x: 0.42, y: 0.30, z: 0 },     // index tip lifted up
    );
    landmarks[5] = { x: 0.42, y: 0.50, z: 0 };
    landmarks[6] = { x: 0.42, y: 0.45, z: 0 };
    landmarks[12] = { x: 0.50, y: 0.30, z: 0 };

    const result = computeGestures(landmarks);
    expect(result.isPointPressed).toBe(false);
    expect(result.isTriggerActive).toBe(false);
  });
});
