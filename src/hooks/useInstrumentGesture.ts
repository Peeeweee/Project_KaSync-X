import { useEffect, useRef } from "react";
import { useHandStore } from "../store/handState";
import { useMusicStore } from "../store/musicState";

// ─── Tuning constants ────────────────────────────────────────────────────────

/** Minimum horizontal palm travel (in normalised 0-1 coords) to count as a swipe. */
const SWIPE_THRESHOLD = 0.08;

/** Window of time (ms) over which palm travel is measured. */
const SWIPE_WINDOW_MS = 220;

/** Minimum gap between consecutive instrument switches (prevents rapid-fire). */
const SWITCH_COOLDOWN_MS = 1200;

/**
 * Ring buffer slot — stores a palm X sample with its timestamp.
 * We keep the last N ms worth of samples and compare oldest vs newest.
 */
interface XSample {
  x: number;
  t: number;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useInstrumentGesture
 *
 * Detects a left-right palm swipe on the RIGHT hand (leaving the left hand free
 * to trigger chords) and cycles the active instrument accordingly.
 *
 * Gesture rules:
 *  - Only fires when the hand is NOT pinching (avoids conflicts with chord play).
 *  - Swipe right  (Δx > +SWIPE_THRESHOLD) → next instrument
 *  - Swipe left   (Δx < -SWIPE_THRESHOLD) → previous instrument
 *  - 1.2 s cooldown between switches.
 */
export function useInstrumentGesture() {
  const samplesRef      = useRef<XSample[]>([]);
  const lastSwitchRef   = useRef<number>(0);

  useEffect(() => {
    // Subscribe directly to the hand store so we run outside React's render cycle.
    const unsubHands = useHandStore.subscribe((state) => {
      const { smoothedHands } = state;

      // Prefer right hand; fall back to any available hand.
      const rightHand =
        smoothedHands.find((h) => h.handedness === "Right") ??
        smoothedHands.find((h) => h.handedness === "Left");

      if (!rightHand) {
        samplesRef.current = [];
        return;
      }

      // Do not register swipes while the hand is pinching — that is a note/chord trigger.
      if (rightHand.isPinching) {
        samplesRef.current = [];
        return;
      }

      const now = performance.now();
      const palmX = rightHand.palmPosition.x;

      // Push sample into the rolling buffer.
      samplesRef.current.push({ x: palmX, t: now });

      // Prune samples older than the measurement window.
      const cutoff = now - SWIPE_WINDOW_MS;
      samplesRef.current = samplesRef.current.filter((s) => s.t >= cutoff);

      if (samplesRef.current.length < 2) return;

      const oldest = samplesRef.current[0];
      const newest = samplesRef.current[samplesRef.current.length - 1];
      const delta  = newest.x - oldest.x;

      if (Math.abs(delta) < SWIPE_THRESHOLD) return;

      // Enforce cooldown.
      if (now - lastSwitchRef.current < SWITCH_COOLDOWN_MS) return;

      lastSwitchRef.current = now;
      samplesRef.current    = []; // reset after a detected swipe

      const dir = delta > 0 ? 1 : -1; // right = next, left = prev
      useMusicStore.getState().cycleInstrument(dir);
    });

    return () => {
      unsubHands();
    };
  }, []);
}
