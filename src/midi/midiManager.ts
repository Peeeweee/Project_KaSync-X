/**
 * midiManager.ts — Singleton wrapper around the Web MIDI API.
 *
 * Features:
 *  1. MIDI Input  — routes noteOn/noteOff → app callbacks, with polyphonic chord assembly
 *  2. MIDI Output — mirrors played notes to a selected output port
 *  3. MIDI Clock  — derives BPM from 0xF8 timing pulses; syncs Tone.Transport via callback
 *  4. UI State    — Zustand store (`useMidiStore`) so React panels stay reactive
 */
import { create } from 'zustand';

// ── Note Conversion Utilities ──────────────────────────────────────────────────

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** MIDI note number (0–127) → Tone.js-compatible name, e.g. 60 → "C4". */
export function midiNoteToName(midi: number): string {
  return `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Tone.js note name → MIDI number, e.g. "D#3" → 51. Returns -1 on parse failure. */
export function noteNameToMidi(name: string): number {
  const NOTE_MAP: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
    E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
    Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  const m = name.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!m) return -1;
  return (parseInt(m[2]) + 1) * 12 + (NOTE_MAP[m[1]] ?? 0);
}

// ── Callbacks Interface ────────────────────────────────────────────────────────

export interface MidiCallbacks {
  /** Called whenever the set of held notes changes (chord assembled from all held keys). */
  onNoteOn: (notes: string[], velocity: number) => void;
  /** Called when all held notes are released. */
  onNoteOff: (notes: string[]) => void;
  /** Called when the derived BPM changes (clock sync mode). */
  onBpmChange: (bpm: number) => void;
  /** Called on MIDI Start (0xFA) or Continue (0xFB). */
  onTransportStart: () => void;
  /** Called on MIDI Stop (0xFC). */
  onTransportStop: () => void;
  /** Called on every Control Change message. */
  onCC: (cc: number, value: number) => void;
}

// ── Zustand UI State ───────────────────────────────────────────────────────────

export interface MidiUiState {
  isSupported: boolean;
  isConnected: boolean;
  inputPorts: Array<{ id: string; name: string }>;
  outputPorts: Array<{ id: string; name: string }>;
  selectedInputId: string | null;
  selectedOutputId: string | null;
  clockSyncEnabled: boolean;
  detectedBpm: number | null;
  isPanelOpen: boolean;
  // — Actions —
  selectInput: (id: string | null) => void;
  selectOutput: (id: string | null) => void;
  toggleClockSync: () => void;
  togglePanel: () => void;
  /** Internal: used only by MidiManager to push state updates. */
  _patch: (partial: Partial<Pick<MidiUiState,
    'isConnected' | 'inputPorts' | 'outputPorts' | 'detectedBpm'
  >>) => void;
}

export const useMidiStore = create<MidiUiState>((set, get) => ({
  isSupported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
  isConnected: false,
  inputPorts: [],
  outputPorts: [],
  selectedInputId: null,
  selectedOutputId: null,
  clockSyncEnabled: false,
  detectedBpm: null,
  isPanelOpen: false,

  selectInput: (id) => {
    set({ selectedInputId: id });
    midiManager.setInputPort(id);
  },
  selectOutput: (id) => {
    set({ selectedOutputId: id });
    midiManager.setOutputPort(id);
  },
  toggleClockSync: () => {
    const next = !get().clockSyncEnabled;
    set({ clockSyncEnabled: next, detectedBpm: null });
    midiManager.setClockSync(next);
  },
  togglePanel: () => set((s) => ({ isPanelOpen: !s.isPanelOpen })),
  _patch: (partial) => set(partial),
}));

// ── MidiManager Class ──────────────────────────────────────────────────────────

class MidiManager {
  private access: MIDIAccess | null = null;
  private activeInput: MIDIInput | null = null;
  private activeOutput: MIDIOutput | null = null;
  /** Tracks all currently held note numbers → Tone.js name, for chord assembly. */
  private heldNotes = new Map<number, string>();
  private clockTimestamps: number[] = [];
  private clockSyncEnabled = false;
  private cb: Partial<MidiCallbacks> = {};

  /** Set all event callbacks at once. Safe to call before `init()`. */
  public setCallbacks(cb: Partial<MidiCallbacks>) {
    this.cb = cb;
  }

  /** Request MIDI access and begin listening for port changes. */
  public async init(): Promise<void> {
    if (!useMidiStore.getState().isSupported) return;
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.refreshPorts();
      this.access.onstatechange = () => this.refreshPorts();
      useMidiStore.getState()._patch({ isConnected: true });
    } catch (err) {
      console.warn('[MidiManager] Access denied or not available:', err);
    }
  }

  // ── Port Management ────────────────────────────────────────────────────────

  private refreshPorts() {
    if (!this.access) return;
    const inputPorts = [...this.access.inputs.values()].map((p) => ({
      id: p.id, name: p.name ?? `Input ${p.id}`,
    }));
    const outputPorts = [...this.access.outputs.values()].map((p) => ({
      id: p.id, name: p.name ?? `Output ${p.id}`,
    }));
    useMidiStore.getState()._patch({ inputPorts, outputPorts });

    // Re-bind if previously-selected port is still present
    const { selectedInputId, selectedOutputId } = useMidiStore.getState();
    if (selectedInputId) this.setInputPort(selectedInputId);
    if (selectedOutputId) this.setOutputPort(selectedOutputId);
  }

  public setInputPort(id: string | null) {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }
    this.heldNotes.clear();
    if (!id || !this.access) return;
    const port = this.access.inputs.get(id);
    if (!port) return;
    this.activeInput = port;
    port.onmidimessage = (e) => this.handleMessage(e);
  }

  public setOutputPort(id: string | null) {
    this.activeOutput =
      id && this.access ? (this.access.outputs.get(id) ?? null) : null;
  }

  public setClockSync(enabled: boolean) {
    this.clockSyncEnabled = enabled;
    if (!enabled) this.clockTimestamps = [];
  }

  // ── MIDI Output ────────────────────────────────────────────────────────────

  /** Send Note On for a list of Tone.js note names (velocity 0–1). */
  public sendNoteOn(noteNames: string[], velocity: number) {
    if (!this.activeOutput) return;
    const vel = Math.max(1, Math.min(127, Math.round(velocity * 127)));
    for (const name of noteNames) {
      const midi = noteNameToMidi(name);
      if (midi >= 0 && midi <= 127) this.activeOutput.send([0x90, midi, vel]);
    }
  }

  /** Send Note Off for a list of Tone.js note names. */
  public sendNoteOff(noteNames: string[]) {
    if (!this.activeOutput) return;
    for (const name of noteNames) {
      const midi = noteNameToMidi(name);
      if (midi >= 0 && midi <= 127) this.activeOutput.send([0x80, midi, 0]);
    }
  }

  // ── Message Routing ────────────────────────────────────────────────────────

  private handleMessage(e: MIDIMessageEvent) {
    const d = e.data;
    if (!d || d.length === 0) return;

    const status = d[0];
    const msgType = status & 0xf0; // channel voice message type
    const rawByte = status & 0xff; // full byte for system real-time

    // Channel voice messages
    switch (msgType) {
      case 0x90: // Note On
        if (d.length >= 3 && d[2] > 0) this.handleNoteOn(d[1], d[2] / 127);
        else if (d.length >= 2) this.handleNoteOff(d[1]); // velocity-0 = note off
        break;
      case 0x80: // Note Off
        if (d.length >= 2) this.handleNoteOff(d[1]);
        break;
      case 0xb0: // Control Change
        if (d.length >= 3) this.cb.onCC?.(d[1], d[2]);
        break;
    }

    // System real-time messages (no channel nibble)
    switch (rawByte) {
      case 0xf8: this.handleClock(e.timeStamp);   break; // Timing Clock
      case 0xfa: this.cb.onTransportStart?.();    break; // Start
      case 0xfb: this.cb.onTransportStart?.();    break; // Continue
      case 0xfc: this.cb.onTransportStop?.();     break; // Stop
    }
  }

  private handleNoteOn(midiNote: number, velocity: number) {
    this.heldNotes.set(midiNote, midiNoteToName(midiNote));
    this.cb.onNoteOn?.([...this.heldNotes.values()], velocity);
  }

  private handleNoteOff(midiNote: number) {
    const releasedName = this.heldNotes.get(midiNote) ?? midiNoteToName(midiNote);
    this.heldNotes.delete(midiNote);
    const remaining = [...this.heldNotes.values()];
    if (remaining.length > 0) {
      // Still holding other keys → re-trigger with the remaining chord
      this.cb.onNoteOn?.(remaining, 0.75);
    } else {
      this.cb.onNoteOff?.([releasedName]);
    }
  }

  /** Derive BPM from MIDI timing clock pulses (24 per quarter note). */
  private handleClock(timestamp: number) {
    if (!this.clockSyncEnabled) return;
    this.clockTimestamps.push(timestamp);
    // Keep a rolling window of 96 pulses (4 beats) for stability
    if (this.clockTimestamps.length > 96) this.clockTimestamps.shift();

    if (this.clockTimestamps.length >= 8) {
      const first = this.clockTimestamps[0];
      const last  = this.clockTimestamps[this.clockTimestamps.length - 1];
      const msPerPulse = (last - first) / (this.clockTimestamps.length - 1);
      // 24 pulses/beat → bpm = 60000 / (msPerPulse × 24)
      const bpm = Math.round(60000 / (msPerPulse * 24));
      if (bpm >= 20 && bpm <= 300) {
        useMidiStore.getState()._patch({ detectedBpm: bpm });
        this.cb.onBpmChange?.(bpm);
      }
    }
  }
}

export const midiManager = new MidiManager();
