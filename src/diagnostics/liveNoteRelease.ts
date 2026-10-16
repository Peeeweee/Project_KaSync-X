import { create } from 'zustand';
import type { HandData } from '../store/handState';

export type NoteReleaseReason = 'finger-press' | 'finger-lift' | 'pinch-open' | 'point-lift' | 'key-up'
  | 'hand-lost' | 'control-hand' | 'mode-change' | 'cleanup';

interface NoteRelease {
  atMs: number;
  reason: NoteReleaseReason;
  heldMs: number;
  hand: string | null;
  pinching: boolean | null;
  fingerCurls: HandData['fingerCurls'] | null;
}

// One bounded snapshot per actual stop; no per-frame store notifications.
export const useLiveNoteReleaseStore = create<{ lastRelease: NoteRelease | null }>(() => ({ lastRelease:null }));

export function recordNoteRelease(reason: NoteReleaseReason, heldMs: number, hand?: HandData) {
  useLiveNoteReleaseStore.setState({ lastRelease: {
    atMs: performance.now(), reason, heldMs, hand: hand?.handedness ?? null,
    pinching: hand?.isPinching ?? null, fingerCurls: hand?.fingerCurls ? [...hand.fingerCurls] : null,
  } });
}
