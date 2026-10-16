import { describe, expect, it } from 'vitest';
import { PinchPressTracker } from './pinchPressTracker';

const rest = { isPinching: true, pinchStrength: 0.8 };
describe('PinchPressTracker', () => {
  it('keeps a closed pinch sounding through approach, retreat, and note navigation', () => {
    const tracker = new PinchPressTracker();
    expect(tracker.update(rest).pressId).toBe(1);
    for (const handScale of [0.3, 0.318, 0.28, 0.4, 0.2, 0.3]) {
      for (const cameraTipX of [0.1, 0.5, 0.9]) {
        const sample = { ...rest, handScale, cameraTipX, cameraTipY: cameraTipX,
          cameraPalmX: cameraTipX, handRotation: cameraTipX, palmTilt: cameraTipX };
        expect(tracker.update(sample)).toMatchObject({ isKeyDown: true, pressId: 1, articulationReason: 'hold' });
      }
    }
  });
  it('releases on opening and re-strikes only on closing, without a dwell timer', () => {
    const tracker = new PinchPressTracker();
    tracker.update(rest);
    expect(tracker.update({ ...rest, isPinching: false })).toMatchObject({ isKeyDown: false, pressId: 1 });
    expect(tracker.update({ ...rest, isPinching: false }).pressId).toBe(1);
    expect(tracker.update({ ...rest, pinchStrength: 0.9 })).toMatchObject({ isKeyDown: true, pressId: 2, pressVelocity: 0.9 });
    expect(tracker.update(rest).pressId).toBe(2);
  });
});
