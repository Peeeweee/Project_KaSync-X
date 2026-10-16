import type { Landmark } from '@mediapipe/tasks-vision';

export class HandEmaFilter {
  private previousLandmarks: Landmark[][] = [];
  private alpha: number;
  private previousIdentities: string[] = [];

  constructor(alpha: number = 0.5) {
    this.alpha = alpha;
  }

  /** Mutate the smoothing factor without allocating a new filter instance. */
  setAlpha(alpha: number) {
    this.alpha = alpha;
  }

  reset() {
    this.previousLandmarks = [];
    this.previousIdentities = [];
  }

  filter(currentLandmarks: Landmark[][], identities?: string[]): Landmark[][] {
    // If hand count changed, reset filter to avoid interpolating between different hands
    if (this.previousLandmarks.length !== currentLandmarks.length) {
      this.previousIdentities = identities ? [...identities] : [];
      this.previousLandmarks = currentLandmarks.map((hand) =>
        hand.map((pt) => ({ ...pt }))
      );
      return currentLandmarks;
    }

    const a = this.alpha;
    const invA = 1 - a;
    const handCount = currentLandmarks.length;
    const smoothedHands: Landmark[][] = new Array(handCount);

    for (let h = 0; h < handCount; h++) {
      const hand = currentLandmarks[h];
      // A newly visible hand must not inherit another hand's smoothed position.
      const identityChanged = identities && identities[h] !== this.previousIdentities[h];
      const prevHand = identityChanged ? [] : this.previousLandmarks[h];
      const count = hand.length;
      const smoothedHand: Landmark[] = new Array(count);

      for (let i = 0; i < count; i++) {
        const point = hand[i];
        const prev = prevHand[i];
        if (prev) {
          smoothedHand[i] = {
            x: a * point.x + invA * prev.x,
            y: a * point.y + invA * prev.y,
            z: a * point.z + invA * prev.z,
          };
        } else {
          smoothedHand[i] = { ...point };
        }
      }
      smoothedHands[h] = smoothedHand;
    }

    this.previousIdentities = identities ? [...identities] : [];
    this.previousLandmarks = smoothedHands;
    return smoothedHands;
  }
}
