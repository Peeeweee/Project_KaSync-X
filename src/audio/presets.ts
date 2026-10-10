import type { EffectsState, InstrumentType } from '../store/musicState';

export interface SoundPreset {
  id: string;
  name: string;
  description: string;
  instrument: InstrumentType;
  effects: EffectsState;
  volume: number;
}

export const SOUND_PRESETS: SoundPreset[] = [
  {
    id: 'vibranium-pulse',
    name: 'Vibranium Pulse',
    description: 'Focused analog lead with tempo echo.',
    instrument: 'Subtractive',
    effects: { reverb: false, delay: true, chorus: false, bitcrusher: false, sustain: false },
    volume: 0.78,
  },
  {
    id: 'astral-glass',
    name: 'Astral Glass',
    description: 'Wide, sustained FM bell atmosphere.',
    instrument: 'FM',
    effects: { reverb: true, delay: true, chorus: true, bitcrusher: false, sustain: true },
    volume: 0.68,
  },
  {
    id: 'rhodes-drift',
    name: 'Rhodes Drift',
    description: 'Soft electric keys with chorus and room.',
    instrument: 'Electric Piano',
    effects: { reverb: true, delay: false, chorus: true, bitcrusher: false, sustain: true },
    volume: 0.74,
  },
  {
    id: 'midnight-pad',
    name: 'Midnight Pad',
    description: 'Slow cinematic bed for chord layers.',
    instrument: 'Pad',
    effects: { reverb: true, delay: true, chorus: true, bitcrusher: false, sustain: true },
    volume: 0.64,
  },
  {
    id: 'fractured-signal',
    name: 'Fractured Signal',
    description: 'Crushed synthetic texture for accents.',
    instrument: 'Subtractive',
    effects: { reverb: false, delay: true, chorus: false, bitcrusher: true, sustain: false },
    volume: 0.62,
  },
];
