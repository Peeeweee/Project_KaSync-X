import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PPQ,
  durationBetweenTicks,
  loopTicks,
  quantizeAbsoluteTick,
  ticksToSeconds,
  wrapLoopTick,
} from './timing';

describe('looper timing', () => {
  it('quantizes starts and endings to a sixteenth-note grid', () => {
    expect(quantizeAbsoluteTick(70, true)).toBe(48);
    expect(quantizeAbsoluteTick(73, true)).toBe(96);
    expect(quantizeAbsoluteTick(73, false)).toBe(73);
  });

  it('preserves a note duration across the four-bar loop boundary', () => {
    const length = loopTicks();
    const start = length - 24;
    const end = length + 36;

    expect(wrapLoopTick(start)).toBe(length - 24);
    expect(wrapLoopTick(end)).toBe(36);
    expect(durationBetweenTicks(start, end, false)).toBe(60);
  });

  it('stores musical time independently and converts only for export', () => {
    expect(ticksToSeconds(DEFAULT_PPQ * 4, 120)).toBe(2);
    expect(ticksToSeconds(DEFAULT_PPQ * 4, 60)).toBe(4);
  });
});
