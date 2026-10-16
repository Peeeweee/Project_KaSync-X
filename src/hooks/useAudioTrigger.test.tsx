import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioTrigger } from './useAudioTrigger';
import { useHandStore, type HandData } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { looperService } from '../looper/recorder';
import { PinchPressTracker } from '../tracking/pinchPressTracker';
import { useTrackingSettingsStore } from '../store/trackingSettings';

vi.mock('../looper/recorder', () => ({ looperService: {
  triggerChord: vi.fn(), triggerNote: vi.fn(), releaseChord: vi.fn(), releaseNote: vi.fn(),
  keepLiveNotesAlive: vi.fn(),
} }));

const hand = (point = false, pinch = false, role: 'left' | 'right' = 'left'): HandData => ({
  landmarks: [], handedness: role, screenRole: role, isPinching: pinch,
  pinchStrength: 0.8, pinchDistance: 0.2, isPointPressed: point,
  isTriggerActive: point || pinch, triggerVelocity: 0.8,
  palmPosition: { x: 0.3, y: 0.3 }, indexTipPosition: { x: 0.3, y: 0.3 }, handRotation: 0,
});
const publish = (...hands: HandData[]) => act(() => useHandStore.getState().setHands(hands, hands));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: null });
  useHandStore.getState().setHands([], []);
  useMusicStore.getState().setMusicState({ mode: 'Chord', hoveredRoot: 'C', hoveredQuality: 'maj',
    hoveredBass: null, hoveredEffect: null, playingNotes: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('performed piano articulation', () => {
  it.each(['Chord', 'Song', 'Melody'] as const)('plays seven presses after wheel resolution, then a new pitch in %s', mode => {
    useMusicStore.getState().setMusicState({ mode, hoveredRoot: 'B' });
    renderHook(() => useAudioTrigger(true));
    // Register the wheel after audio, as can happen when components remount.
    const wheel = useHandStore.subscribe(state => {
      const current = state.smoothedHands[0];
      if (!current) return;
      useMusicStore.getState().setMusicState({ hoveredRoot: current.isKeyDown
        ? current.indexTipPosition.x > 0.5 ? 'D' : 'C' : 'B' });
    });
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    try {
      for (let id = 1; id <= 7; id++) {
        publish({ ...hand(false, true), isKeyDown: true, pressId: id });
        expect(attack).toHaveBeenCalledTimes(id);
        expect(useMusicStore.getState().playingNotes).toContain('C4');
        publish({ ...hand(), isKeyDown: false, pressId: id });
        expect(useMusicStore.getState().playingNotes).toEqual([]);
      }
      publish({ ...hand(false, true), isKeyDown: true, pressId: 8,
        indexTipPosition: { x: 0.7, y: 0.3 } });
      expect(attack).toHaveBeenCalledTimes(8);
      expect(useMusicStore.getState().playingNotes).toContain('D4');
    } finally { wheel(); }
  });
  it.each(['Chord', 'Song', 'Melody'] as const)('bridges an owner dropout without choking or stealing the voice in %s', mode => {
    useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: 8 });
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    const owner = { ...hand(false, true), isKeyDown: true, pressId: 3 };
    const other = { ...hand(false, true, 'right'), isKeyDown: true, pressId: 2 };
    publish(owner, other);
    vi.mocked(looperService.releaseChord).mockClear();
    vi.mocked(looperService.releaseNote).mockClear();
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    publish(other);
    act(() => vi.advanceTimersByTime(150));
    publish({ ...owner, pressId: 1 }, other);
    expect(looperService.releaseChord).not.toHaveBeenCalled();
    expect(looperService.releaseNote).not.toHaveBeenCalled();
    expect(attack).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(100));
    expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
  });
  it.each(['Chord', 'Song', 'Melody'] as const)('keeps note transitions legato despite depth changes and wheel gaps in %s', mode => {
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    const tracker = new PinchPressTracker();
    const rest = { isPinching: true, pinchStrength: 0.8 };
    publish({ ...hand(false, true), ...tracker.update(rest) });
    vi.mocked(looperService.releaseChord).mockClear();
    vi.mocked(looperService.releaseNote).mockClear();
    for (const [root, handScale] of [['D', 0.318], ['E', 0.28], ['F', 0.4]] as const) {
      act(() => useMusicStore.getState().setMusicState({ hoveredRoot: null }));
      const sample = { ...rest, handScale };
      publish({ ...hand(false, true), ...tracker.update(sample) });
      expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
      act(() => useMusicStore.getState().setMusicState({ hoveredRoot: root }));
      expect(useMusicStore.getState().playingNotes).toContain(`${root}4`);
    }
    expect(looperService.releaseChord).not.toHaveBeenCalled();
    expect(looperService.releaseNote).not.toHaveBeenCalled();
    publish({ ...hand(), ...tracker.update({ ...rest, isPinching: false }) });
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    publish({ ...hand(false, true), ...tracker.update(rest) });
    expect(useMusicStore.getState().playingNotes).toContain('F4');
  });
  it.each(['Chord', 'Song', 'Melody'] as const)('follows key-down/up duration in %s, even while the pinch stays closed', mode => {
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    publish({ ...hand(false, true), isKeyDown: true, pressId: 1 });
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    expect(attack).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(700));
    expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
    publish({ ...hand(false, true), isKeyDown: false, pressId: 1 });
    expect(looperService.releaseChord).toHaveBeenLastCalledWith(false, true);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    publish({ ...hand(false, true), isKeyDown: false, pressId: 1 });
    expect(attack).toHaveBeenCalledTimes(1);
    publish({ ...hand(false, true), isKeyDown: true, pressId: 2, pressVelocity: 0.9 });
    expect(attack).toHaveBeenCalledTimes(2);
    expect(attack).toHaveBeenLastCalledWith(mode === 'Melody' ? 'C4' : expect.arrayContaining(['C4', 'E4', 'G4']), 0.9);
    act(() => vi.advanceTimersByTime(35));
    publish({ ...hand(false, true), isKeyDown: false, pressId: 2 });
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });

  it.each(['Chord', 'Song', 'Melody'] as const)('waits for the wheel to resolve a pitch in %s', mode => {
    useMusicStore.getState().setMusicState({ mode, hoveredRoot: null });
    renderHook(() => useAudioTrigger(true));
    publish({ ...hand(false, true), isKeyDown: true, pressId: 1 });
    act(() => useMusicStore.getState().setMusicState({ hoveredRoot: 'C' }));
    expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
    publish({ ...hand(false, true), isKeyDown: false, pressId: 1 });
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });

  it('re-strikes a held pitch on a new press id and ignores repeated notifications', () => {
    renderHook(() => useAudioTrigger(true));
    publish({ ...hand(false, true), isKeyDown: true, pressId: 1 });
    publish({ ...hand(false, true), isKeyDown: true, pressId: 2 });
    publish({ ...hand(false, true), isKeyDown: true, pressId: 2 });
    expect(looperService.triggerChord).toHaveBeenCalledTimes(2);
  });

  it('does not let another held pinch mask the playing hand release', () => {
    renderHook(() => useAudioTrigger(true));
    const other = { ...hand(false, true, 'right'), isKeyDown: true, pressId: 1 };
    publish(other);
    publish({ ...hand(false, true), isKeyDown: true, pressId: 1 }, other);
    publish({ ...hand(false, true), isKeyDown: false, pressId: 1 }, other);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });

  it('releases lost hands after the brief dropout guard', () => {
    renderHook(() => useAudioTrigger(true));
    publish(hand(false, true));
    publish();
    act(() => vi.advanceTimersByTime(89));
    expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(1));
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });
});
