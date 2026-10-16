import { create } from 'zustand';

export interface SongChord {
  root: string;       // "G", "C#", "Bb"
  quality: string;    // "maj", "min", "7", "maj7" — must match CHORD_INTERVALS keys
  bass?: string;      // optional slash bass note
}

export interface SongSection {
  id: string;
  name: string;           // "Intro", "Chorus", or custom
  colorTag: string;       // hex color e.g. "#00f0ff"
  key?: string;           // undefined = inherit song default key
  bpmOverride?: number;   // undefined = inherit song default bpm
  repeatCount: number;    // default 1
  chords: SongChord[];
}

export interface Song {
  id: string;
  name: string;
  artist?: string;
  defaultKey: string;     // "G", "Am", "C#" ...
  defaultBpm?: number;
  sections: SongSection[];
  createdAt: number;
  updatedAt: number;
}

interface SongModeState {
  songs: Song[];
  activeSongId: string | null;
  activeSectionIndex: number;
  activeChordIndexInSection: number;
  activeSectionRepeat: number;
  autoAdvanceEnabled: boolean;
  isSongPanelOpen: boolean;

  // Actions
  toggleSongPanel: () => void;
  setActiveSong: (id: string | null) => void;
  setActiveSection: (index: number) => void;
  nextSection: () => void;
  prevSection: () => void;
  setAutoAdvance: (enabled: boolean) => void;
  advanceSongCycle: () => boolean;
  replaceLibrary: (songs: Song[], activeSongId: string | null) => void;

  // CRUD
  saveSong: (song: Song) => void;
  deleteSong: (id: string) => void;
}

export interface SongPlaybackPosition {
  sectionIndex: number;
  repeat: number;
  completed: boolean;
}

export function getNextSongPlaybackPosition(
  song: Song,
  sectionIndex: number,
  repeat: number,
): SongPlaybackPosition {
  const section = song.sections[sectionIndex];
  if (!section) return { sectionIndex: 0, repeat: 1, completed: true };
  if (repeat < Math.max(1, section.repeatCount)) {
    return { sectionIndex, repeat: repeat + 1, completed: false };
  }
  if (sectionIndex < song.sections.length - 1) {
    return { sectionIndex: sectionIndex + 1, repeat: 1, completed: false };
  }
  return { sectionIndex, repeat, completed: true };
}

const STORAGE_KEY = 'kasync-songs-v2';

/** The built-in demo song. Uses proper quality strings that match CHORD_INTERVALS. */
const DEMO_SONG: Song = {
  id: 'demo-let-her-go',
  name: 'Let Her Go',
  artist: 'Passenger',
  defaultKey: 'G',
  defaultBpm: 75,
  createdAt: 0,
  updatedAt: 0,
  sections: [
    {
      id: 'demo-intro',
      name: 'Intro',
      colorTag: '#00f0ff',
      repeatCount: 1,
      chords: [
        { root: 'G', quality: 'maj' },
        { root: 'D', quality: 'maj' },
        { root: 'E', quality: 'min' },
        { root: 'C', quality: 'maj' },
      ],
    },
    {
      id: 'demo-verse',
      name: 'Verse',
      colorTag: '#9D4EDD',
      repeatCount: 2,
      chords: [
        { root: 'G', quality: 'maj' },
        { root: 'D', quality: 'maj' },
        { root: 'E', quality: 'min' },
        { root: 'C', quality: 'maj' },
      ],
    },
    {
      id: 'demo-chorus',
      name: 'Chorus',
      colorTag: '#F9A826',
      repeatCount: 1,
      chords: [
        { root: 'C', quality: 'maj' },
        { root: 'G', quality: 'maj' },
        { root: 'D', quality: 'maj' },
        { root: 'E', quality: 'min' },
      ],
    },
    {
      id: 'demo-bridge',
      name: 'Bridge',
      colorTag: '#FF4D6D',
      key: 'E',  // key change!
      repeatCount: 1,
      chords: [
        { root: 'E', quality: 'min' },
        { root: 'C', quality: 'maj' },
        { root: 'G', quality: 'maj' },
        { root: 'D', quality: 'maj' },
      ],
    },
  ],
};

export const DEFAULT_SONGS: Song[] = [
  DEMO_SONG,
  {
    id: 'song-all-or-nothing',
    name: 'All or Nothing',
    artist: 'O-Town',
    defaultKey: 'C',
    defaultBpm: 68,
    createdAt: 0,
    updatedAt: 0,
    sections: [
      {
        id: 'aon-intro',
        name: 'Intro',
        colorTag: '#00f0ff',
        repeatCount: 1,
        chords: [
          { root: 'C', quality: 'maj' },
          { root: 'A', quality: 'min' },
          { root: 'F', quality: 'maj' },
          { root: 'G', quality: 'maj' },
        ],
      },
      {
        id: 'aon-verse',
        name: 'Verse',
        colorTag: '#9D4EDD',
        repeatCount: 2,
        chords: [
          { root: 'C', quality: 'maj' },
          { root: 'A', quality: 'min' },
          { root: 'F', quality: 'maj' },
          { root: 'G', quality: 'maj' },
        ],
      },
      {
        id: 'aon-prechorus',
        name: 'Pre-Chorus',
        colorTag: '#7B5EA7',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'min' },
          { root: 'E', quality: 'min' },
          { root: 'F', quality: 'maj' },
          { root: 'G', quality: 'maj' },
        ],
      },
      {
        id: 'aon-chorus',
        name: 'Chorus',
        colorTag: '#F9A826',
        repeatCount: 2,
        chords: [
          { root: 'C', quality: 'maj' },
          { root: 'G', quality: 'maj' },
          { root: 'A', quality: 'min' },
          { root: 'F', quality: 'maj' },
        ],
      },
      {
        id: 'aon-bridge',
        name: 'Bridge',
        colorTag: '#FF4D6D',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'min' },
          { root: 'G', quality: 'maj' },
          { root: 'C', quality: 'maj' },
          { root: 'A', quality: 'min' },
          { root: 'D', quality: 'min' },
          { root: 'G', quality: 'maj' },
        ],
      },
      {
        id: 'aon-final-chorus',
        name: 'Key Change',
        colorTag: '#F9A826',
        key: 'D',
        repeatCount: 2,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: 'maj' },
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'maj' },
        ],
      },
    ],
  },
  {
    id: 'song-all-of-me',
    name: 'All of Me',
    artist: 'John Legend',
    defaultKey: 'G#',
    defaultBpm: 63,
    createdAt: 0,
    updatedAt: 0,
    sections: [
      {
        id: 'aom-intro',
        name: 'Intro',
        colorTag: '#00f0ff',
        repeatCount: 1,
        chords: [
          { root: 'F', quality: 'min' },
          { root: 'C#', quality: 'maj' },
          { root: 'G#', quality: 'maj' },
          { root: 'D#', quality: 'maj' },
        ],
      },
      {
        id: 'aom-verse',
        name: 'Verse',
        colorTag: '#9D4EDD',
        repeatCount: 2,
        chords: [
          { root: 'F', quality: 'min' },
          { root: 'C#', quality: 'maj' },
          { root: 'G#', quality: 'maj' },
          { root: 'D#', quality: 'maj' },
        ],
      },
      {
        id: 'aom-prechorus',
        name: 'Pre-Chorus',
        colorTag: '#7B5EA7',
        repeatCount: 1,
        chords: [
          { root: 'A#', quality: 'min' },
          { root: 'G#', quality: 'maj' },
          { root: 'D#', quality: 'maj' },
        ],
      },
      {
        id: 'aom-chorus',
        name: 'Chorus',
        colorTag: '#F9A826',
        repeatCount: 2,
        chords: [
          { root: 'G#', quality: 'maj' },
          { root: 'F', quality: 'min' },
          { root: 'A#', quality: 'min' },
          { root: 'C#', quality: 'maj' },
          { root: 'D#', quality: 'maj' },
        ],
      },
      {
        id: 'aom-bridge',
        name: 'Bridge',
        colorTag: '#FF4D6D',
        repeatCount: 1,
        chords: [
          { root: 'A#', quality: 'min' },
          { root: 'G#', quality: 'maj' },
          { root: 'D#', quality: 'maj' },
          { root: 'C#', quality: 'maj' },
        ],
      },
    ],
  },
  {
    id: 'song-beautiful',
    name: 'Beautiful',
    artist: 'Bazzi ft. Camila Cabello',
    defaultKey: 'D',
    defaultBpm: 76,
    createdAt: 0,
    updatedAt: 0,
    sections: [
      {
        id: 'b-intro',
        name: 'Intro',
        colorTag: '#00f0ff',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'F#', quality: '7' },
          { root: 'B', quality: 'min' },
          { root: 'A', quality: 'maj' },
          { root: 'G', quality: 'maj' },
          { root: 'G', quality: 'min' },
        ],
      },
      {
        id: 'b-verse',
        name: 'Verse',
        colorTag: '#9D4EDD',
        repeatCount: 2,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'F#', quality: '7' },
          { root: 'B', quality: 'min' },
          { root: 'A', quality: 'maj' },
          { root: 'G', quality: 'maj' },
          { root: 'G', quality: 'min' },
        ],
      },
      {
        id: 'b-prechorus',
        name: 'Pre-Chorus',
        colorTag: '#7B5EA7',
        repeatCount: 1,
        chords: [
          { root: 'G', quality: 'maj' },
          { root: 'A', quality: 'maj' },
          { root: 'F#', quality: 'min' },
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'min' },
        ],
      },
      {
        id: 'b-chorus',
        name: 'Chorus',
        colorTag: '#F9A826',
        repeatCount: 2,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'F#', quality: '7' },
          { root: 'B', quality: 'min' },
          { root: 'A', quality: 'maj' },
          { root: 'G', quality: 'maj' },
          { root: 'G', quality: 'min' },
        ],
      },
      {
        id: 'b-outro',
        name: 'Outro',
        colorTag: '#4CAF50',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'F#', quality: '7' },
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'min' },
          { root: 'D', quality: 'maj' },
        ],
      },
    ],
  },
  {
    id: 'song-ghost',
    name: 'Ghost',
    artist: 'Justin Bieber',
    defaultKey: 'D',
    defaultBpm: 154,
    createdAt: 0,
    updatedAt: 0,
    sections: [
      {
        id: 'g-intro',
        name: 'Intro',
        colorTag: '#00f0ff',
        repeatCount: 1,
        chords: [
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'maj' },
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: 'maj' },
        ],
      },
      {
        id: 'g-verse',
        name: 'Verse',
        colorTag: '#9D4EDD',
        repeatCount: 2,
        chords: [
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'maj' },
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: 'maj' },
        ],
      },
      {
        id: 'g-prechorus',
        name: 'Pre-Chorus',
        colorTag: '#7B5EA7',
        repeatCount: 1,
        chords: [
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'maj' },
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: 'maj' },
        ],
      },
      {
        id: 'g-chorus',
        name: 'Chorus',
        colorTag: '#F9A826',
        repeatCount: 2,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: 'maj' },
          { root: 'B', quality: 'min' },
          { root: 'G', quality: 'maj' },
        ],
      },
      {
        id: 'g-bridge',
        name: 'Bridge',
        colorTag: '#FF4D6D',
        repeatCount: 1,
        chords: [
          { root: 'E', quality: 'min' },
          { root: 'G', quality: 'maj' },
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: 'maj' },
        ],
      },
    ],
  },
  {
    id: 'song-my-way',
    name: 'My Way',
    artist: 'Frank Sinatra',
    defaultKey: 'D',
    defaultBpm: 75,
    createdAt: 0,
    updatedAt: 0,
    sections: [
      {
        id: 'mw-intro',
        name: 'Intro',
        colorTag: '#00f0ff',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'D', quality: 'maj7' },
          { root: 'D', quality: '7' },
          { root: 'B', quality: '7' },
        ],
      },
      {
        id: 'mw-verse',
        name: 'Verse',
        colorTag: '#9D4EDD',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'D', quality: 'maj7' },
          { root: 'D', quality: '7' },
          { root: 'B', quality: '7' },
          { root: 'E', quality: 'min' },
          { root: 'E', quality: 'm7' },
          { root: 'A', quality: '7' },
          { root: 'D', quality: 'maj' },
        ],
      },
      {
        id: 'mw-highway',
        name: 'Pre-Chorus',
        colorTag: '#7B5EA7',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'D', quality: '7' },
          { root: 'G', quality: 'maj' },
          { root: 'G', quality: 'min' },
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: '7' },
          { root: 'D', quality: 'maj' },
        ],
      },
      {
        id: 'mw-chorus',
        name: 'Chorus',
        colorTag: '#F9A826',
        repeatCount: 1,
        chords: [
          { root: 'D', quality: 'maj' },
          { root: 'D', quality: '7' },
          { root: 'G', quality: 'maj' },
          { root: 'E', quality: 'min' },
          { root: 'A', quality: '7' },
          { root: 'D', quality: 'maj' },
        ],
      },
      {
        id: 'mw-outro',
        name: 'Outro',
        colorTag: '#4CAF50',
        repeatCount: 1,
        chords: [
          { root: 'G', quality: 'maj' },
          { root: 'G', quality: 'min' },
          { root: 'D', quality: 'maj' },
          { root: 'A', quality: '7' },
          { root: 'D', quality: 'maj' },
        ],
      },
    ],
  },
];

function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Song[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically merge missing built-in default songs into the stored library
        const existingIds = new Set(parsed.map(s => s.id));
        const missingDefaults = DEFAULT_SONGS.filter(s => !existingIds.has(s.id));
        if (missingDefaults.length > 0) {
          const merged = [...parsed, ...missingDefaults];
          persistSongs(merged);
          return merged;
        }
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_SONGS;
}

function persistSongs(songs: Song[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
  } catch { /* ignore */ }
}

export const useSongStore = create<SongModeState>((set, get) => {
  const initialSongs = loadSongs();
  const initialId = initialSongs[0]?.id ?? null;

  return {
    songs: initialSongs,
    activeSongId: initialId,
    activeSectionIndex: 0,
    activeChordIndexInSection: 0,
    activeSectionRepeat: 1,
    autoAdvanceEnabled: true,
    isSongPanelOpen: false,

    toggleSongPanel: () => set(s => ({ isSongPanelOpen: !s.isSongPanelOpen })),

    setActiveSong: (id) => set({
      activeSongId: id,
      activeSectionIndex: 0,
      activeChordIndexInSection: 0,
      activeSectionRepeat: 1,
    }),

    setActiveSection: (index) => {
      const { songs, activeSongId } = get();
      const song = songs.find(s => s.id === activeSongId);
      if (!song) return;
      const safe = Math.max(0, Math.min(index, song.sections.length - 1));
      set({ activeSectionIndex: safe, activeChordIndexInSection: 0, activeSectionRepeat: 1 });
    },

    nextSection: () => {
      const { songs, activeSongId, activeSectionIndex } = get();
      const song = songs.find(s => s.id === activeSongId);
      if (!song) return;
      if (activeSectionIndex < song.sections.length - 1) {
        set({ activeSectionIndex: activeSectionIndex + 1, activeChordIndexInSection: 0, activeSectionRepeat: 1 });
      }
    },

    prevSection: () => {
      const { activeSectionIndex } = get();
      if (activeSectionIndex > 0) {
        set({ activeSectionIndex: activeSectionIndex - 1, activeChordIndexInSection: 0, activeSectionRepeat: 1 });
      }
    },

    setAutoAdvance: (enabled) => set({ autoAdvanceEnabled: enabled }),

    advanceSongCycle: () => {
      const { songs, activeSongId, activeSectionIndex, activeSectionRepeat } = get();
      const song = songs.find(candidate => candidate.id === activeSongId);
      if (!song) return false;
      const next = getNextSongPlaybackPosition(song, activeSectionIndex, activeSectionRepeat);
      if (next.completed) return false;
      set({
        activeSectionIndex: next.sectionIndex,
        activeSectionRepeat: next.repeat,
        activeChordIndexInSection: 0,
      });
      return true;
    },

    replaceLibrary: (songs, activeSongId) => {
      persistSongs(songs);
      const safeActiveId = songs.some(song => song.id === activeSongId)
        ? activeSongId
        : (songs[0]?.id ?? null);
      set({
        songs,
        activeSongId: safeActiveId,
        activeSectionIndex: 0,
        activeChordIndexInSection: 0,
        activeSectionRepeat: 1,
      });
    },

    saveSong: (song) => set(s => {
      const idx = s.songs.findIndex(x => x.id === song.id);
      const next = [...s.songs];
      if (idx >= 0) {
        next[idx] = { ...song, updatedAt: Date.now() };
      } else {
        next.push({ ...song, createdAt: Date.now(), updatedAt: Date.now() });
      }
      persistSongs(next);
      return { songs: next };
    }),

    deleteSong: (id) => set(s => {
      const next = s.songs.filter(x => x.id !== id);
      persistSongs(next);
      return {
        songs: next,
        activeSongId: s.activeSongId === id ? (next[0]?.id ?? null) : s.activeSongId,
        activeSectionIndex: s.activeSongId === id ? 0 : s.activeSectionIndex,
        activeSectionRepeat: s.activeSongId === id ? 1 : s.activeSectionRepeat,
      };
    }),
  };
});
