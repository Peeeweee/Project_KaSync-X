import { describe, expect, it } from 'vitest';
import type { HandData } from '../store/handState';
import { HandRoleTracker } from './handRoleTracker';

function hand(handedness: string, x: number): HandData {
  return {
    handedness,
    landmarks: [],
    isPinching: false,
    pinchStrength: 0,
    pinchDistance: 1,
    palmPosition: { x, y: 0.5 },
    indexTipPosition: { x, y: 0.5 },
    handRotation: 0,
  };
}

describe('HandRoleTracker', () => {
  it('assigns initial roles by screen position', () => {
    const tracker = new HandRoleTracker();
    const result = tracker.assign([hand('Right', 0.8), hand('Left', 0.2)]);

    expect(result.find(item => item.handedness === 'Left')?.screenRole).toBe('left');
    expect(result.find(item => item.handedness === 'Right')?.screenRole).toBe('right');
  });

  it('updates single hand role based on screen side', () => {
    const tracker = new HandRoleTracker();
    expect(tracker.assign([hand('Left', 0.2)])[0].screenRole).toBe('left');
    expect(tracker.assign([hand('Left', 0.8)])[0].screenRole).toBe('right');
  });

  it('clears remembered roles on reset', () => {
    const tracker = new HandRoleTracker();
    tracker.assign([hand('Left', 0.2)]);
    tracker.reset();

    expect(tracker.assign([hand('Left', 0.8)])[0].screenRole).toBe('right');
  });
});
