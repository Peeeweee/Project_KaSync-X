import type { Landmark } from '@mediapipe/tasks-vision';
import { landmarkToScreen } from './coordUtils';

export function computeGestures(landmarks: Landmark[], videoEl?: HTMLVideoElement | null) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];

  const dx = thumbTip.x - indexTip.x;
  const dy = thumbTip.y - indexTip.y;
  const dz = thumbTip.z - indexTip.z;

  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const PINCH_THRESHOLD = 0.06;
  const MAX_PINCH_DIST = 0.1;
  const MIN_PINCH_DIST = 0.02;

  const isPinching = distance < PINCH_THRESHOLD;

  const clampedDist = Math.max(MIN_PINCH_DIST, Math.min(MAX_PINCH_DIST, distance));
  const pinchStrength = 1 - (clampedDist - MIN_PINCH_DIST) / (MAX_PINCH_DIST - MIN_PINCH_DIST);

  const palmBases = [0, 5, 9, 13, 17];
  let palmX = 0;
  let palmY = 0;
  palmBases.forEach((idx) => {
    palmX += landmarks[idx].x;
    palmY += landmarks[idx].y;
  });
  palmX /= palmBases.length;
  palmY /= palmBases.length;

  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  const handRotation = Math.atan2(middleBase.y - wrist.y, middleBase.x - wrist.x);

  // Use proper screen-space coordinates if video element is available
  // This accounts for object-cover cropping + mirror flip
  let palmPosition: { x: number; y: number };
  let indexTipPosition: { x: number; y: number };

  if (videoEl) {
    palmPosition = landmarkToScreen(palmX, palmY, videoEl);
    indexTipPosition = landmarkToScreen(indexTip.x, indexTip.y, videoEl);
  } else {
    // Fallback: simple flip only
    palmPosition = { x: 1 - palmX, y: palmY };
    indexTipPosition = { x: 1 - indexTip.x, y: indexTip.y };
  }

  return {
    isPinching,
    pinchStrength,
    palmPosition,
    indexTipPosition,
    handRotation,
  };
}
