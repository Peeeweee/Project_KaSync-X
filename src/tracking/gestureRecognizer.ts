import type { Landmark } from '@mediapipe/tasks-vision';
import { landmarkToScreen } from './coordUtils';

export interface GestureOptions {
  previousPinching?: boolean;
  pinchThreshold?: number;
  pinchReleaseThreshold?: number;
  previousPointPressed?: boolean;
  pointThreshold?: number;
  pointReleaseThreshold?: number;
  tapThreshold?: number;
  tapReleaseThreshold?: number;
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

  // ── Air Piano Tap Detection (Vertical Tap Down & Lift Up) ──
  // User taps their index finger down in the air (like hitting an imaginary piano key).
  // In screen space, Y increases downwards:
  // - When hovering / resting upright: indexTip.y is far above indexPIP.y (negative dip).
  // - When tapping down: indexTip.y dips down level with or past indexPIP.y.
  // - Lifting finger back up drops below release threshold, instantly choking the note.
  const indexKnuckle = landmarks[5]; // index MCP
  const indexPIP     = landmarks[6]; // index PIP
  const middleMCP    = landmarks[9]; // middle finger MCP
  const wrist        = landmarks[0]; // wrist

  // Vertical tap score: measures index finger downward dip relative to PIP joint
  const verticalTapScore = (indexTip.y - indexPIP.y) / handScale;

  const tapStrikeThreshold = options.tapThreshold ?? 0.0;
  const tapReleaseThreshold = options.tapReleaseThreshold ?? -0.15;
  const activeTapThreshold = options.previousPointPressed ? tapReleaseThreshold : tapStrikeThreshold;
  const isVerticalTap = verticalTapScore > activeTapThreshold;

  // ── Forward Point / Push-In Detection (Z-Depth Fallback) ──
  const knuckleForwardZ = (indexKnuckle.z - indexTip.z) / handScale;
  const wristForwardZ   = (wrist.z - indexTip.z) / (handScale * 1.5);
  const pipForwardZ     = (indexPIP.z - indexTip.z) / handScale;
  const forwardThrust = Math.max(knuckleForwardZ, pipForwardZ * 1.3, wristForwardZ * 0.9);

  const pointThreshold = options.pointThreshold ?? 0.16;
  const pointReleaseThreshold = Math.max(0.04, options.pointReleaseThreshold ?? (pointThreshold - 0.09));
  const activePointThreshold = options.previousPointPressed ? pointReleaseThreshold : pointThreshold;
  const isForwardPush = forwardThrust > activePointThreshold;

  // Index finger extension: finger must not be closed into a tight fist
  const indexLength = distance3d(indexKnuckle, indexTip) / handScale;
  const isIndexExtended = indexLength > 0.25;

  // Pose candidate only. Live tracking applies PointTapTracker to require motion
  // and release the initiating channel independently of the other static pose.
  const isPointPressed = (isVerticalTap || isForwardPush) && isIndexExtended && !isPinching;

  // Dynamic strike velocity based on downward tap speed / depth
  const tapVelocity = Math.min(1.0, Math.max(0.6, 0.65 + Math.max(0, verticalTapScore) * 1.8));
  const thrustRange = Math.max(0.12, 0.40 - pointReleaseThreshold);
  const normalizedThrust = Math.max(0, Math.min(1.0, (forwardThrust - pointReleaseThreshold) / thrustRange));
  const forwardVelocity = Math.min(1.0, Math.max(0.6, 0.6 + normalizedThrust * 0.4));

  const pointVelocity = isVerticalTap ? tapVelocity : forwardVelocity;
  const pointDepth = Math.max(
    0,
    Math.min(1.0, Math.max(verticalTapScore / 0.25, forwardThrust / Math.max(0.2, pointThreshold))),
  );

  const isTriggerActive = isPinching || isPointPressed;
  const triggerVelocity = isPointPressed && !isPinching ? pointVelocity : pinchStrength;

  const palmBases = [0, 5, 9, 13, 17];
  let palmX = 0;
  let palmY = 0;
  palmBases.forEach((idx) => {
    palmX += landmarks[idx].x;
    palmY += landmarks[idx].y;
  });
  palmX /= palmBases.length;
  palmY /= palmBases.length;

  const middleBase = middleMCP;
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
    cameraPalmX: palmX,
    cameraPalmY: palmY,
    palmTilt: (wrist.z - middleMCP.z) / handScale,
    palmYaw: (landmarks[5].z - landmarks[17].z) / handScale,
    handScale,
    cameraTipY: indexTip.y,
    cameraTipX: indexTip.x,
    verticalTapScore,
    forwardThrust,
    isIndexExtended,
    isPinching,
    pinchStrength,
    pinchDistance,
    isPointPressed,
    pointDepth,
    pointVelocity,
    isTriggerActive,
    triggerVelocity,
    palmPosition,
    indexTipPosition,
    handRotation,
  };
}
