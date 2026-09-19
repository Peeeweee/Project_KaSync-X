import { create } from 'zustand';

export type InstrumentMode = 'Melody' | 'Chord';
export type InstrumentType = 'Subtractive' | 'FM' | 'Electric Piano' | 'Pad';

export interface EffectsState {
  reverb: boolean;
  delay: boolean;
  chorus: boolean;
  bitcrusher: boolean;
}

interface MusicState {
  mode: InstrumentMode;
  currentScale: string;
  currentKey: string;
  snapToScale: boolean;
  showExtendedQualities: boolean;
  currentInstrument: InstrumentType;
  effects: EffectsState;
  activeNote: string | null;
  activeQuality: string | null;
  activeBass: string | null;
  hoveredRoot: string | null;
  hoveredQuality: string | null;
  hoveredBass: string | null;
  playingNotes: string[];
  setMusicState: (partial: Partial<MusicState>) => void;
}

export const useMusicStore = create<MusicState>((set) => ({
  mode: 'Melody',
  currentScale: 'Major',
  currentKey: 'C',
  snapToScale: true,
  showExtendedQualities: false,
  currentInstrument: 'Subtractive',
  effects: {
    reverb: true,
    delay: false,
    chorus: false,
    bitcrusher: false
  },
  activeNote: null,
  activeQuality: null,
  activeBass: null,
  hoveredRoot: null,
  hoveredQuality: null,
  hoveredBass: null,
  playingNotes: [],
  setMusicState: (partial) => set((state) => ({ ...state, ...partial })),
}));
