import { describe, expect, it } from 'vitest';
import { projectedHand } from '../tests/projectedHand';
import { estimateHandPressPose } from './handPressPose';

describe('3D palm translation fit', () => {
  it('separates forward travel from lateral travel and hand rotation', () => {
    for (const [depth, x, y, angle] of [[0.6, 0, 0, 0], [0.58, 0, 0, 0],
      [0.6, 0.08, -0.04, 0], [0.6, 0.08, -0.04, 0.5]]) {
      const p = projectedHand(depth, x, y, angle);
      const fit = estimateHandPressPose(p.image, p.world, 1280, 720)!;
      expect(fit.depth).toBeCloseTo(depth, 6);
      expect(fit.x).toBeCloseTo(x, 6);
      expect(fit.y).toBeCloseTo(y, 6);
      expect(fit.fitError).toBeLessThan(1e-6);
    }
  });
  it('rejects missing or inconsistent geometry instead of inventing key events', () => {
    const p = projectedHand(0.6);
    expect(estimateHandPressPose(p.image, undefined, 1280, 720)).toBeNull();
    p.image[5].x += 0.2;
    expect(estimateHandPressPose(p.image, p.world, 1280, 720)).toBeNull();
  });
});

