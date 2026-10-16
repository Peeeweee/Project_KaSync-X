import type { HandData } from '../store/handState';

export class HandRoleTracker {
  reset() {
    // Spatial tracker is stateless per frame when hands are clear
  }

  assign<T extends HandData>(hands: T[]): T[] {
    if (hands.length === 0) return hands;

    if (hands.length >= 2) {
      // Sort hands horizontally across the screen
      const sorted = [...hands].sort((a, b) => a.indexTipPosition.x - b.indexTipPosition.x);
      sorted[0].screenRole = 'left';
      sorted[sorted.length - 1].screenRole = 'right';
      return hands;
    }

    // Single hand: role dynamically corresponds to the screen half it is currently in
    const single = hands[0];
    single.screenRole = single.indexTipPosition.x < 0.5 ? 'left' : 'right';
    return hands;
  }
}
