import { describe, it, expect } from 'vitest';
import { getActiveNoteIndex } from './scales';

describe('scales', () => {
  describe('getActiveNoteIndex', () => {
    it('returns exact index when snapToScale is false', () => {
      // 0 radians (East) = index 0
      expect(getActiveNoteIndex(0, false)).toBe(0);
      
      // PI/2 radians (North in math, though our wheel might be drawn differently, but purely math-wise)
      // PI/2 / (PI/6) = 3
      expect(getActiveNoteIndex(Math.PI / 2, false)).toBe(3);
      
      // PI radians (West) = index 6
      expect(getActiveNoteIndex(Math.PI, false)).toBe(6);
      
      // 3*PI/2 (South) = index 9
      expect(getActiveNoteIndex(3 * Math.PI / 2, false)).toBe(9);
    });

    it('snaps to scale correctly (C Major)', () => {
      // C Major: 0, 2, 4, 5, 7, 9, 11
      // Angle for index 1 (C#) should snap to 0 (C) or 2 (D). Since both are dist 1, tie break usually goes to first in array which is 0.
      expect(getActiveNoteIndex((Math.PI / 6) * 1, true, 'Major', 0)).toBe(0); // or 2, based on array order
      
      // Angle for index 3 (D#) should snap to 2 (D) or 4 (E)
      expect([2, 4]).toContain(getActiveNoteIndex((Math.PI / 6) * 3, true, 'Major', 0));
      
      // Angle for index 8 (G#) should snap to 7 (G) or 9 (A)
      expect([7, 9]).toContain(getActiveNoteIndex((Math.PI / 6) * 8, true, 'Major', 0));
    });

    it('snaps to scale correctly (A Minor)', () => {
      // A Minor: rootIndex 9
      // Minor pattern: 0, 2, 3, 5, 7, 8, 10
      // A Minor notes: A(9), B(11), C(0), D(2), E(4), F(5), G(7)
      
      // Angle for index 1 (C#) should snap to C(0) or D(2).
      expect([0, 2]).toContain(getActiveNoteIndex((Math.PI / 6) * 1, true, 'Minor', 9));

      // Index 6 (F#) should snap to 5 (F) or 7 (G)
      expect([5, 7]).toContain(getActiveNoteIndex((Math.PI / 6) * 6, true, 'Minor', 9));
      
      // Index 9 (A) is in scale, should stay 9
      expect(getActiveNoteIndex((Math.PI / 6) * 9, true, 'Minor', 9)).toBe(9);
    });

    it('snaps to pentatonic correctly', () => {
      // C Pentatonic Major: 0, 2, 4, 7, 9
      // Index 5 (F) should snap to 4 (E) or 7 (G). Distance to 4 is 1, distance to 7 is 2. So snaps to 4.
      expect(getActiveNoteIndex((Math.PI / 6) * 5, true, 'PentatonicMajor', 0)).toBe(4);
      
      // Index 11 (B) should snap to 9 (A) or 0 (C). Distance to 9 is 2, distance to 0 is 1. So snaps to 0.
      expect(getActiveNoteIndex((Math.PI / 6) * 11, true, 'PentatonicMajor', 0)).toBe(0);
    });
  });
});
