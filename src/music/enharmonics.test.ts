import { describe, it, expect } from 'vitest';
import { resolveEnharmonic, formatChordName } from './enharmonics';

describe('enharmonics', () => {
  describe('resolveEnharmonic', () => {
    it('handles sharp keys (C, G, D, A, E, B, F#)', () => {
      // These keys should prefer sharps
      const sharpKeys = ['C', 'G', 'D', 'A', 'E', 'B'];
      
      sharpKeys.forEach(key => {
        expect(resolveEnharmonic('F#', key)).toBe('F#');
        expect(resolveEnharmonic('C#', key)).toBe('C#');
        expect(resolveEnharmonic('G#', key)).toBe('G#');
        expect(resolveEnharmonic('D#', key)).toBe('D#');
        expect(resolveEnharmonic('A#', key)).toBe('A#');
      });
    });

    it('handles flat keys (F, Bb, Eb, Ab, Db, Gb)', () => {
      // Internal representation of flat keys: F, A#, D#, G#, C#, F#
      const flatKeys = ['F', 'A#', 'D#', 'G#', 'C#', 'F#'];
      
      flatKeys.forEach(key => {
        expect(resolveEnharmonic('A#', key)).toBe('B♭');
        expect(resolveEnharmonic('D#', key)).toBe('E♭');
        expect(resolveEnharmonic('G#', key)).toBe('A♭');
        expect(resolveEnharmonic('C#', key)).toBe('D♭');
        expect(resolveEnharmonic('F#', key)).toBe('G♭');
      });
    });

    it('handles octaves', () => {
      expect(resolveEnharmonic('A#4', 'C')).toBe('A#4');
      expect(resolveEnharmonic('A#4', 'F')).toBe('B♭4');
      expect(resolveEnharmonic('C#5', 'A#')).toBe('D♭5');
    });
  });

  describe('formatChordName', () => {
    it('formats basic chords in sharp keys', () => {
      expect(formatChordName('F#', 'min', null, 'D')).toBe('F#min');
      expect(formatChordName('C#', 'maj7', null, 'A')).toBe('C#maj7');
    });

    it('formats basic chords in flat keys', () => {
      expect(formatChordName('A#', 'maj', null, 'F')).toBe('B♭maj');
      expect(formatChordName('D#', 'min', null, 'G#')).toBe('E♭min');
    });

    it('formats slash chords in sharp keys', () => {
      expect(formatChordName('D', 'maj', 'F#', 'G')).toBe('Dmaj/F#');
      expect(formatChordName('E', '7', 'G#', 'A')).toBe('E7/G#');
    });

    it('formats slash chords in flat keys', () => {
      expect(formatChordName('A#', 'maj', 'D', 'F')).toBe('B♭maj/D');
      expect(formatChordName('F', '7', 'D#', 'A#')).toBe('F7/E♭');
    });
  });
});
