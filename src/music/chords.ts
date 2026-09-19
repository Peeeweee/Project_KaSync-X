import { CHROMATIC_NOTES } from './scales';

export const CHORD_QUALITIES = {
  basic: ['maj', 'min', 'dim', 'aug', '7', 'maj7', 'm7', 'sus4'],
  extended: [
    '9',
    '11',
    '13',
    '6',
    'm6',
    'add9',
    'sus2',
    '7b5',
    '7#5',
    'dim7',
    'mMaj7',
  ],
};

export const CHORD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  sus4: [0, 5, 7],
  '9': [0, 4, 7, 10, 14],
  '11': [0, 4, 7, 10, 14, 17],
  '13': [0, 4, 7, 10, 14, 17, 21],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 14],
  sus2: [0, 2, 7],
  '7b5': [0, 4, 6, 10],
  '7#5': [0, 4, 8, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
};

export function buildChord(
  root: string,
  quality: string,
  bass: string | null = null
): string[] {
  const rootIndex = CHROMATIC_NOTES.indexOf(root);
  if (rootIndex === -1) return [];

  const intervals = CHORD_INTERVALS[quality] || CHORD_INTERVALS['maj'];

  const baseOctave = 4;

  let notes = intervals.map((interval) => {
    const semitones = rootIndex + interval;
    const noteIndex = semitones % 12;
    const octaveOffset = Math.floor(semitones / 12);
    return `${CHROMATIC_NOTES[noteIndex]}${baseOctave + octaveOffset}`;
  });

  if (bass && bass !== root) {
    const bassIndex = CHROMATIC_NOTES.indexOf(bass);
    if (bassIndex !== -1) {
      // Add bass note one octave below root
      let bassOctave = baseOctave - 1;

      // If bass note index is higher than root index, drop it another octave to ensure it's the lowest
      if (bassIndex > rootIndex) {
        bassOctave -= 1;
      }

      const bassNote = `${CHROMATIC_NOTES[bassIndex]}${bassOctave}`;

      notes = [bassNote, ...notes];
    }
  } else {
    // If no slash bass, duplicate root down an octave for fullness
    const rootBassNote = `${CHROMATIC_NOTES[rootIndex]}${baseOctave - 1}`;
    notes = [rootBassNote, ...notes];
  }

  return notes;
}
