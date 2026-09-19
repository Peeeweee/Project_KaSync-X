import type { InstrumentType, EffectsState } from '../store/musicState';

export interface TrackEvent {
  notes: string[];
  velocity: number;
  time: number;      // Tone.Transport time (e.g. 0.5, or ticks)
  duration: number;  // seconds
}

export interface Track {
  id: number;
  events: TrackEvent[];
  isArmed: boolean;
  isMuted: boolean;
  isSoloed: boolean;
  volume: number; // 0 to 1
  instrument: InstrumentType;
  effects: EffectsState;
}
