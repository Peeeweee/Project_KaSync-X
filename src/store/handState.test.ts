import { describe, expect, it, vi } from 'vitest';
import { useHandStore, type HandData } from './handState';

describe('tracking status notifications', () => {
  it('notifies subscribers only when tracking starts or stops', () => {
    useHandStore.getState().setIsTracking(false);
    const subscriber = vi.fn();
    const unsubscribe = useHandStore.subscribe(subscriber);
    try {
      for (let frame = 0; frame < 60; frame++) {
        useHandStore.getState().setIsTracking(true);
      }
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(useHandStore.getState().isTracking).toBe(true);
      useHandStore.getState().setIsTracking(false);
      useHandStore.getState().setIsTracking(false);
      expect(subscriber).toHaveBeenCalledTimes(2);
      expect(useHandStore.getState().isTracking).toBe(false);
    } finally {
      unsubscribe();
    }
  });
});

describe('complete detection updates', () => {
  it('publishes tracking readiness with the first hand, without waiting for a second notification', () => {
    useHandStore.getState().setHands([], []);
    useHandStore.getState().setIsTracking(false);
    const first: HandData = { landmarks: [], handedness: 'Left',
      isPinching: true, pinchStrength: 1, pinchDistance: 0,
      palmPosition: { x: 0.5, y: 0.5 }, indexTipPosition: { x: 0.5, y: 0.5 }, handRotation: 0 };
    const observations: boolean[] = [];
    const unsubscribe = useHandStore.subscribe(state => observations.push(state.isTracking));
    try {
      useHandStore.getState().setHands([first], [first]);
      expect(observations).toEqual([true]);
      useHandStore.getState().setHands([], []);
      expect(observations).toEqual([true, false]);
    } finally { unsubscribe(); }
  });
  it('retains depth, palm and rotation changes even with a stationary fingertip', () => {
    const first: HandData = {
      landmarks: [{ x: 0.5, y: 0.5, z: 0 }], handedness: 'Left',
      isPinching: false, pinchStrength: 0, pinchDistance: 1,
      palmPosition: { x: 0.5, y: 0.5 }, indexTipPosition: { x: 0.5, y: 0.5 },
      handRotation: 0, pointDepth: 0.1,
    };
    useHandStore.getState().setHands([first], [first]);
    const next = { ...first, pointDepth: 0.8, handRotation: 0.5, palmPosition: { x: 0.6, y: 0.5 } };
    useHandStore.getState().setHands([next], [next]);
    expect(useHandStore.getState().smoothedHands[0]).toBe(next);
    useHandStore.getState().setHands([], []);
  });
});
