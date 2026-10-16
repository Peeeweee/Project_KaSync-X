import { describe, expect, it } from 'vitest';
import { DEFAULT_SONGS, getNextSongPlaybackPosition, type Song } from './songStore';
import { CHROMATIC_NOTES } from '../music/scales';
import { CHORD_INTERVALS } from '../music/chords';

const song: Song = {
  id: 'test', name: 'Test', defaultKey: 'C', createdAt: 0, updatedAt: 0,
  sections: [
    { id: 'verse', name: 'Verse', colorTag: '#fff', repeatCount: 2, chords: [] },
    { id: 'chorus', name: 'Chorus', colorTag: '#000', repeatCount: 1, chords: [] },
  ],
};

describe('Song Mode playback progression', () => {
  it('honors section repeat counts before advancing', () => {
    expect(getNextSongPlaybackPosition(song, 0, 1)).toEqual({
      sectionIndex: 0, repeat: 2, completed: false,
    });
    expect(getNextSongPlaybackPosition(song, 0, 2)).toEqual({
      sectionIndex: 1, repeat: 1, completed: false,
    });
  });

  it('reports completion after the final section repeat', () => {
    expect(getNextSongPlaybackPosition(song, 1, 1)).toEqual({
      sectionIndex: 1, repeat: 1, completed: true,
    });
  });
});

describe('Default Song Library', () => {
  it('contains the built-in and requested songs with valid structures', () => {
    expect(DEFAULT_SONGS.length).toBe(6);
    const names = DEFAULT_SONGS.map(s => s.name);
    expect(names).toContain('Let Her Go');
    expect(names).toContain('All or Nothing');
    expect(names).toContain('All of Me');
    expect(names).toContain('Beautiful');
    expect(names).toContain('Ghost');
    expect(names).toContain('My Way');

    for (const s of DEFAULT_SONGS) {
      expect(s.sections.length).toBeGreaterThan(0);
      for (const section of s.sections) {
        expect(section.chords.length).toBeGreaterThan(0);
        for (const chord of section.chords) {
          expect(CHROMATIC_NOTES).toContain(chord.root);
          expect(Object.keys(CHORD_INTERVALS)).toContain(chord.quality);
          if (chord.bass) {
            expect(CHROMATIC_NOTES).toContain(chord.bass);
          }
        }
      }
    }
  });
});
