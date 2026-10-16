import { describe, expect, it } from 'vitest';
import { HandEmaFilter } from './emaFilter';

const hand = (x: number) => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }));

describe('smoothing hand identity', () => {
  it('preserves existing smoothing for a continuously tracked hand', () => {
    const filter = new HandEmaFilter(0.5);
    filter.filter([hand(0.2)], ['Left']);
    expect(filter.filter([hand(0.6)], ['Left'])[0][0].x).toBeCloseTo(0.4);
  });
  it('does not blend a replacement hand with the previous hand', () => {
    const filter = new HandEmaFilter(0.5);
    filter.filter([hand(0.2)], ['Left']);
    expect(filter.filter([hand(0.8)], ['Right'])[0][0].x).toBe(0.8);
  });
  it('keeps previously published frames immutable and resets cleanly', () => {
    const filter = new HandEmaFilter(0.5);
    filter.filter([hand(0.2)], ['Left']);
    const published = filter.filter([hand(0.4)], ['Left']);
    filter.filter([hand(0.8)], ['Left']);
    expect(published[0][0].x).toBeCloseTo(0.3);
    filter.reset();
    expect(filter.filter([hand(0.9)], ['Left'])[0][0].x).toBe(0.9);
  });
});
