import type { HandData } from '../store/handState';

export interface ScreenHands {
  leftHand?: HandData;
  rightHand?: HandData;
}

/**
 * Robustly separates tracked hands into screen-left and screen-right hands.
 * Prevents hand index swapping bugs and handles single-hand interactions cleanly.
 *
 * In screen coordinates:
 * - 0.0 is the left edge of the screen
 * - 1.0 is the right edge of the screen
 */
export function getScreenHands(hands: HandData[]): ScreenHands {
  if (!hands || hands.length === 0) {
    return { leftHand: undefined, rightHand: undefined };
  }

  if (hands.length === 1) {
    const h = hands[0];
    if (h.indexTipPosition.x < 0.52) {
      return { leftHand: h, rightHand: undefined };
    } else {
      return { leftHand: undefined, rightHand: h };
    }
  }

  // 2 or more hands: sort ascending by screen X
  const sorted = [...hands].sort((a, b) => a.indexTipPosition.x - b.indexTipPosition.x);
  const leftCandidate = sorted[0];
  const rightCandidate = sorted[sorted.length - 1];

  return {
    leftHand: leftCandidate.indexTipPosition.x < 0.65 ? leftCandidate : undefined,
    rightHand: rightCandidate.indexTipPosition.x > 0.35 ? rightCandidate : undefined,
  };
}
