import { create } from 'zustand';
import type { Landmark } from '@mediapipe/tasks-vision';

export interface HandData {
  landmarks: Landmark[];
  handedness: string; // 'Left' or 'Right'
  isPinching: boolean;
  pinchStrength: number;
  palmPosition: { x: number; y: number };
  indexTipPosition: { x: number; y: number }; // index fingertip (landmark 8), x already mirrored
  handRotation: number;
}

interface HandState {
  rawHands: HandData[];
  smoothedHands: HandData[];
  isTracking: boolean;
  setHands: (raw: HandData[], smoothed: HandData[]) => void;
  setIsTracking: (isTracking: boolean) => void;
}

export const useHandStore = create<HandState>((set, get) => ({
  rawHands: [],
  smoothedHands: [],
  isTracking: false,
  setHands: (rawHands, smoothedHands) => {
    const prev = get();
    // Skip the update if hand count is the same and key gesture values are identical.
    // This prevents no-op re-renders at 20 FPS across all subscribers.
    if (
      prev.rawHands.length === rawHands.length &&
      prev.smoothedHands.length === smoothedHands.length &&
      smoothedHands.every((h, i) => {
        const p = prev.smoothedHands[i];
        return (
          p &&
          h.isPinching === p.isPinching &&
          Math.abs(h.pinchStrength - p.pinchStrength) < 0.005 &&
          Math.abs(h.indexTipPosition.x - p.indexTipPosition.x) < 0.002 &&
          Math.abs(h.indexTipPosition.y - p.indexTipPosition.y) < 0.002
        );
      })
    ) return;
    set({ rawHands, smoothedHands });
  },
  setIsTracking: (isTracking) => set({ isTracking }),
}));

