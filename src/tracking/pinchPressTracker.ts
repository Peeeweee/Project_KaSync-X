import { FingerArticulationTracker, type FingerCurls } from './fingerArticulation';

interface PinchSample {
  isPinching: boolean;
  pinchStrength: number;
  fingerCurls?: FingerCurls;
}

/** Pinch holds the pitch; the three free fingers perform key-down/up events. */
export class PinchPressTracker {
  private down = false;
  private id = 0;
  private velocity = .8;
  private pinching = false;
  private fingers = new FingerArticulationTracker();

  update(sample: PinchSample) {
    let reason: 'open' | 'pinch-start' | 'hold' | 'finger-press' | 'finger-lift' = 'hold';
    let articulatingFingers: string[] = [];
    if (!sample.isPinching) {
      this.pinching = false; this.down = false; this.fingers.reset(); reason = 'open';
    } else if (!this.pinching) {
      this.pinching = true; this.down = true; this.id++;
      this.velocity = sample.pinchStrength;
      this.fingers.reset(sample.fingerCurls);
      reason = 'pinch-start';
    } else if (sample.fingerCurls) {
      const frame = this.fingers.update(sample.fingerCurls);
      articulatingFingers = frame.fingers;
      if (frame.strikes > 0) {
        this.down = true; this.id++; this.velocity = sample.pinchStrength; reason = 'finger-press';
      } else if (frame.lifts > 0 && frame.fingers.length === 0) {
        this.down = false; reason = 'finger-lift';
      }
    }
    return { isKeyDown: this.down, pressId: this.id, pressVelocity: this.velocity,
      articulationReason: reason, articulatingFingers };
  }
}
