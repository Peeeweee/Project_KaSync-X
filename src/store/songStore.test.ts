import { describe, expect, it } from 'vitest';
import { getNextSongPlaybackPosition, type Song } from './songStore';

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
