import type { Landmark } from '@mediapipe/tasks-vision';
import { landmarkToScreen } from './coordUtils';

export interface GestureOptions {
  previousPinching?: boolean;
  pinchThreshold?: number;
  pinchReleaseThreshold?: number;
  mirrored?: boolean;
}

function distance3d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function computeGestures(
  landmarks: Landmark[],
  videoEl?: HTMLVideoElement | null,
  options: GestureOptions = {},
) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const palmWidth = distance3d(landmarks[5], landmarks[17]);
  const palmLength = distance3d(landmarks[0], landmarks[9]);
  const handScale = Math.max(palmWidth, palmLength * 1.5, 0.04);
  const pinchDistance = distance3d(thumbTip, indexTip) / handScale;

  const pinchThreshold = options.pinchThreshold ?? 0.32;
  const pinchReleaseThreshold = Math.max(
    pinchThreshold + 0.03,
    options.pinchReleaseThreshold ?? 0.44,
  );
  const activeThreshold = options.previousPinching ? pinchReleaseThreshold : pinchThreshold;
  const isPinching = pinchDistance < activeThreshold;
  const strengthFloor = Math.min(0.08, pinchThreshold * 0.25);
  const pinchStrength = 1 - Math.max(
    0,
    Math.min(1, (pinchDistance - strengthFloor) / (pinchReleaseThreshold - strengthFloor)),
  );

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
    palmPosition = landmarkToScreen(palmX, palmY, videoEl, options.mirrored ?? true);
    indexTipPosition = landmarkToScreen(indexTip.x, indexTip.y, videoEl, options.mirrored ?? true);
  } else {
    const screenX = (x: number) => options.mirrored === false ? x : 1 - x;
    palmPosition = { x: screenX(palmX), y: palmY };
    indexTipPosition = { x: screenX(indexTip.x), y: indexTip.y };
  }

  return {
    isPinching,
    pinchStrength,
    pinchDistance,
    palmPosition,
    indexTipPosition,
    handRotation,
  };
}
