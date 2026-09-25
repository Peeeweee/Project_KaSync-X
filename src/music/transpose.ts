import { CHROMATIC_NOTES, SCALE_PATTERNS } from './scales';

// Helper to wrap chromatic note indices
const normalizeIndex = (idx: number) => (idx % 12 + 12) % 12;

/**
 * Shifts a single note string (e.g. "C#") by a given number of semitones
 */
export function transposeNote(note: string, semitones: number): string {
  const index = CHROMATIC_NOTES.indexOf(note);
  if (index === -1) return note; // fallback if invalid
  
  const shiftedIndex = normalizeIndex(index + semitones);
  return CHROMATIC_NOTES[shiftedIndex];
}

/**
 * Normalizes chord quality to a standard format if needed
 */
export function normalizeQuality(quality: string): string {
  // Can add edge cases here if text parser allows variations like "major", "M", etc.
  return quality;
}

/**
 * Shifts a full chord object by a given number of semitones
 */
export function transposeChord(
  chord: { root: string; quality: string; bass?: string },
  semitones: number
) {
  return {
    root: transposeNote(chord.root, semitones),
    quality: normalizeQuality(chord.quality),
    bass: chord.bass ? transposeNote(chord.bass, semitones) : undefined,
  };
}

/**
 * Given two keys (e.g. 'G', 'A'), calculates the shortest semitone distance between them
 * Returns a number between -6 and +5
 */
export function getTransposeAmount(fromKey: string, toKey: string): number {
  const fromIdx = CHROMATIC_NOTES.indexOf(fromKey);
  const toIdx = CHROMATIC_NOTES.indexOf(toKey);
  if (fromIdx === -1 || toIdx === -1) return 0;

  let diff = toIdx - fromIdx;
  if (diff > 6) diff -= 12;
  if (diff < -5) diff += 12;
  
  return diff;
}
