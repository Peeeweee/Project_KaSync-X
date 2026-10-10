import { create } from 'zustand';
import type { Track, TrackEvent } from '../looper/trackModel';
import type { EffectsState } from './musicState';
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_LOOP_BARS,
  DEFAULT_PPQ,
  loopTicks,
  type BeatsPerBar,
  type LoopBars,
} from '../looper/timing';

interface LooperState {
  tracks: Track[];
  isPlaying: boolean;
  isGlobalRecording: boolean;
  quantize: boolean;
  bpm: number;
  loopBars: LoopBars;
  beatsPerBar: BeatsPerBar;
  metronomeEnabled: boolean;
  countInBars: 0 | 1 | 2;
  isCountingIn: boolean;
  overdubEnabled: boolean;
  isPerformanceRecording: boolean;
  masterVolume: number;
  undoHistory: Record<number, TrackEvent[][]>;
  redoHistory: Record<number, TrackEvent[][]>;
  pendingTake: { trackId: number; snapshot: TrackEvent[]; eventCount: number } | null;
  
  // Actions
  setTrackProperty: <K extends keyof Track>(trackId: number, prop: K, value: Track[K]) => void;
  armTrack: (trackId: number) => void;
  addTrackEvent: (trackId: number, event: TrackEvent) => void;
  clearTrackEvents: (trackId: number) => void;
  updateTrackEvent: (trackId: number, eventIndex: number, patch: Partial<TrackEvent>) => void;
  deleteTrackEvent: (trackId: number, eventIndex: number) => void;
  duplicateTrackEvent: (trackId: number, eventIndex: number) => void;
  duplicateTrack: (sourceTrackId: number, targetTrackId: number) => void;
  consolidateAudibleTracks: (targetTrackId: number) => void;
  setLoopStructure: (bars: LoopBars, beatsPerBar: BeatsPerBar) => void;
  beginRecordingTake: (trackId: number, replace: boolean) => void;
  finishRecordingTake: () => void;
  undoTrack: (trackId: number) => void;
  redoTrack: (trackId: number) => void;
  setTransportState: (partial: Partial<Pick<LooperState, 'isPlaying' | 'isGlobalRecording' | 'quantize' | 'bpm' | 'metronomeEnabled' | 'countInBars' | 'isCountingIn' | 'overdubEnabled' | 'isPerformanceRecording'>>) => void;
  setMasterVolume: (volume: number) => void;
}

const HISTORY_LIMIT = 20;

function cloneEvents(events: TrackEvent[]): TrackEvent[] {
  return events.map(event => ({ ...event, notes: [...event.notes] }));
}

function withTrackHistory(state: LooperState, trackId: number, events: TrackEvent[]) {
  const track = state.tracks.find(candidate => candidate.id === trackId);
  if (!track) return state;
  return {
    tracks: state.tracks.map(candidate => candidate.id === trackId
      ? { ...candidate, events: cloneEvents(events).sort((a, b) => a.tick - b.tick) }
      : candidate),
    undoHistory: {
      ...state.undoHistory,
      [trackId]: [...(state.undoHistory[trackId] ?? []), cloneEvents(track.events)].slice(-HISTORY_LIMIT),
    },
    redoHistory: { ...state.redoHistory, [trackId]: [] },
  };
}

const DEFAULT_EFFECTS: EffectsState = {
  reverb: false,
  delay: false,
  chorus: false,
  bitcrusher: false,
  sustain: false,
};

const INITIAL_TRACKS: Track[] = Array.from({ length: 6 }).map((_, i) => ({
  id: i,
  events: [],
  isArmed: i === 0, // Track 0 armed by default
  isMuted: false,
  isSoloed: false,
  volume: 0.8,
  instrument: i === 0 ? 'Subtractive' : 'Pad', // Just some defaults
  effects: { ...DEFAULT_EFFECTS },
}));

export const useLooperStore = create<LooperState>((set) => ({
  tracks: INITIAL_TRACKS,
  isPlaying: false,
  isGlobalRecording: false,
  quantize: true,
  bpm: 120,
  loopBars: DEFAULT_LOOP_BARS,
  beatsPerBar: DEFAULT_BEATS_PER_BAR,
  metronomeEnabled: false,
  countInBars: 1,
  isCountingIn: false,
  overdubEnabled: true,
  isPerformanceRecording: false,
  masterVolume: 0.8,
  undoHistory: {},
  redoHistory: {},
  pendingTake: null,

  setTrackProperty: (trackId, prop, value) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, [prop]: value } : t)),
  })),

  armTrack: (trackId) => set((state) => ({
    tracks: state.tracks.map((t) => ({ ...t, isArmed: t.id === trackId })),
  })),

  addTrackEvent: (trackId, event) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, events: [...t.events, event] } : t)),
    pendingTake: state.pendingTake?.trackId === trackId
      ? { ...state.pendingTake, eventCount: state.pendingTake.eventCount + 1 }
      : state.pendingTake,
  })),

  clearTrackEvents: (trackId) => set((state) => {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track || track.events.length === 0) return state;
    return {
      tracks: state.tracks.map(t => t.id === trackId ? { ...t, events: [] } : t),
      undoHistory: {
        ...state.undoHistory,
        [trackId]: [...(state.undoHistory[trackId] ?? []), track.events].slice(-HISTORY_LIMIT),
      },
      redoHistory: { ...state.redoHistory, [trackId]: [] },
    };
  }),

  updateTrackEvent: (trackId, eventIndex, patch) => set((state) => {
    if (state.pendingTake) return state;
    const track = state.tracks.find(candidate => candidate.id === trackId);
    const current = track?.events[eventIndex];
    if (!track || !current) return state;
    const length = loopTicks(DEFAULT_PPQ, state.loopBars, state.beatsPerBar);
    const next: TrackEvent = {
      ...current,
      ...patch,
      notes: patch.notes ? [...patch.notes] : [...current.notes],
      tick: Math.min(length - 1, Math.max(0, Math.round(patch.tick ?? current.tick))),
      durationTicks: Math.min(length, Math.max(1, Math.round(patch.durationTicks ?? current.durationTicks))),
      velocity: Math.min(1, Math.max(0, patch.velocity ?? current.velocity)),
    };
    const events = track.events.map((event, index) => index === eventIndex ? next : event);
    return withTrackHistory(state, trackId, events);
  }),

  deleteTrackEvent: (trackId, eventIndex) => set((state) => {
    if (state.pendingTake) return state;
    const track = state.tracks.find(candidate => candidate.id === trackId);
    if (!track?.events[eventIndex]) return state;
    return withTrackHistory(state, trackId, track.events.filter((_, index) => index !== eventIndex));
  }),

  duplicateTrackEvent: (trackId, eventIndex) => set((state) => {
    if (state.pendingTake) return state;
    const track = state.tracks.find(candidate => candidate.id === trackId);
    const event = track?.events[eventIndex];
    if (!track || !event) return state;
    const length = loopTicks(DEFAULT_PPQ, state.loopBars, state.beatsPerBar);
    const duplicate = {
      ...event,
      notes: [...event.notes],
      tick: (event.tick + DEFAULT_PPQ) % length,
    };
    return withTrackHistory(state, trackId, [...track.events, duplicate]);
  }),

  duplicateTrack: (sourceTrackId, targetTrackId) => set((state) => {
    if (state.pendingTake || sourceTrackId === targetTrackId) return state;
    const source = state.tracks.find(track => track.id === sourceTrackId);
    const target = state.tracks.find(track => track.id === targetTrackId);
    if (!source || !target) return state;
    const history = withTrackHistory(state, targetTrackId, source.events);
    return {
      ...history,
      tracks: history.tracks.map(track => track.id === targetTrackId
        ? { ...track, instrument: source.instrument, effects: { ...source.effects }, volume: source.volume }
        : track),
    };
  }),

  consolidateAudibleTracks: (targetTrackId) => set((state) => {
    if (state.pendingTake) return state;
    const anySolo = state.tracks.some(track => track.isSoloed);
    const events = state.tracks
      .filter(track => !track.isMuted && (!anySolo || track.isSoloed))
      .flatMap(track => cloneEvents(track.events))
      .slice(0, 10_000);
    return withTrackHistory(state, targetTrackId, events);
  }),

  setLoopStructure: (bars, beatsPerBar) => set((state) => {
    if (state.pendingTake || (state.loopBars === bars && state.beatsPerBar === beatsPerBar)) return state;
    const length = loopTicks(DEFAULT_PPQ, bars, beatsPerBar);
    let undoHistory = { ...state.undoHistory };
    let redoHistory = { ...state.redoHistory };
    const tracks = state.tracks.map(track => {
      const normalized = track.events.map(event => ({
        ...event,
        notes: [...event.notes],
        tick: ((event.tick % length) + length) % length,
        durationTicks: Math.min(length, Math.max(1, event.durationTicks)),
      })).sort((a, b) => a.tick - b.tick);
      if (track.events.length > 0) {
        undoHistory = {
          ...undoHistory,
          [track.id]: [...(undoHistory[track.id] ?? []), cloneEvents(track.events)].slice(-HISTORY_LIMIT),
        };
        redoHistory = { ...redoHistory, [track.id]: [] };
      }
      return { ...track, events: normalized };
    });
    return { loopBars: bars, beatsPerBar, tracks, undoHistory, redoHistory };
  }),

  beginRecordingTake: (trackId, replace) => set((state) => {
    const track = state.tracks.find(t => t.id === trackId);
    if (!track) return state;
    const snapshot = [...track.events];
    return {
      tracks: replace
        ? state.tracks.map(t => t.id === trackId ? { ...t, events: [] } : t)
        : state.tracks,
      pendingTake: { trackId, snapshot, eventCount: 0 },
    };
  }),

  finishRecordingTake: () => set((state) => {
    const take = state.pendingTake;
    if (!take) return state;
    if (take.eventCount === 0) {
      return {
        tracks: state.tracks.map(t => t.id === take.trackId ? { ...t, events: take.snapshot } : t),
        pendingTake: null,
      };
    }
    return {
      undoHistory: {
        ...state.undoHistory,
        [take.trackId]: [...(state.undoHistory[take.trackId] ?? []), take.snapshot].slice(-HISTORY_LIMIT),
      },
      redoHistory: { ...state.redoHistory, [take.trackId]: [] },
      pendingTake: null,
    };
  }),

  undoTrack: (trackId) => set((state) => {
    if (state.pendingTake) return state;
    const history = state.undoHistory[trackId] ?? [];
    const previous = history.at(-1);
    const track = state.tracks.find(t => t.id === trackId);
    if (!previous || !track) return state;
    return {
      tracks: state.tracks.map(t => t.id === trackId ? { ...t, events: previous } : t),
      undoHistory: { ...state.undoHistory, [trackId]: history.slice(0, -1) },
      redoHistory: {
        ...state.redoHistory,
        [trackId]: [...(state.redoHistory[trackId] ?? []), track.events].slice(-HISTORY_LIMIT),
      },
    };
  }),

  redoTrack: (trackId) => set((state) => {
    if (state.pendingTake) return state;
    const future = state.redoHistory[trackId] ?? [];
    const next = future.at(-1);
    const track = state.tracks.find(t => t.id === trackId);
    if (!next || !track) return state;
    return {
      tracks: state.tracks.map(t => t.id === trackId ? { ...t, events: next } : t),
      undoHistory: {
        ...state.undoHistory,
        [trackId]: [...(state.undoHistory[trackId] ?? []), track.events].slice(-HISTORY_LIMIT),
      },
      redoHistory: { ...state.redoHistory, [trackId]: future.slice(0, -1) },
    };
  }),

  setTransportState: (partial) => set((state) => ({ ...state, ...partial })),

  setMasterVolume: (volume) => set({ masterVolume: volume }),
}));
