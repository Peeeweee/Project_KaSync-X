import { useMidiLearnStore, type CcMapping, type LearnTarget } from '../midi/midiLearn';
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_LOOP_BARS,
  DEFAULT_PPQ,
  LOOP_BAR_OPTIONS,
  METER_OPTIONS,
  loopTicks,
  type BeatsPerBar,
  type LoopBars,
} from '../looper/timing';
import type { Track, TrackEvent } from '../looper/trackModel';
import { PINCH_METRIC_VERSION, loadPinchThresholds } from '../tracking/pinchSettings';
import { useLooperStore } from '../store/looperState';
import { useMusicStore, type EffectsState, type InstrumentMode, type InstrumentType } from '../store/musicState';
import { useSessionStore } from '../store/sessionState';
import { useSongStore, type Song, type SongChord, type SongSection } from '../store/songStore';
import {
  useTrackingSettingsStore,
  type TrackingPreferences,
  type TrackingQuality,
} from '../store/trackingSettings';

export const SESSION_VERSION = 2;
export const SESSION_STORAGE_KEY = 'kasync-session-v1';
export const MAX_SESSION_FILE_BYTES = 5 * 1024 * 1024;

interface PersistedMusicState {
  mode: InstrumentMode;
  currentScale: string;
  currentKey: string;
  snapToScale: boolean;
  showExtendedQualities: boolean;
  currentInstrument: InstrumentType;
}

interface PersistedLooperState {
  tracks: Track[];
  quantize: boolean;
  bpm: number;
  loopBars: LoopBars;
  beatsPerBar: BeatsPerBar;
  metronomeEnabled: boolean;
  countInBars: 0 | 1 | 2;
  overdubEnabled: boolean;
}

interface PersistedSongState {
  songs: Song[];
  activeSongId: string | null;
  activeSectionIndex: number;
  autoAdvanceEnabled: boolean;
}

export interface KasyncSessionDocument {
  kind: 'kasync-session';
  version: typeof SESSION_VERSION;
  meta: {
    name: string;
    savedAt: number;
    app: 'Kasync.x';
  };
  music: PersistedMusicState;
  looper: PersistedLooperState;
  songMode: PersistedSongState;
  tracking: TrackingPreferences;
  midiMappings: CcMapping[];
}

const instruments: InstrumentType[] = ['Subtractive', 'FM', 'Electric Piano', 'Pad'];
const modes: InstrumentMode[] = ['Melody', 'Chord', 'Song'];
const qualities: TrackingQuality[] = ['auto', 'audio', 'performance', 'balanced', 'quality'];
const scales = ['Major', 'Minor', 'PentatonicMajor', 'PentatonicMinor', 'Blues'];
const defaultEffects: EffectsState = {
  reverb: false,
  delay: false,
  chorus: false,
  bitcrusher: false,
  sustain: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeEffects(value: unknown): EffectsState {
  const source = isRecord(value) ? value : {};
  return {
    reverb: bool(source.reverb, false),
    delay: bool(source.delay, false),
    chorus: bool(source.chorus, false),
    bitcrusher: bool(source.bitcrusher, false),
    sustain: bool(source.sustain, false),
  };
}

function normalizeEvent(value: unknown, length: number): TrackEvent | null {
  if (!isRecord(value) || !Array.isArray(value.notes)) return null;
  const notes = value.notes
    .filter((note): note is string => typeof note === 'string' && note.length > 0 && note.length <= 8)
    .slice(0, 16);
  if (notes.length === 0) return null;
  return {
    notes,
    velocity: number(value.velocity, 0.8, 0, 1),
    tick: Math.round(number(value.tick, 0, 0, length - 1)),
    durationTicks: Math.round(number(value.durationTicks, 48, 1, length)),
  };
}

function defaultTrack(id: number): Track {
  return {
    id,
    events: [],
    isArmed: id === 0,
    isMuted: false,
    isSoloed: false,
    volume: 0.8,
    instrument: id === 0 ? 'Subtractive' : 'Pad',
    effects: { ...defaultEffects },
  };
}

function normalizeTracks(value: unknown, bars: LoopBars, beatsPerBar: BeatsPerBar): Track[] {
  const length = loopTicks(DEFAULT_PPQ, bars, beatsPerBar);
  const incoming = Array.isArray(value) ? value : [];
  const byId = new Map<number, Track>();
  incoming.slice(0, 12).forEach((candidate, index) => {
    if (!isRecord(candidate)) return;
    const id = Math.round(number(candidate.id, index, 0, 5));
    const instrument = instruments.includes(candidate.instrument as InstrumentType)
      ? candidate.instrument as InstrumentType
      : defaultTrack(id).instrument;
    const events = Array.isArray(candidate.events)
      ? candidate.events.slice(0, 10_000).map(event => normalizeEvent(event, length)).filter((event): event is TrackEvent => event !== null)
      : [];
    byId.set(id, {
      id,
      events,
      isArmed: bool(candidate.isArmed, false),
      isMuted: bool(candidate.isMuted, false),
      isSoloed: bool(candidate.isSoloed, false),
      volume: number(candidate.volume, 0.8, 0, 1),
      instrument,
      effects: normalizeEffects(candidate.effects),
    });
  });

  const tracks = Array.from({ length: 6 }, (_, id) => byId.get(id) ?? defaultTrack(id));
  const firstArmed = tracks.findIndex(track => track.isArmed);
  return tracks.map((track, index) => ({
    ...track,
    isArmed: firstArmed === -1 ? index === 0 : index === firstArmed,
  }));
}

function normalizeChord(value: unknown): SongChord | null {
  if (!isRecord(value)) return null;
  const root = text(value.root, '', 4);
  if (!root) return null;
  const bass = typeof value.bass === 'string' && value.bass.trim()
    ? value.bass.trim().slice(0, 4)
    : undefined;
  return { root, quality: text(value.quality, 'maj', 12), ...(bass ? { bass } : {}) };
}

function normalizeSection(value: unknown, index: number): SongSection | null {
  if (!isRecord(value)) return null;
  const chords = Array.isArray(value.chords)
    ? value.chords.slice(0, 64).map(normalizeChord).filter((chord): chord is SongChord => chord !== null)
    : [];
  const key = typeof value.key === 'string' && value.key.trim() ? value.key.trim().slice(0, 4) : undefined;
  const bpmOverride = typeof value.bpmOverride === 'number'
    ? Math.round(number(value.bpmOverride, 120, 30, 300))
    : undefined;
  return {
    id: text(value.id, `section-${index + 1}`, 80),
    name: text(value.name, `Section ${index + 1}`, 80),
    colorTag: /^#[0-9a-f]{6}$/i.test(String(value.colorTag)) ? String(value.colorTag) : '#9D4EDD',
    ...(key ? { key } : {}),
    ...(bpmOverride ? { bpmOverride } : {}),
    repeatCount: Math.round(number(value.repeatCount, 1, 1, 16)),
    chords,
  };
}

function normalizeSongs(value: unknown): Song[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [];
    const sections = Array.isArray(candidate.sections)
      ? candidate.sections.slice(0, 64).map(normalizeSection).filter((section): section is SongSection => section !== null)
      : [];
    if (sections.length === 0) return [];
    const artist = typeof candidate.artist === 'string' && candidate.artist.trim()
      ? candidate.artist.trim().slice(0, 120)
      : undefined;
    const defaultBpm = typeof candidate.defaultBpm === 'number'
      ? Math.round(number(candidate.defaultBpm, 120, 30, 300))
      : undefined;
    return [{
      id: text(candidate.id, `song-${index + 1}`, 80),
      name: text(candidate.name, `Song ${index + 1}`, 120),
      ...(artist ? { artist } : {}),
      defaultKey: text(candidate.defaultKey, 'C', 4),
      ...(defaultBpm ? { defaultBpm } : {}),
      sections,
      createdAt: number(candidate.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      updatedAt: number(candidate.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    } satisfies Song];
  });
}

function isLearnTarget(value: unknown): value is LearnTarget {
  return typeof value === 'string' && (
    value === 'bpm' ||
    /^track-[0-5]-(volume|mute|solo)$/.test(value) ||
    /^effect-(reverb|delay|chorus|bitcrusher)$/.test(value)
  );
}

function normalizeMappings(value: unknown): CcMapping[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 128).flatMap(candidate => {
    if (!isRecord(candidate) || !isLearnTarget(candidate.target)) return [];
    return [{
      cc: Math.round(number(candidate.cc, 0, 0, 127)),
      target: candidate.target,
      label: text(candidate.label, candidate.target, 80),
    }];
  });
}

export function captureSession(name = useSessionStore.getState().projectName): KasyncSessionDocument {
  const music = useMusicStore.getState();
  const looper = useLooperStore.getState();
  const songMode = useSongStore.getState();
  const tracking = useTrackingSettingsStore.getState();
  return {
    kind: 'kasync-session',
    version: SESSION_VERSION,
    meta: { name: text(name, 'Untitled Session', 100), savedAt: Date.now(), app: 'Kasync.x' },
    music: {
      mode: music.mode,
      currentScale: music.currentScale,
      currentKey: music.currentKey,
      snapToScale: music.snapToScale,
      showExtendedQualities: music.showExtendedQualities,
      currentInstrument: music.currentInstrument,
    },
    looper: {
      tracks: looper.tracks.map(track => ({ ...track, events: track.events.map(event => ({ ...event, notes: [...event.notes] })), effects: { ...track.effects } })),
      quantize: looper.quantize,
      bpm: looper.bpm,
      loopBars: looper.loopBars,
      beatsPerBar: looper.beatsPerBar,
      metronomeEnabled: looper.metronomeEnabled,
      countInBars: looper.countInBars,
      overdubEnabled: looper.overdubEnabled,
    },
    songMode: {
      songs: songMode.songs.map(song => ({ ...song, sections: song.sections.map(section => ({ ...section, chords: section.chords.map(chord => ({ ...chord })) })) })),
      activeSongId: songMode.activeSongId,
      activeSectionIndex: songMode.activeSectionIndex,
      autoAdvanceEnabled: songMode.autoAdvanceEnabled,
    },
    tracking: {
      trackingEngine: tracking.trackingEngine,
      quality: tracking.quality,
      smoothingAlpha: tracking.smoothingAlpha,
      pinchThreshold: tracking.pinchThreshold,
      pinchReleaseThreshold: tracking.pinchReleaseThreshold,
      pinchMetricVersion: PINCH_METRIC_VERSION,
      mirrorCamera: tracking.mirrorCamera,
      showHandOverlay: tracking.showHandOverlay,
    },
    midiMappings: useMidiLearnStore.getState().mappings.map(mapping => ({ ...mapping })),
  };
}

export function parseSessionText(raw: string): KasyncSessionDocument {
  if (new Blob([raw]).size > MAX_SESSION_FILE_BYTES) throw new Error('Session file exceeds the 5 MB safety limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('This is not valid JSON.');
  }
  if (!isRecord(parsed) || parsed.kind !== 'kasync-session') throw new Error('This is not a Kasync.x session file.');
  if (parsed.version !== 1 && parsed.version !== SESSION_VERSION) {
    throw new Error(`Unsupported session version: ${String(parsed.version)}.`);
  }
  if (!isRecord(parsed.music) || !isRecord(parsed.looper) || !Array.isArray(parsed.looper.tracks)) {
    throw new Error('The session is incomplete or damaged.');
  }
  if (!isRecord(parsed.songMode) || !Array.isArray(parsed.songMode.songs) || !isRecord(parsed.tracking)) {
    throw new Error('The session is incomplete or damaged.');
  }

  const meta = isRecord(parsed.meta) ? parsed.meta : {};
  const music = isRecord(parsed.music) ? parsed.music : {};
  const looper = isRecord(parsed.looper) ? parsed.looper : {};
  const loopBars = LOOP_BAR_OPTIONS.includes(looper.loopBars as LoopBars)
    ? looper.loopBars as LoopBars
    : DEFAULT_LOOP_BARS;
  const beatsPerBar = METER_OPTIONS.includes(looper.beatsPerBar as BeatsPerBar)
    ? looper.beatsPerBar as BeatsPerBar
    : DEFAULT_BEATS_PER_BAR;
  const songMode = isRecord(parsed.songMode) ? parsed.songMode : {};
  const tracking = isRecord(parsed.tracking) ? parsed.tracking : {};
  const normalizedSongs = normalizeSongs(songMode.songs);
  const activeSongId = typeof songMode.activeSongId === 'string' && normalizedSongs.some(song => song.id === songMode.activeSongId)
    ? songMode.activeSongId
    : (normalizedSongs[0]?.id ?? null);
  const quality = qualities.includes(tracking.quality as TrackingQuality)
    ? tracking.quality as TrackingQuality
    : 'auto';
  const { pinchThreshold, pinchReleaseThreshold } = loadPinchThresholds(tracking);

  return {
    kind: 'kasync-session',
    version: SESSION_VERSION,
    meta: {
      name: text(meta.name, 'Imported Session', 100),
      savedAt: number(meta.savedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      app: 'Kasync.x',
    },
    music: {
      mode: modes.includes(music.mode as InstrumentMode) ? music.mode as InstrumentMode : 'Melody',
      currentScale: scales.includes(String(music.currentScale)) ? String(music.currentScale) : 'Major',
      currentKey: text(music.currentKey, 'C', 4),
      snapToScale: bool(music.snapToScale, true),
      showExtendedQualities: bool(music.showExtendedQualities, false),
      currentInstrument: instruments.includes(music.currentInstrument as InstrumentType)
        ? music.currentInstrument as InstrumentType
        : 'Subtractive',
    },
    looper: {
      tracks: normalizeTracks(looper.tracks, loopBars, beatsPerBar),
      quantize: bool(looper.quantize, true),
      bpm: Math.round(number(looper.bpm, 120, 30, 300)),
      loopBars,
      beatsPerBar,
      metronomeEnabled: bool(looper.metronomeEnabled, false),
      countInBars: [0, 1, 2].includes(looper.countInBars as number) ? looper.countInBars as 0 | 1 | 2 : 1,
      overdubEnabled: bool(looper.overdubEnabled, true),
    },
    songMode: {
      songs: normalizedSongs,
      activeSongId,
      activeSectionIndex: Math.round(number(songMode.activeSectionIndex, 0, 0, Math.max(0, (normalizedSongs.find(song => song.id === activeSongId)?.sections.length ?? 1) - 1))),
      autoAdvanceEnabled: bool(songMode.autoAdvanceEnabled, true),
    },
    tracking: {
      trackingEngine: tracking.trackingEngine === 'worker' ? 'worker' : 'compatible',
      quality,
      smoothingAlpha: number(tracking.smoothingAlpha, 0.5, 0.2, 0.85),
      pinchThreshold,
      pinchReleaseThreshold: Math.min(0.9, pinchReleaseThreshold),
      pinchMetricVersion: PINCH_METRIC_VERSION,
      mirrorCamera: bool(tracking.mirrorCamera, true),
      showHandOverlay: bool(tracking.showHandOverlay, true),
    },
    midiMappings: normalizeMappings(parsed.midiMappings),
  };
}

let applyingSession = false;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

export function applySession(session: KasyncSessionDocument) {
  applyingSession = true;
  try {
    useLooperStore.setState({
      tracks: session.looper.tracks,
      isPlaying: false,
      isGlobalRecording: false,
      isCountingIn: false,
      quantize: session.looper.quantize,
      bpm: session.looper.bpm,
      loopBars: session.looper.loopBars,
      beatsPerBar: session.looper.beatsPerBar,
      metronomeEnabled: session.looper.metronomeEnabled,
      countInBars: session.looper.countInBars,
      overdubEnabled: session.looper.overdubEnabled,
      undoHistory: {},
      redoHistory: {},
      pendingTake: null,
    });
    useMusicStore.getState().setMusicState({
      ...session.music,
      hoveredRoot: null,
      hoveredQuality: null,
      hoveredBass: null,
      hoveredEffect: null,
      playingNotes: [],
    });
    useSongStore.getState().replaceLibrary(session.songMode.songs, session.songMode.activeSongId);
    useSongStore.setState({
      activeSectionIndex: session.songMode.activeSectionIndex,
      activeSectionRepeat: 1,
      autoAdvanceEnabled: session.songMode.autoAdvanceEnabled,
      isSongPanelOpen: false,
    });
    useTrackingSettingsStore.getState().setPreferences(session.tracking);
    useMidiLearnStore.getState().replaceMappings(session.midiMappings);
    useSessionStore.getState().setProjectName(session.meta.name);
  } finally {
    applyingSession = false;
  }
}

export function saveAutosave(): boolean {
  try {
    useSessionStore.getState().setSaveStatus('saving');
    const session = captureSession();
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    useSessionStore.getState().setSaveStatus('saved', session.meta.savedAt);
    return true;
  } catch (error) {
    console.error('Session autosave failed:', error);
    useSessionStore.getState().setSaveStatus('error');
    return false;
  }
}

export function restoreAutosave(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return false;
    const session = parseSessionText(raw);
    applySession(session);
    useSessionStore.getState().setSaveStatus('saved', session.meta.savedAt);
    return true;
  } catch (error) {
    console.error('Session restore failed:', error);
    useSessionStore.getState().setSaveStatus('error');
    return false;
  }
}

function scheduleAutosave() {
  if (applyingSession) return;
  useSessionStore.getState().setSaveStatus('saving');
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    saveAutosave();
  }, 750);
}

export function startSessionPersistence(): () => void {
  const unsubscribers = [
    useMusicStore.subscribe((state, previous) => {
      if (
        state.mode !== previous.mode || state.currentScale !== previous.currentScale ||
        state.currentKey !== previous.currentKey || state.snapToScale !== previous.snapToScale ||
        state.showExtendedQualities !== previous.showExtendedQualities ||
        state.currentInstrument !== previous.currentInstrument
      ) scheduleAutosave();
    }),
    useLooperStore.subscribe((state, previous) => {
      if (
        state.tracks !== previous.tracks || state.quantize !== previous.quantize ||
        state.bpm !== previous.bpm || state.loopBars !== previous.loopBars ||
        state.beatsPerBar !== previous.beatsPerBar || state.metronomeEnabled !== previous.metronomeEnabled ||
        state.countInBars !== previous.countInBars || state.overdubEnabled !== previous.overdubEnabled
      ) scheduleAutosave();
    }),
    useSongStore.subscribe((state, previous) => {
      if (
        state.songs !== previous.songs || state.activeSongId !== previous.activeSongId ||
        state.activeSectionIndex !== previous.activeSectionIndex ||
        state.autoAdvanceEnabled !== previous.autoAdvanceEnabled
      ) scheduleAutosave();
    }),
    useTrackingSettingsStore.subscribe((state, previous) => {
      if (
        state.quality !== previous.quality || state.smoothingAlpha !== previous.smoothingAlpha ||
        state.pinchThreshold !== previous.pinchThreshold ||
        state.pinchReleaseThreshold !== previous.pinchReleaseThreshold ||
        state.mirrorCamera !== previous.mirrorCamera || state.showHandOverlay !== previous.showHandOverlay ||
        state.trackingEngine !== previous.trackingEngine
      ) scheduleAutosave();
    }),
    useMidiLearnStore.subscribe((state, previous) => {
      if (state.mappings !== previous.mappings) scheduleAutosave();
    }),
    useSessionStore.subscribe((state, previous) => {
      if (state.projectName !== previous.projectName) scheduleAutosave();
    }),
  ];

  const flush = () => saveAutosave();
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', flushWhenHidden);

  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    if (autosaveTimer) clearTimeout(autosaveTimer);
    window.removeEventListener('beforeunload', flush);
    document.removeEventListener('visibilitychange', flushWhenHidden);
  };
}

export function downloadSession(session = captureSession()) {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${session.meta.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'kasync-session'}.kasync.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
