import { describe, expect, it } from 'vitest';
import { PointTapTracker } from './pointTapTracker';

const sample = (verticalTapScore = -0.3, forwardThrust = 0.4) => ({
  verticalTapScore, forwardThrust, isIndexExtended: true, isPinching: false,
});

describe('PointTapTracker', () => {
  it('recognizes a straight-finger downward press without changing finger bend/depth', () => {
    const tracker = new PointTapTracker();
    const rest = { ...sample(), handScale: 0.3, cameraTipY: 0.3 };
    tracker.update(rest);
    expect(tracker.update({ ...rest, cameraTipY: 0.36 })).toBe(true);
    expect(tracker.update({ ...rest, cameraTipY: 0.36 })).toBe(true);
    expect(tracker.update(rest)).toBe(false);
    expect(tracker.update({ ...rest, cameraTipY: 0.36 })).toBe(true);
  });

  it('recognizes an approaching rigid hand and rearms after it pulls back', () => {
    const tracker = new PointTapTracker();
    const rest = { ...sample(), handScale: 0.3, cameraTipY: 0.3 };
    tracker.update(rest);
    expect(tracker.update({ ...rest, handScale: 0.33 })).toBe(true);
    expect(tracker.update(rest)).toBe(false);
    expect(tracker.update({ ...rest, handScale: 0.33 })).toBe(true);
  });

  it('ignores small whole-hand motion and scale jitter', () => {
    const tracker = new PointTapTracker();
    for (let i = 0; i < 100; i++) {
      expect(tracker.update({ ...sample(), handScale: i % 2 ? 0.306 : 0.3,
        cameraTipY: i % 2 ? 0.305 : 0.3 })).toBe(false);
    }
  });
  it('recognizes a relative tap that never passes below the middle joint', () => {
    const tracker = new PointTapTracker();
    tracker.update(sample(-0.7, 0.4));
    expect(tracker.update(sample(-0.4, 0.4))).toBe(true);
    expect(tracker.update(sample(-0.7, 0.4))).toBe(false);
    expect(tracker.update(sample(-0.4, 0.4))).toBe(true);
  });

  it('allows the extended index to bend during the strike and lift to release', () => {
    const tracker = new PointTapTracker();
    tracker.update(sample(-0.7));
    expect(tracker.update({ ...sample(-0.4), isIndexExtended: false })).toBe(true);
    expect(tracker.update(sample(-0.7))).toBe(false);
  });
  it('does not interpret a stationary open hand/depth pose as repeated taps', () => {
    const tracker = new PointTapTracker();
    for (let i = 0; i < 100; i++) expect(tracker.update(sample())).toBe(false);
  });

  it('releases a vertical tap even when forward depth remains high; requires retreat', () => {
    const tracker = new PointTapTracker();
    tracker.update(sample());
    expect(tracker.update(sample(0.1))).toBe(true);
    expect(tracker.update(sample(0.1))).toBe(true);
    expect(tracker.update(sample(-0.02))).toBe(false);
    expect(tracker.update(sample(0.12))).toBe(false);
    expect(tracker.update(sample())).toBe(false);
    expect(tracker.update(sample(0.1))).toBe(true);
  });

  it('recognizes forward movement and resets through a pinch', () => {
    const tracker = new PointTapTracker();
    tracker.update(sample(-0.3, 0.05));
    expect(tracker.update(sample(-0.3, 0.3))).toBe(true);
    expect(tracker.update({ ...sample(), isPinching: true })).toBe(false);
    expect(tracker.update(sample())).toBe(false);
  });
});
