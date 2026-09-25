import { CHROMATIC_NOTES, SCALE_PATTERNS } from './scales';
import { SongChord } from '../store/songStore';
import { buildChord } from './chords';

export interface KeySuggestion {
  root: string;
  scale: string; // 'Major' or 'Minor'
  score: number;
  confidence: number; // 0 to 1
}

/**
 * Given a list of chords, returns the top likely keys (Major/Minor)
 */
export function suggestKeysForChords(chords: SongChord[]): KeySuggestion[] {
  if (chords.length === 0) return [];

  // 1. Gather all unique notes played in the chords
  const playedNotesCount: Record<string, number> = {};
  let totalNotes = 0;

  chords.forEach(chord => {
    const notes = buildChord(chord.root, chord.quality, chord.bass);
    notes.forEach(noteStr => {
      // Remove octave (e.g. C4 -> C) to get pitch class
      const pitchClass = noteStr.replace(/\d/g, '');
      playedNotesCount[pitchClass] = (playedNotesCount[pitchClass] || 0) + 1;
      totalNotes++;
    });
  });

  if (totalNotes === 0) return [];

  // 2. Score each key
  const results: KeySuggestion[] = [];

  const scalesToTest = ['Major', 'Natural Minor'];

  scalesToTest.forEach(scaleName => {
    const pattern = SCALE_PATTERNS[scaleName];
    if (!pattern) return;

    CHROMATIC_NOTES.forEach((root, rootIndex) => {
      // Build the scale
      const scaleNotes = new Set<string>();
      let currIndex = rootIndex;
      pattern.forEach(interval => {
        scaleNotes.add(CHROMATIC_NOTES[currIndex]);
        currIndex = (currIndex + interval) % 12;
      });

      // Score this scale against played notes
      let score = 0;
      Object.entries(playedNotesCount).forEach(([note, count]) => {
        if (scaleNotes.has(note)) {
          score += count;
          // Bonus for matching the tonic of the scale
          if (note === root) score += count * 0.5; 
        } else {
          // Penalty for out-of-scale notes
          score -= count * 0.5;
        }
      });

      results.push({
        root,
        scale: scaleName === 'Natural Minor' ? 'Minor' : scaleName,
        score,
        confidence: 0
      });
    });
  });

  // 3. Sort and calculate confidence
  results.sort((a, b) => b.score - a.score);
  
  // Normalize confidence (highest score = 1.0, but cap if score is low)
  const maxScore = results[0]?.score || 1;
  results.forEach(res => {
    res.confidence = Math.max(0, res.score / maxScore);
  });

  // Return top 3 suggestions
  return results.slice(0, 3);
}
