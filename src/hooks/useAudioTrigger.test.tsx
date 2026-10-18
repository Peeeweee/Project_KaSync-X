import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioTrigger } from './useAudioTrigger';
import { useHandStore, type HandData } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { looperService } from '../looper/recorder';
import { PinchPressTracker } from '../tracking/pinchPressTracker';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useVolumeGestureStore } from '../store/volumeGesture';
import { useLooperStore } from '../store/looperState';
import { useLiveNoteReleaseStore } from '../diagnostics/liveNoteRelease';
import { useHandRecoveryStore } from '../store/handRecovery';

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
  useHandRecoveryStore.setState({ active: false });
  useLiveNoteReleaseStore.setState({lastRelease:null});
  useVolumeGestureStore.setState({ owner: null, effectOwner: null });
  useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: null });
  useHandStore.getState().setHands([], []);
  useMusicStore.getState().setMusicState({ mode: 'Chord', hoveredRoot: 'C', hoveredQuality: 'maj',
    hoveredBass: null, hoveredEffect: null, playingNotes: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('performed piano articulation', () => {
  it.each(['Chord', 'Song', 'Melody'] as const)('bridges a single-hand dropout at low FPS without a duplicate attack in %s', mode => {
    useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: 8 });
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 3 };
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    publish(note);
    vi.mocked(looperService.releaseChord).mockClear(); vi.mocked(looperService.releaseNote).mockClear();
    publish();
    act(() => vi.advanceTimersByTime(150));
    expect(useHandRecoveryStore.getState().active).toBe(true);
    publish(note);
    expect(attack).toHaveBeenCalledTimes(1);
    expect(useHandRecoveryStore.getState().active).toBe(false);
    act(() => vi.advanceTimersByTime(300));
    expect(looperService.releaseChord).not.toHaveBeenCalled();
    expect(looperService.releaseNote).not.toHaveBeenCalled();
  });

  it.each(['Chord', 'Song', 'Melody'] as const)('preserves a cut through a short gap and resumes its pitch only on lift in %s', mode => {
    useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: 8 });
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    publish(note);
    const first = vi.mocked(attack).mock.calls[0][0];
    publish({ ...note, isKeyDown: false, articulationReason: 'finger-press' });
    publish();
    act(() => useMusicStore.getState().setMusicState({ hoveredRoot: null }));
    act(() => vi.advanceTimersByTime(150));
    publish({ ...note, isKeyDown: false, articulationReason: 'hold' });
    expect(attack).toHaveBeenCalledTimes(1);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    publish({ ...note, pressId: 2, articulationReason: 'finger-lift' });
    expect(attack).toHaveBeenCalledTimes(2);
    expect(vi.mocked(attack).mock.lastCall?.[0]).toEqual(first);
  });

  it('expires a lost cut and cannot resume a stale chord outside the wheel', () => {
    useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: 8 });
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    publish(note);
    publish({ ...note, isKeyDown: false, articulationReason: 'finger-press' });
    publish();
    act(() => useMusicStore.getState().setMusicState({ hoveredRoot: null }));
    act(() => vi.advanceTimersByTime(250));
    expect(useHandRecoveryStore.getState().active).toBe(false);
    publish({ ...note, pressId: 2, articulationReason: 'finger-lift' });
    expect(looperService.triggerChord).toHaveBeenCalledTimes(1);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });

  it('stops a sustained low-FPS dropout at its deadline without extending on unrelated updates', () => {
    useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: 8 });
    renderHook(() => useAudioTrigger(true));
    publish({ ...hand(false, true), isKeyDown: true, pressId: 1 });
    publish();
    act(() => vi.advanceTimersByTime(200));
    act(() => useMusicStore.getState().setMusicState({ activeNote: 'D' }));
    act(() => vi.advanceTimersByTime(49));
    expect(useMusicStore.getState().playingNotes.length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(1));
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    expect(useHandRecoveryStore.getState().active).toBe(false);
    expect(useLiveNoteReleaseStore.getState().lastRelease?.reason).toBe('hand-lost');
  });

  it('clears pending recovery on mode change and unmount', () => {
    const view = renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    publish(note); publish();
    expect(useHandRecoveryStore.getState().active).toBe(true);
    act(() => useMusicStore.getState().setMusicState({ mode: 'Melody' }));
    expect(useHandRecoveryStore.getState().active).toBe(false);
    publish(note); publish();
    expect(useHandRecoveryStore.getState().active).toBe(true);
    view.unmount();
    expect(useHandRecoveryStore.getState().active).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors an open pinch on return immediately and discards the remembered pitch', () => {
    useTrackingSettingsStore.getState().setRuntime({ actualTrackingFps: 8 });
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    publish(note); publish();
    act(() => vi.advanceTimersByTime(100));
    publish({ ...note, isPinching: false, isKeyDown: false });
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    expect(useHandRecoveryStore.getState().active).toBe(false);
    expect(useLiveNoteReleaseStore.getState().lastRelease?.reason).toBe('pinch-open');
    act(() => useMusicStore.getState().setMusicState({ hoveredRoot: null }));
    publish({ ...note, pressId: 2, articulationReason: 'finger-lift' });
    expect(looperService.triggerChord).toHaveBeenCalledTimes(1);
  });

  it('ends cut recovery when the returning hand takes volume control', () => {
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    publish(note);
    publish({ ...note, isKeyDown: false, articulationReason: 'finger-press' });
    publish();
    expect(useHandRecoveryStore.getState().active).toBe(true);
    act(() => useVolumeGestureStore.setState({ owner: 'left' }));
    publish({ ...note, isPinching: false, isKeyDown: false });
    expect(useHandRecoveryStore.getState().active).toBe(false);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['Chord','Song','Melody'] as const)('resumes the latched pitch through a wheel gap on return up in %s', mode => {
    useMusicStore.getState().setMusicState({mode,hoveredRoot:'C#',hoveredQuality:'min',hoveredBass:'G#'});
    renderHook(() => useAudioTrigger(true));
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    const note = {...hand(false,true),isKeyDown:true,pressId:1};
    publish(note);
    const first = vi.mocked(attack).mock.calls[0][0];
    publish({...note,isKeyDown:false,articulationReason:'finger-press'});
    act(() => useMusicStore.getState().setMusicState({hoveredRoot:null,hoveredQuality:null,hoveredBass:null}));
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    const returned = {...note,pressId:2,articulationReason:'finger-lift' as const};
    publish(returned);
    expect(attack).toHaveBeenCalledTimes(2);
    expect(vi.mocked(attack).mock.lastCall?.[0]).toEqual(first);
    publish(returned);
    expect(attack).toHaveBeenCalledTimes(2);
    publish({...returned,isPinching:false,isKeyDown:false});
    publish({...note,pressId:3,articulationReason:'pinch-start'});
    expect(attack).toHaveBeenCalledTimes(2);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });
  it('retains the stop cause after the stopped hand remains visible and distinguishes pinch opening from loss', () => {
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false,true), isKeyDown:true, pressId:1 };
    publish(note);
    publish({ ...note, isKeyDown:false, articulationReason:'finger-press' });
    expect(useLiveNoteReleaseStore.getState().lastRelease).toMatchObject({reason:'finger-press',pinching:true});
    const stopped = useLiveNoteReleaseStore.getState().lastRelease;
    publish({ ...note, isKeyDown:false, articulationReason:'hold' });
    expect(useLiveNoteReleaseStore.getState().lastRelease).toBe(stopped);
    publish({ ...note, pressId:2 });
    publish({ ...note, pressId:2, isKeyDown:false, isPinching:false });
    expect(useLiveNoteReleaseStore.getState().lastRelease).toMatchObject({reason:'pinch-open',pinching:false});
    publish({ ...note, pressId:3 });
    publish();
    act(() => vi.advanceTimersByTime(90));
    expect(useLiveNoteReleaseStore.getState().lastRelease).toMatchObject({reason:'hand-lost',hand:null});
  });
  it('preserves the Song effect selection while the right palm shapes it', () => {
    const track = useLooperStore.getState().tracks.find(t => t.isArmed)!;
    const effects = track.effects;
    useLooperStore.getState().setTrackProperty(track.id, 'effects', {
      reverb: false, delay: false, chorus: false, bitcrusher: false, sustain: false,
    });
    useMusicStore.getState().setMusicState({ mode: 'Song', hoveredEffect: 'delay' });
    renderHook(() => useAudioTrigger(true));
    try {
      publish(hand(false,false), hand(false,true,'right'));
      expect(useLooperStore.getState().tracks.find(t => t.id === track.id)?.effects.delay).toBe(true);
      act(() => useVolumeGestureStore.setState({ effectOwner: 'right' }));
      publish(hand(false,false), hand(false,false,'right'));
      expect(useLooperStore.getState().tracks.find(t => t.id === track.id)?.effects.delay).toBe(true);
      act(() => useVolumeGestureStore.setState({ effectOwner: null }));
      publish(hand(false,false), hand(false,false,'right'));
      expect(useLooperStore.getState().tracks.find(t => t.id === track.id)?.effects.delay).toBe(false);
    } finally { useLooperStore.getState().setTrackProperty(track.id,'effects',effects); }
  });
  it('keeps a left-hand note playing while the right open palm controls FX', () => {
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    publish(note, hand(false,false,'right'));
    act(() => useVolumeGestureStore.setState({ effectOwner: 'right' }));
    publish(note, { ...hand(true,false,'right'), isKeyDown: true, pressId: 1 });
    expect(looperService.triggerChord).toHaveBeenCalledTimes(1);
    expect(useMusicStore.getState().playingNotes).toContain('C4');
    publish({ ...note, isKeyDown: false, isPinching: false }, hand(false,false,'right'));
    expect(useMusicStore.getState().playingNotes).toEqual([]);
  });
  it.each(['Chord', 'Song', 'Melody'] as const)('does not play a volume pinch or promote the quality hand to notes in %s', mode => {
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    act(() => useVolumeGestureStore.setState({ owner: 'left' }));
    publish(hand(false, true), hand(false, true, 'right'));
    expect(looperService.triggerChord).not.toHaveBeenCalled();
    expect(looperService.triggerNote).not.toHaveBeenCalled();
  });
  it('keeps chord articulation on the note hand when the quality hand pinches later', () => {
    renderHook(() => useAudioTrigger(true));
    const note = { ...hand(false, true), isKeyDown: true, pressId: 1 };
    const quality = { ...hand(false, true, 'right'), isKeyDown: true, pressId: 1 };
    publish(note, hand(false, false, 'right'));
    expect(looperService.triggerChord).toHaveBeenCalledTimes(1);
    publish(note, quality);
    expect(looperService.triggerChord).toHaveBeenCalledTimes(1);
    publish({ ...note, isPinching: false, isKeyDown: false }, quality);
    expect(useMusicStore.getState().playingNotes).toEqual([]);
    publish({ ...note, pressId: 2 }, quality);
    expect(looperService.triggerChord).toHaveBeenCalledTimes(2);
  });

  it.each(['Chord', 'Song', 'Melody'] as const)('releases a pinch even if the point detector is still down in %s', mode => {
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    for (let id = 1; id <= 7; id++) {
      if (id === 4) act(() => useMusicStore.getState().setMusicState({ hoveredRoot: 'D' }));
      publish({ ...hand(false, true), isKeyDown: true, pressId: id });
      expect(attack).toHaveBeenCalledTimes(id);
      expect(useMusicStore.getState().playingNotes).toContain(id < 4 ? 'C4' : 'D4');
      publish({ ...hand(true, false), isKeyDown: true, pressId: id });
      expect(useMusicStore.getState().playingNotes).toEqual([]);
      publish({ ...hand(true, false), isKeyDown: true, pressId: id });
      expect(useMusicStore.getState().playingNotes).toEqual([]);
    }
  });
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
  it.each(['Chord', 'Song', 'Melody'] as const)('honors an upward resume after the tracker counter resets in %s', mode => {
    useMusicStore.getState().setMusicState({ mode });
    renderHook(() => useAudioTrigger(true));
    const attack = mode === 'Melody' ? looperService.triggerNote : looperService.triggerChord;
    publish({ ...hand(false,true), isKeyDown:true, pressId:7 });
    // Reacquisition can restart a detector's local counter. An actual finger
    // return up is still a new event even if the preceding cut wasn't observed.
    const strike = { ...hand(false,true), isKeyDown:true, pressId:2, articulationReason:'finger-lift' as const };
    publish(strike);
    expect(attack).toHaveBeenCalledTimes(2);
    publish(strike);
    act(() => useMusicStore.getState().setMusicState({ activeNote:'C' }));
    expect(attack).toHaveBeenCalledTimes(2);
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
