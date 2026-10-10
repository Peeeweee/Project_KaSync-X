import type { InstrumentType, EffectsState } from '../store/musicState';

export interface TrackEvent {
  notes: string[];
  velocity: number;
  tick: number;          // Position inside the loop, independent of BPM.
  durationTicks: number; // Musical duration, independent of BPM.
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
