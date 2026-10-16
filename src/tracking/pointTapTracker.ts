interface TapSample {
  verticalTapScore: number;
  forwardThrust: number;
  isIndexExtended: boolean;
  isPinching: boolean;
  handScale?: number;
  cameraTipY?: number;
}

/** A pose is not a strike: require movement, then retreat before another strike. */
export class PointTapTracker {
  private baseline: number[] | null = null;
  private channel: number | null = null;
  private peak = 0;
  private released = false;
  private referenceScale = 1;
  private referenceY = 0;

  update(sample: TapSample): boolean {
    if (!this.baseline) {
      this.referenceScale = Math.max(0.04, sample.handScale ?? 1);
      this.referenceY = sample.cameraTipY ?? 0;
    }
    const scores = [sample.verticalTapScore, sample.forwardThrust,
      sample.cameraTipY === undefined ? 0 : (sample.cameraTipY - this.referenceY) / this.referenceScale,
      sample.handScale === undefined ? 0 : 2 * Math.log(Math.max(0.04, sample.handScale) / this.referenceScale),
    ];
    if (sample.isPinching) {
      // Releasing a pinch changes finger geometry; learn the first open pose
      // before looking for a new tap rather than treating that release as one.
      this.baseline = null;
      this.channel = null;
      this.released = false;
      return false;
    }
    if (!this.baseline) {
      if (!sample.isIndexExtended) return false;
      this.baseline = scores;
      this.channel = null;
      this.released = false;
      return false;
    }
    if (this.channel !== null) {
      const value = scores[this.channel];
      this.peak = Math.max(this.peak, value);
      // Only the channel that caused the strike can hold it. A static depth pose
      // must not keep a vertical tap latched after the finger lifts.
      if (value < this.peak - 0.08) this.released = true;
      if (value <= this.baseline[this.channel] + 0.06) {
        this.baseline = scores;
        this.channel = null;
        this.released = false;
        return false;
      }
      return !this.released;
    }
    // A piano-style tap bends an initially extended finger. Its tip can remain
    // above the PIP joint throughout, so absolute y/extension gates miss it.
    const channel = scores.findIndex((value, i) =>
      value - this.baseline![i] > 0.16);
    if (channel >= 0) {
      this.channel = channel;
      this.peak = scores[this.channel];
      return true;
    }
    if (!sample.isIndexExtended) {
      this.baseline = null;
      return false;
    }
    // Follow slow pose changes without learning away a fast tap.
    this.baseline = scores.map((value, i) =>
      this.baseline![i] + (value - this.baseline![i]) * 0.08);
    return false;
  }
}
