import { create } from 'zustand';
import type { Landmark } from '@mediapipe/tasks-vision';

export type ScreenRole = 'left' | 'right';

export interface HandData {
  landmarks: Landmark[];
  handedness: string; // 'Left' or 'Right'
  isPinching: boolean;
  pinchStrength: number;
  pinchDistance: number;
  isPointPressed?: boolean;
  isKeyDown?: boolean;
  pressId?: number;
  pressVelocity?: number;
  articulationReason?: 'open' | 'pinch-start' | 'navigation' | 'hold' | 'depth-press' | 'depth-release';
  pointDepth?: number;
  pointVelocity?: number;
  isTriggerActive?: boolean;
  triggerVelocity?: number;
  palmPosition: { x: number; y: number };
  indexTipPosition: { x: number; y: number }; // index fingertip (landmark 8), x already mirrored
  handRotation: number;
  screenRole?: ScreenRole;
}

interface HandState {
  rawHands: HandData[];
  smoothedHands: HandData[];
  isTracking: boolean;
  setHands: (raw: HandData[], smoothed: HandData[]) => void;
  setIsTracking: (isTracking: boolean) => void;
}

let publishingHandFrames = 0;
const frameListeners = new Set<() => void>();

/** Audio runs after every wheel subscriber has resolved this detection's pitch. */
export function subscribeToHandFrames(listener: () => void) {
  frameListeners.add(listener);
  return () => { frameListeners.delete(listener); };
}

export function isPublishingHandFrame() {
  return publishingHandFrames > 0;
}

export const useHandStore = create<HandState>((set, get) => ({
  rawHands: [],
  smoothedHands: [],
  isTracking: false,
  setHands: (rawHands, smoothedHands) => {
    const prev = get();
    // Every new detection can contain meaningful depth, rotation, or palm movement,
    // even when the index tip stays still. Only skip repeated references or empty frames.
    if (prev.isTracking === (smoothedHands.length > 0) && (
      (prev.rawHands === rawHands && prev.smoothedHands === smoothedHands) ||
      (prev.rawHands.length === 0 && rawHands.length === 0 &&
        prev.smoothedHands.length === 0 && smoothedHands.length === 0)
    )) return;
    publishingHandFrames++;
    try {
      set({ rawHands, smoothedHands, isTracking: smoothedHands.length > 0 });
    } finally {
      publishingHandFrames--;
    }
    if (!publishingHandFrames) frameListeners.forEach(listener => listener());
  },
  setIsTracking: (isTracking) => {
    if (get().isTracking !== isTracking) set({ isTracking });
  },
}));
