import { beforeEach, describe, expect, it } from 'vitest';
import { useLooperStore } from './looperState';
import type { TrackEvent } from '../looper/trackModel';

const originalEvent: TrackEvent = {
  notes: ['C4'], velocity: 0.8, tick: 0, durationTicks: 96,
};
const newEvent: TrackEvent = {
  notes: ['E4'], velocity: 0.7, tick: 192, durationTicks: 48,
};

describe('looper take history', () => {
  beforeEach(() => {
    useLooperStore.setState(state => ({
      tracks: state.tracks.map(track => ({ ...track, events: track.id === 0 ? [originalEvent] : [] })),
      undoHistory: {},
      redoHistory: {},
      pendingTake: null,
      isGlobalRecording: false,
      isPlaying: false,
      isCountingIn: false,
    }));
  });

  it('restores a replaced track when a take records nothing', () => {
    const store = useLooperStore.getState();
    store.beginRecordingTake(0, true);
    expect(useLooperStore.getState().tracks[0].events).toEqual([]);

    useLooperStore.getState().finishRecordingTake();
    expect(useLooperStore.getState().tracks[0].events).toEqual([originalEvent]);
  });

  it('undoes and redoes a completed replacement take atomically', () => {
    useLooperStore.getState().beginRecordingTake(0, true);
    useLooperStore.getState().addTrackEvent(0, newEvent);
    useLooperStore.getState().finishRecordingTake();
    expect(useLooperStore.getState().tracks[0].events).toEqual([newEvent]);

    useLooperStore.getState().undoTrack(0);
    expect(useLooperStore.getState().tracks[0].events).toEqual([originalEvent]);

    useLooperStore.getState().redoTrack(0);
    expect(useLooperStore.getState().tracks[0].events).toEqual([newEvent]);
  });

  it('keeps existing events during an overdub take', () => {
    useLooperStore.getState().beginRecordingTake(0, false);
    useLooperStore.getState().addTrackEvent(0, newEvent);
    useLooperStore.getState().finishRecordingTake();

    expect(useLooperStore.getState().tracks[0].events).toEqual([originalEvent, newEvent]);
  });
});
