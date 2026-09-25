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
  isSongPanelOpen: boolean;

  // Actions
  toggleSongPanel: () => void;
  setActiveSong: (id: string | null) => void;
  setActiveSection: (index: number) => void;
  nextSection: () => void;
  prevSection: () => void;

  // CRUD
  saveSong: (song: Song) => void;
  deleteSong: (id: string) => void;
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

function loadSongs(): Song[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Song[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [DEMO_SONG];
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
    isSongPanelOpen: false,

    toggleSongPanel: () => set(s => ({ isSongPanelOpen: !s.isSongPanelOpen })),

    setActiveSong: (id) => set({
      activeSongId: id,
      activeSectionIndex: 0,
      activeChordIndexInSection: 0,
    }),

    setActiveSection: (index) => {
      const { songs, activeSongId } = get();
      const song = songs.find(s => s.id === activeSongId);
      if (!song) return;
      const safe = Math.max(0, Math.min(index, song.sections.length - 1));
      set({ activeSectionIndex: safe, activeChordIndexInSection: 0 });
    },

    nextSection: () => {
      const { songs, activeSongId, activeSectionIndex } = get();
      const song = songs.find(s => s.id === activeSongId);
      if (!song) return;
      if (activeSectionIndex < song.sections.length - 1) {
        set({ activeSectionIndex: activeSectionIndex + 1, activeChordIndexInSection: 0 });
      }
    },

    prevSection: () => {
      const { activeSectionIndex } = get();
      if (activeSectionIndex > 0) {
        set({ activeSectionIndex: activeSectionIndex - 1, activeChordIndexInSection: 0 });
      }
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
      };
    }),
  };
});
