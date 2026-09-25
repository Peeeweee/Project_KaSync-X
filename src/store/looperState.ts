import { create } from 'zustand';
import type { Track, TrackEvent } from '../looper/trackModel';
import type { EffectsState } from './musicState';

interface LooperState {
  tracks: Track[];
  isPlaying: boolean;
  isGlobalRecording: boolean;
  quantize: boolean;
  bpm: number;
  
  // Actions
  setTrackProperty: <K extends keyof Track>(trackId: number, prop: K, value: Track[K]) => void;
  armTrack: (trackId: number) => void;
  addTrackEvent: (trackId: number, event: TrackEvent) => void;
  clearTrackEvents: (trackId: number) => void;
  setTransportState: (partial: Partial<{ isPlaying: boolean; isGlobalRecording: boolean; quantize: boolean; bpm: number }>) => void;
}

const DEFAULT_EFFECTS: EffectsState = {
  reverb: true,
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

  setTrackProperty: (trackId, prop, value) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, [prop]: value } : t)),
  })),

  armTrack: (trackId) => set((state) => ({
    tracks: state.tracks.map((t) => ({ ...t, isArmed: t.id === trackId })),
  })),

  addTrackEvent: (trackId, event) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, events: [...t.events, event] } : t)),
  })),

  clearTrackEvents: (trackId) => set((state) => ({
    tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, events: [] } : t)),
  })),

  setTransportState: (partial) => set((state) => ({ ...state, ...partial })),
}));
