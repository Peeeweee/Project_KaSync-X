import { describe, it, expect } from 'vitest';
import { buildChord } from './chords';

describe('buildChord', () => {
  it('builds a major chord correctly', () => {
    // C maj
    expect(buildChord('C', 'maj')).toEqual(['C3', 'C4', 'E4', 'G4']);
    // F# maj
    expect(buildChord('F#', 'maj')).toEqual(['F#3', 'F#4', 'A#4', 'C#5']);
    // Bb maj (Using A# since CHROMATIC_NOTES is A#)
    expect(buildChord('A#', 'maj')).toEqual(['A#3', 'A#4', 'D5', 'F5']);
  });

  it('builds a minor chord correctly', () => {
    // C min
    expect(buildChord('C', 'min')).toEqual(['C3', 'C4', 'D#4', 'G4']);
    // E min
    expect(buildChord('E', 'min')).toEqual(['E3', 'E4', 'G4', 'B4']);
    // G# min
    expect(buildChord('G#', 'min')).toEqual(['G#3', 'G#4', 'B4', 'D#5']);
  });

  it('builds a diminished chord correctly', () => {
    // C dim
    expect(buildChord('C', 'dim')).toEqual(['C3', 'C4', 'D#4', 'F#4']);
    // B dim
    expect(buildChord('B', 'dim')).toEqual(['B3', 'B4', 'D5', 'F5']);
  });

  it('builds an augmented chord correctly', () => {
    // C aug
    expect(buildChord('C', 'aug')).toEqual(['C3', 'C4', 'E4', 'G#4']);
    // G aug
    expect(buildChord('G', 'aug')).toEqual(['G3', 'G4', 'B4', 'D#5']);
  });

  it('builds a dominant 7th chord correctly', () => {
    // C 7
    expect(buildChord('C', '7')).toEqual(['C3', 'C4', 'E4', 'G4', 'A#4']);
    // F 7
    expect(buildChord('F', '7')).toEqual(['F3', 'F4', 'A4', 'C5', 'D#5']);
  });

  it('builds a major 7th chord correctly', () => {
    // C maj7
    expect(buildChord('C', 'maj7')).toEqual(['C3', 'C4', 'E4', 'G4', 'B4']);
  });

  it('builds a minor 7th chord correctly', () => {
    // C m7
    expect(buildChord('C', 'm7')).toEqual(['C3', 'C4', 'D#4', 'G4', 'A#4']);
  });

  it('builds a sus4 chord correctly', () => {
    // C sus4
    expect(buildChord('C', 'sus4')).toEqual(['C3', 'C4', 'F4', 'G4']);
  });

  it('builds extended qualities correctly', () => {
    // 9
    expect(buildChord('C', '9')).toEqual(['C3', 'C4', 'E4', 'G4', 'A#4', 'D5']);
    // 11
    expect(buildChord('C', '11')).toEqual(['C3', 'C4', 'E4', 'G4', 'A#4', 'D5', 'F5']);
    // 13
    expect(buildChord('C', '13')).toEqual(['C3', 'C4', 'E4', 'G4', 'A#4', 'D5', 'F5', 'A5']);
    // 6
    expect(buildChord('C', '6')).toEqual(['C3', 'C4', 'E4', 'G4', 'A4']);
    // m6
    expect(buildChord('C', 'm6')).toEqual(['C3', 'C4', 'D#4', 'G4', 'A4']);
    // add9
    expect(buildChord('C', 'add9')).toEqual(['C3', 'C4', 'E4', 'G4', 'D5']);
    // sus2
    expect(buildChord('C', 'sus2')).toEqual(['C3', 'C4', 'D4', 'G4']);
    // 7b5
    expect(buildChord('C', '7b5')).toEqual(['C3', 'C4', 'E4', 'F#4', 'A#4']);
    // 7#5
    expect(buildChord('C', '7#5')).toEqual(['C3', 'C4', 'E4', 'G#4', 'A#4']);
    // dim7
    expect(buildChord('C', 'dim7')).toEqual(['C3', 'C4', 'D#4', 'F#4', 'A4']);
    // mMaj7
    expect(buildChord('C', 'mMaj7')).toEqual(['C3', 'C4', 'D#4', 'G4', 'B4']);
  });

  it('handles slash chords correctly', () => {
    // C/E -> Bass note should be E2 since E (4) > C (0), so baseOctave(4) - 1 - 1 = 2
    expect(buildChord('C', 'maj', 'E')).toEqual(['E2', 'C4', 'E4', 'G4']);
    
    // G/D -> Bass note should be D3 since D (2) < G (7), so baseOctave(4) - 1 = 3
    expect(buildChord('G', 'maj', 'D')).toEqual(['D3', 'G4', 'B4', 'D5']);
    
    // F/C -> C (0) < F (5), Bass is C3
    expect(buildChord('F', 'min', 'C')).toEqual(['C3', 'F4', 'G#4', 'C5']);
    
    // A/G -> G (7) < A (9), Bass is G3
    expect(buildChord('A', '7', 'G')).toEqual(['G3', 'A4', 'C#5', 'E5', 'G5']);
  });
});
