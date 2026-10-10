import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySession,
  captureSession,
  parseSessionText,
  SESSION_VERSION,
} from './sessionManager';
import { useLooperStore } from '../store/looperState';
import { useMusicStore } from '../store/musicState';
import { useSessionStore } from '../store/sessionState';
import { useTrackingSettingsStore } from '../store/trackingSettings';

describe('Kasync session documents', () => {
  beforeEach(() => {
    localStorage.clear();
    useSessionStore.setState({ projectName: 'Test Project' });
    useLooperStore.setState({
      isPlaying: false,
      isGlobalRecording: false,
      isCountingIn: false,
      bpm: 120,
      undoHistory: {},
      redoHistory: {},
      pendingTake: null,
    });
    useMusicStore.getState().setMusicState({ mode: 'Melody', currentKey: 'C' });
  });

  it('round-trips a complete project document', () => {
    useLooperStore.setState(state => ({
      bpm: 96,
      tracks: state.tracks.map(track => track.id === 0
        ? { ...track, events: [{ notes: ['C4'], velocity: 0.75, tick: 192, durationTicks: 96 }] }
        : track),
    }));
    useMusicStore.getState().setMusicState({ mode: 'Chord', currentKey: 'G' });

    const parsed = parseSessionText(JSON.stringify(captureSession('Round Trip')));
    expect(parsed.version).toBe(SESSION_VERSION);
    expect(parsed.meta.name).toBe('Round Trip');
    expect(parsed.music.mode).toBe('Chord');
    expect(parsed.looper.bpm).toBe(96);
    expect(parsed.looper.tracks[0].events[0]).toEqual({
      notes: ['C4'], velocity: 0.75, tick: 192, durationTicks: 96,
    });
  });

  it('rejects unrelated, unsupported, and incomplete documents before applying them', () => {
    expect(() => parseSessionText('{}')).toThrow(/not a Kasync/i);
    expect(() => parseSessionText(JSON.stringify({ kind: 'kasync-session', version: 99 }))).toThrow(/unsupported/i);
    expect(() => parseSessionText(JSON.stringify({ kind: 'kasync-session', version: 1 }))).toThrow(/incomplete/i);
  });

  it('clamps imported values to safe musical and tracking ranges', () => {
    const unsafe = captureSession('Unsafe');
    unsafe.looper.bpm = 999;
    unsafe.looper.tracks[0].volume = -5;
    unsafe.looper.tracks[0].events = [{ notes: ['C4'], velocity: 4, tick: 999_999, durationTicks: -2 }];
    unsafe.tracking.pinchThreshold = 0.7;
    unsafe.tracking.pinchReleaseThreshold = 0.2;

    const parsed = parseSessionText(JSON.stringify(unsafe));
    expect(parsed.looper.bpm).toBe(300);
    expect(parsed.looper.tracks[0].volume).toBe(0);
    expect(parsed.looper.tracks[0].events[0].velocity).toBe(1);
    expect(parsed.looper.tracks[0].events[0].durationTicks).toBe(1);
    expect(parsed.tracking.pinchReleaseThreshold).toBeGreaterThan(parsed.tracking.pinchThreshold);
  });

  it('restores durable state while forcing transport runtime state to stopped', () => {
    const session = captureSession('Restored');
    session.music.currentKey = 'A';
    session.looper.bpm = 88;
    session.tracking.mirrorCamera = false;
    useLooperStore.setState({ isPlaying: true, isGlobalRecording: true });

    applySession(session);

    expect(useLooperStore.getState().isPlaying).toBe(false);
    expect(useLooperStore.getState().isGlobalRecording).toBe(false);
    expect(useLooperStore.getState().bpm).toBe(88);
    expect(useMusicStore.getState().currentKey).toBe('A');
    expect(useTrackingSettingsStore.getState().mirrorCamera).toBe(false);
    expect(useSessionStore.getState().projectName).toBe('Restored');
  });
});
