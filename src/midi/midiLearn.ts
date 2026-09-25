/**
 * midiLearn.ts — CC-to-parameter mapping store with localStorage persistence.
 *
 * Flow:
 *  1. User clicks "Learn" next to a parameter → `startLearn(target, label)`
 *  2. User wiggles a MIDI CC knob → `applyCC(cc, value)` captures the CC number
 *     and stores the mapping, then exits learn mode.
 *  3. On subsequent CC messages, `applyCC` looks up the mapping and dispatches
 *     the value to the appropriate Zustand store action.
 */
import { create } from 'zustand';
import { useLooperStore } from '../store/looperState';
import type { EffectsState } from '../store/musicState';

const STORAGE_KEY = 'kasync-midi-learn-v1';

export type LearnTarget =
  | 'bpm'
  | `track-${number}-volume`
  | `track-${number}-mute`
  | `track-${number}-solo`
  | `effect-${'reverb' | 'delay' | 'chorus' | 'bitcrusher'}`;

export interface CcMapping {
  cc: number;
  target: LearnTarget;
  label: string;
}

// ── LocalStorage persistence helpers ──────────────────────────────────────────

function load(): CcMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CcMapping[]) : [];
  } catch {
    return [];
  }
}

function save(mappings: CcMapping[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  } catch { /* quota exceeded or private mode — silently ignore */ }
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface MidiLearnState {
  mappings: CcMapping[];
  isLearning: boolean;
  pendingTarget: LearnTarget | null;
  pendingLabel: string | null;

  startLearn: (target: LearnTarget, label: string) => void;
  cancelLearn: () => void;
  removeMapping: (cc: number) => void;
  clearAll: () => void;
  /**
   * Must be called for every incoming CC message.
   * - While in learn mode: records the mapping for `pendingTarget`.
   * - Otherwise: dispatches the CC value to the mapped app parameter.
   */
  applyCC: (cc: number, value: number) => void;
}

export const useMidiLearnStore = create<MidiLearnState>((set, get) => ({
  mappings: load(),
  isLearning: false,
  pendingTarget: null,
  pendingLabel: null,

  startLearn: (target, label) =>
    set({ isLearning: true, pendingTarget: target, pendingLabel: label }),

  cancelLearn: () =>
    set({ isLearning: false, pendingTarget: null, pendingLabel: null }),

  removeMapping: (cc) =>
    set((s) => {
      const mappings = s.mappings.filter((m) => m.cc !== cc);
      save(mappings);
      return { mappings };
    }),

  clearAll: () => {
    save([]);
    set({ mappings: [] });
  },

  applyCC: (cc, value) => {
    const { isLearning, pendingTarget, pendingLabel, mappings } = get();

    // ── Learn mode: capture the CC number ───────────────────────────────────
    if (isLearning && pendingTarget) {
      const updated: CcMapping[] = [
        // Drop any existing mapping on this CC or for this target (one-to-one)
        ...mappings.filter((m) => m.cc !== cc && m.target !== pendingTarget),
        { cc, target: pendingTarget, label: pendingLabel ?? pendingTarget },
      ];
      save(updated);
      set({ mappings: updated, isLearning: false, pendingTarget: null, pendingLabel: null });
      return;
    }

    // ── Dispatch: find mapping and apply ─────────────────────────────────────
    const mapping = mappings.find((m) => m.cc === cc);
    if (!mapping) return;

    const norm   = value / 127;          // 0–1
    const looper = useLooperStore.getState();

    if (mapping.target === 'bpm') {
      looper.setTransportState({ bpm: Math.round(60 + norm * 140) }); // 60–200 BPM
      return;
    }

    const volMatch = mapping.target.match(/^track-(\d+)-volume$/);
    if (volMatch) {
      looper.setTrackProperty(parseInt(volMatch[1]), 'volume', norm);
      return;
    }

    const muteMatch = mapping.target.match(/^track-(\d+)-mute$/);
    if (muteMatch) {
      looper.setTrackProperty(parseInt(muteMatch[1]), 'isMuted', value >= 64);
      return;
    }

    const soloMatch = mapping.target.match(/^track-(\d+)-solo$/);
    if (soloMatch) {
      looper.setTrackProperty(parseInt(soloMatch[1]), 'isSoloed', value >= 64);
      return;
    }

    const fxMatch = mapping.target.match(/^effect-(\w+)$/);
    if (fxMatch) {
      const key    = fxMatch[1] as keyof EffectsState;
      const armed  = looper.tracks.find((t) => t.isArmed);
      if (armed) {
        looper.setTrackProperty(armed.id, 'effects', {
          ...armed.effects,
          [key]: value >= 64,
        });
      }
    }
  },
}));
