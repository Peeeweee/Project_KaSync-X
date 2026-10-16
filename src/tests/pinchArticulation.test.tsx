import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Landmark } from '@mediapipe/tasks-vision';
import { useAudioTrigger } from '../hooks/useAudioTrigger';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { computeGestures } from '../tracking/gestureRecognizer';
import { PinchPressTracker } from '../tracking/pinchPressTracker';
import { PointTapTracker } from '../tracking/pointTapTracker';
import { looperService } from '../looper/recorder';
import { fingerPinchHand } from './fingerPinchHand';
import { measureFingerCurls } from '../tracking/fingerArticulation';

vi.mock('../looper/recorder', () => ({ looperService: {
  triggerNote: vi.fn(), triggerChord: vi.fn(), releaseNote: vi.fn(), releaseChord: vi.fn(), keepLiveNotesAlive: vi.fn(),
} }));

// These are normalized camera coordinates, not pre-labelled pinch booleans.
function pose(gap: number, scale = 1): Landmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0] = { x: 0.5, y: 0.7, z: 0 };
  points[9] = { x: 0.5, y: 0.5, z: 0 };
  points[5] = { x: 0.45, y: 0.5, z: 0 };
  points[17] = { x: 0.55, y: 0.5, z: 0 };
  points[4] = { x: 0.45, y: 0.32, z: 0 };
  points[6] = { x: 0.45, y: 0.42, z: 0 };
  points[8] = { x: 0.45 + gap, y: 0.32, z: 0 };
  return points.map(p => ({ x: 0.5 + (p.x - 0.5) * scale,
    y: 0.5 + (p.y - 0.5) * scale, z: p.z * scale }));
}

afterEach(() => { cleanup(); useHandStore.getState().setHands([], []); vi.clearAllMocks(); });

describe('landmark-to-audio pinch articulation', () => {
  it.each(['Chord', 'Song', 'Melody'] as const)('re-strikes and stops seven free-finger presses in %s', mode => {
    useMusicStore.getState().setMusicState({ mode, hoveredRoot: 'C', hoveredQuality: 'maj',
      hoveredBass: null, hoveredEffect: null, playingNotes: [] });
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    renderHook(() => useAudioTrigger(true));
    const press = new PinchPressTracker();
    let previousPinching = false;
    const publish = (bends = [0,0,0], depth = .6, x = 0, y = 0) => {
      const { image, world } = fingerPinchHand(bends, depth, x, y);
      const gestures = computeGestures(image, video, { previousPinching });
      expect(gestures.isPinching).toBe(true);
      previousPinching = gestures.isPinching;
      const key = press.update({ ...gestures, fingerCurls: measureFingerCurls(image,720/1280,world) });
      const hand = { ...gestures, ...key, landmarks: image, handedness: 'Left', screenRole: 'left' as const };
      act(() => useHandStore.getState().setHands([hand], [hand]));
    };
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    publish();
    // Navigation changes pitch without an articulation-induced release.
    publish([0,0,0],0.58, 0.05, 0.03);
    expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
    publish([0,0,0],0.6, 0.1, 0.04);
    expect(attack).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 8; i++) {
      const bends = [0,0,0]; bends[(i-2)%3] = 1;
      publish(bends);
      expect(attack).toHaveBeenCalledTimes(i);
      expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
      publish(bends,.55,.08,.04);
      expect(attack).toHaveBeenCalledTimes(i);
      expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
      publish();
      expect(useMusicStore.getState().playingNotes).toEqual([]);
    }
  });
  it.each(['Chord', 'Song', 'Melody'] as const)('plays and releases seven small openings, retaining navigation holds in %s', mode => {
    useHandStore.getState().setHands([], []);
    useMusicStore.getState().setMusicState({ mode, hoveredRoot: 'C', hoveredQuality: 'maj',
      hoveredBass: null, hoveredEffect: null, playingNotes: [] });
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 } });
    renderHook(() => useAudioTrigger(true));
    const press = new PinchPressTracker();
    const tap = new PointTapTracker();
    let previousPinching = false;
    const publish = (gap: number, scale = 1) => {
      const landmarks = pose(gap, scale);
      const gestures = computeGestures(landmarks, video, { previousPinching });
      previousPinching = gestures.isPinching;
      const point = tap.update(gestures);
      const key = press.update(gestures);
      const hand = { ...gestures, ...key, landmarks, handedness: 'Left', screenRole: 'left' as const,
        isPointPressed: point, isKeyDown: key.isKeyDown || point };
      act(() => useHandStore.getState().setHands([hand], [hand]));
      return hand;
    };
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    for (let i = 1; i <= 7; i++) {
      expect(publish(0.015).isPinching).toBe(true);
      expect(attack).toHaveBeenCalledTimes(i);
      for (const scale of [0.8, 1.15, 1]) {
        publish(0.015, scale);
        expect(attack).toHaveBeenCalledTimes(i);
        expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
      }
      const opening = publish(0.065);
      expect(opening.pinchDistance).toBeGreaterThan(0.36);
      expect(opening.pinchDistance).toBeLessThan(0.44);
      expect(opening.isPinching).toBe(false);
      expect(useMusicStore.getState().playingNotes).toEqual([]);
    }
  });
});
