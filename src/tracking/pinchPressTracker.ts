interface PinchSample {
  isPinching: boolean;
  pinchStrength: number;
}

/** Only explicit pinch edges control the key; camera distance is not a pedal. */
export class PinchPressTracker {
  private down = false;
  private id = 0;
  private velocity = 0.8;

  update(sample: PinchSample) {
    const pressed = sample.isPinching && !this.down;
    if (pressed) {
      this.id++;
      this.velocity = sample.pinchStrength;
    }
    this.down = sample.isPinching;
    return {
      isKeyDown: this.down,
      pressId: this.id,
      pressVelocity: this.velocity,
      articulationReason: !this.down ? 'open' as const : pressed ? 'pinch-start' as const : 'hold' as const,
    };
  }
}
