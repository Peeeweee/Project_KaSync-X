import type { Landmark } from '@mediapipe/tasks-vision';

export class HandEmaFilter {
  private previousLandmarks: Landmark[][] = [];
  private alpha: number;

  constructor(alpha: number = 0.5) {
    this.alpha = alpha;
  }

  /** Mutate the smoothing factor without allocating a new filter instance. */
  setAlpha(alpha: number) {
    this.alpha = alpha;
  }

  filter(currentLandmarks: Landmark[][]): Landmark[][] {
    // If hand count changed, reset filter to avoid interpolating between different hands
    if (this.previousLandmarks.length !== currentLandmarks.length) {
      this.previousLandmarks = currentLandmarks.map((hand) =>
        hand.map((pt) => ({ ...pt }))
      );
      return currentLandmarks;
    }

    const smoothedHands = currentLandmarks.map((hand, handIdx) => {
      return hand.map((point, pointIdx) => {
        const prev = this.previousLandmarks[handIdx][pointIdx];
        return {
          x: this.alpha * point.x + (1 - this.alpha) * prev.x,
          y: this.alpha * point.y + (1 - this.alpha) * prev.y,
          z: this.alpha * point.z + (1 - this.alpha) * prev.z,
          visibility: point.visibility,
        };
      });
    });

    this.previousLandmarks = smoothedHands;
    return smoothedHands;
  }
}
