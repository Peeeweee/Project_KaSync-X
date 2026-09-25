import { useState, useCallback } from 'react';
import { useSongStore } from '../store/songStore';
import type { Song, SongSection, SongChord } from '../store/songStore';
import { CHROMATIC_NOTES } from '../music/scales';
import { CHORD_QUALITIES } from '../music/chords';

// ─── Constants ────────────────────────────────────────────────────────────────
const SECTION_TEMPLATES = [
  { name: 'Intro',      colorTag: '#00f0ff', icon: '⟩' },
  { name: 'Verse',      colorTag: '#9D4EDD', icon: '✦' },
  { name: 'Pre-Chorus', colorTag: '#7B5EA7', icon: '◈' },
  { name: 'Chorus',     colorTag: '#F9A826', icon: '★' },
  { name: 'Bridge',     colorTag: '#FF4D6D', icon: '⬡' },
  { name: 'Outro',      colorTag: '#4CAF50', icon: '⟨' },
];

const ALL_QUALITIES = [...CHORD_QUALITIES.basic, ...CHORD_QUALITIES.extended];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeBlankChord(): SongChord {
  return { root: 'C', quality: 'maj' };
}

function makeSection(template: typeof SECTION_TEMPLATES[0]): SongSection {
  return {
    id: generateId(),
    name: template.name,
    colorTag: template.colorTag,
    repeatCount: 1,
    chords: [makeBlankChord()],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** A single chord slot row with root + quality pickers and a remove button */
function ChordRow({
  chord,
  index,
  total,
  onChange,
  onRemove,
}: {
  chord: SongChord;
  index: number;
  total: number;
  onChange: (c: SongChord) => void;
  onRemove: () => void;
}) {
  const sel = 'bg-[#0a0b14] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-[var(--color-primary)] appearance-none cursor-pointer transition-colors';

  return (
    <div className="flex items-center gap-2 group">
      <span className="text-[10px] text-[#6E7C9C] w-4 text-center font-mono">{index + 1}</span>

      {/* Root selector */}
      <select
        className={`${sel} w-16`}
        value={chord.root}
        onChange={e => onChange({ ...chord, root: e.target.value })}
      >
        {CHROMATIC_NOTES.map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>

      {/* Quality selector */}
      <select
        className={`${sel} flex-1`}
        value={chord.quality}
        onChange={e => onChange({ ...chord, quality: e.target.value })}
      >
        <optgroup label="Basic">
          {CHORD_QUALITIES.basic.map(q => (
            <option key={q} value={q}>{q}</option>
          ))}
        </optgroup>
        <optgroup label="Extended">
          {CHORD_QUALITIES.extended.map(q => (
            <option key={q} value={q}>{q}</option>
          ))}
        </optgroup>
      </select>

      {/* Bass note (optional) */}
      <select
        className={`${sel} w-16`}
        value={chord.bass ?? '—'}
        onChange={e => onChange({ ...chord, bass: e.target.value === '—' ? undefined : e.target.value })}
        title="Slash bass note (optional)"
      >
        <option value="—">—</option>
        {CHROMATIC_NOTES.map(n => (
          <option key={n} value={n}>/{n}</option>
        ))}
      </select>

      {/* Remove button */}
      <button
        onClick={onRemove}
        disabled={total <= 1}
        className="w-6 h-6 rounded flex items-center justify-center text-[#6E7C9C] hover:text-[#FF4D6D] disabled:opacity-20 transition-colors text-sm"
        title="Remove chord"
      >
        ×
      </button>
    </div>
  );
}

/** A single section editor card */
function SectionCard({
  section,
  onUpdate,
  onRemove,
}: {
  section: SongSection;
  onUpdate: (s: SongSection) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);

  const addChord = () =>
    onUpdate({ ...section, chords: [...section.chords, makeBlankChord()] });

  const updateChord = (i: number, c: SongChord) => {
    const chords = [...section.chords];
    chords[i] = c;
    onUpdate({ ...section, chords });
  };

  const removeChord = (i: number) => {
    if (section.chords.length <= 1) return;
    onUpdate({ ...section, chords: section.chords.filter((_, idx) => idx !== i) });
  };

  const inputCls = 'bg-[#0a0b14] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-[var(--color-primary)] transition-colors w-full';
  const selCls   = 'bg-[#0a0b14] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-[var(--color-primary)] appearance-none cursor-pointer transition-colors';

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${section.colorTag}44`, background: `${section.colorTag}08` }}
    >
      {/* Card Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        style={{ borderBottom: expanded ? `1px solid ${section.colorTag}22` : 'none' }}
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-lg" style={{ color: section.colorTag }}>
          {SECTION_TEMPLATES.find(t => t.name === section.name)?.icon ?? '♪'}
        </span>
        <span className="font-bold text-sm tracking-widest" style={{ color: section.colorTag }}>
          {section.name}
        </span>

        {section.key && (
          <span className="ml-1 text-[9px] px-2 py-0.5 rounded-full border border-[#F9A826] text-[#F9A826]">
            KEY {section.key}
          </span>
        )}

        <span className="ml-1 text-[10px] text-[#6E7C9C]">
          {section.chords.length} chord{section.chords.length !== 1 ? 's' : ''}
        </span>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="text-[#6E7C9C] hover:text-[#FF4D6D] transition-colors text-xs"
          >
            remove
          </button>
          <span className="text-[#6E7C9C] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Card Body */}
      {expanded && (
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* Section name + color */}
          <div className="flex gap-2 items-center">
            <input
              className={`${inputCls} flex-1`}
              placeholder="Section name (e.g. Verse 2)"
              value={section.name}
              onChange={e => onUpdate({ ...section, name: e.target.value })}
            />
            <input
              type="color"
              className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/10"
              value={section.colorTag}
              onChange={e => onUpdate({ ...section, colorTag: e.target.value })}
              title="Section color"
            />
          </div>

          {/* Key change row */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                className={`w-8 h-4 rounded-full transition-colors relative ${section.key ? 'bg-[#F9A826]' : 'bg-white/10'}`}
                onClick={() => onUpdate({ ...section, key: section.key ? undefined : 'G' })}
              >
                <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${section.key ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-[10px] text-[#6E7C9C]">Key Change</span>
            </label>

            {section.key && (
              <select
                className={`${selCls} w-20`}
                value={section.key}
                onChange={e => onUpdate({ ...section, key: e.target.value })}
              >
                {CHROMATIC_NOTES.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            )}

            <div className="ml-auto flex items-center gap-2">
              <label className="text-[10px] text-[#6E7C9C]">Repeat</label>
              <input
                type="number"
                min={1}
                max={16}
                className="bg-[#0a0b14] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none w-12 text-center"
                value={section.repeatCount}
                onChange={e => onUpdate({ ...section, repeatCount: Math.max(1, parseInt(e.target.value) || 1) })}
              />
              <span className="text-[10px] text-[#6E7C9C]">×</span>
            </div>
          </div>

          {/* Chord label row */}
          <div className="flex items-center gap-2 px-0.5">
            <span className="w-4" />
            <span className="text-[9px] text-[#6E7C9C] w-16">ROOT</span>
            <span className="text-[9px] text-[#6E7C9C] flex-1">QUALITY</span>
            <span className="text-[9px] text-[#6E7C9C] w-16">BASS</span>
            <span className="w-6" />
          </div>

          {/* Chord rows */}
          <div className="flex flex-col gap-2">
            {section.chords.map((chord, i) => (
              <ChordRow
                key={i}
                chord={chord}
                index={i}
                total={section.chords.length}
                onChange={c => updateChord(i, c)}
                onRemove={() => removeChord(i)}
              />
            ))}
          </div>

          {/* Add chord */}
          {section.chords.length < 8 && (
            <button
              onClick={addChord}
              className="w-full py-1.5 rounded border border-dashed border-white/15 text-[10px] text-[#6E7C9C] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors tracking-widest uppercase"
            >
              + Add Chord
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section Picker (Step 2) ──────────────────────────────────────────────────
function SectionPicker({ onAdd }: { onAdd: (s: SongSection) => void }) {
  const [customName, setCustomName] = useState('');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[#6E7C9C] tracking-wider">Add a section:</p>
      <div className="flex flex-wrap gap-2">
        {SECTION_TEMPLATES.map(t => (
          <button
            key={t.name}
            onClick={() => onAdd(makeSection(t))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold tracking-widest uppercase transition-all hover:scale-105"
            style={{
              borderColor: `${t.colorTag}66`,
              color: t.colorTag,
              background: `${t.colorTag}11`,
            }}
          >
            <span>{t.icon}</span> {t.name}
          </button>
        ))}
      </div>

      {/* Custom section */}
      <div className="flex gap-2 mt-1">
        <input
          className="flex-1 bg-[#0a0b14] border border-white/10 rounded px-3 py-1.5 text-xs text-white outline-none focus:border-[var(--color-primary)] transition-colors placeholder-white/20"
          placeholder="Custom section name…"
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && customName.trim()) {
              onAdd(makeSection({ name: customName.trim(), colorTag: '#9D4EDD', icon: '♪' }));
              setCustomName('');
            }
          }}
        />
        <button
          disabled={!customName.trim()}
          onClick={() => {
            if (!customName.trim()) return;
            onAdd(makeSection({ name: customName.trim(), colorTag: '#9D4EDD', icon: '♪' }));
            setCustomName('');
          }}
          className="px-3 py-1.5 rounded border border-[var(--color-primary)]/40 text-[10px] text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-30 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function SongPanel() {
  const { songs, activeSongId, isSongPanelOpen, toggleSongPanel, saveSong, deleteSong, setActiveSong } = useSongStore();

  // Draft state for the editor
  const [draft, setDraft] = useState<Song | null>(null);
  const [activeTab, setActiveTab] = useState<'library' | 'editor'>('library');

  const startNew = useCallback(() => {
    setDraft({
      id: generateId(),
      name: '',
      artist: '',
      defaultKey: 'C',
      defaultBpm: 120,
      sections: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setActiveTab('editor');
  }, []);

  const startEdit = useCallback((song: Song) => {
    setDraft(JSON.parse(JSON.stringify(song))); // deep clone
    setActiveTab('editor');
  }, []);

  const addSection = useCallback((s: SongSection) => {
    if (!draft) return;
    setDraft(d => d ? { ...d, sections: [...d.sections, s] } : d);
  }, [draft]);

  const updateSection = useCallback((i: number, s: SongSection) => {
    setDraft(d => {
      if (!d) return d;
      const sections = [...d.sections];
      sections[i] = s;
      return { ...d, sections };
    });
  }, []);

  const removeSection = useCallback((i: number) => {
    setDraft(d => d ? { ...d, sections: d.sections.filter((_, idx) => idx !== i) } : d);
  }, []);

  const moveSection = useCallback((from: number, dir: 1 | -1) => {
    const to = from + dir;
    setDraft(d => {
      if (!d || to < 0 || to >= d.sections.length) return d;
      const sections = [...d.sections];
      [sections[from], sections[to]] = [sections[to], sections[from]];
      return { ...d, sections };
    });
  }, []);

  const handleSave = useCallback(() => {
    if (!draft || !draft.name.trim()) return;
    saveSong(draft);
    setActiveSong(draft.id);
    setActiveTab('library');
    setDraft(null);
  }, [draft, saveSong, setActiveSong]);

  if (!isSongPanelOpen) return null;

  const inputCls = 'w-full bg-[#0a0b14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-colors placeholder-white/20';
  const selCls   = 'bg-[#0a0b14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary)] appearance-none cursor-pointer transition-colors';

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={toggleSongPanel}
      />

      {/* Panel */}
      <div
        className="absolute z-50 right-0 top-0 h-full flex flex-col"
        style={{
          width: '420px',
          background: 'rgba(6, 7, 16, 0.97)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid rgba(0, 240, 255, 0.12)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <h2 className="text-sm font-bold tracking-[0.3em] text-white uppercase">
              ♪ Song Architect
            </h2>
            <p className="text-[10px] text-[#6E7C9C] mt-0.5 tracking-wider">
              Build your chord roadmap
            </p>
          </div>
          <button
            onClick={toggleSongPanel}
            className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-[#6E7C9C] hover:text-white hover:border-white/30 transition-all text-sm"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {(['library', 'editor'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                if (tab === 'editor' && !draft) startNew();
                else setActiveTab(tab);
              }}
              className={`flex-1 py-3 text-[10px] font-bold tracking-[0.25em] uppercase transition-all ${
                activeTab === tab
                  ? 'text-[var(--color-primary)] border-b-2 border-[var(--color-primary)]'
                  : 'text-[#6E7C9C] hover:text-white'
              }`}
            >
              {tab === 'library' ? '📚 Library' : '✏️ Editor'}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* ── LIBRARY TAB ──────────────────────────────────────────────── */}
          {activeTab === 'library' && (
            <>
              <button
                onClick={startNew}
                className="w-full py-3 rounded-xl border border-dashed border-[var(--color-primary)]/40 text-[11px] font-bold tracking-widest text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-all uppercase"
              >
                + New Song
              </button>

              {songs.length === 0 && (
                <div className="text-center py-10 text-[#6E7C9C] text-xs">
                  <p className="text-2xl mb-3">🎵</p>
                  <p>No songs yet. Create your first one!</p>
                </div>
              )}

              {songs.map(song => {
                const isActive = song.id === activeSongId;
                return (
                  <div
                    key={song.id}
                    className="rounded-xl border p-4 transition-all"
                    style={{
                      borderColor: isActive ? 'rgba(0,240,255,0.4)' : 'rgba(255,255,255,0.07)',
                      background: isActive ? 'rgba(0,240,255,0.05)' : 'rgba(255,255,255,0.02)',
                      boxShadow: isActive ? '0 0 20px rgba(0,240,255,0.08)' : 'none',
                    }}
                  >
                    {/* Song header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-bold text-white">{song.name || 'Untitled'}</p>
                        {song.artist && (
                          <p className="text-[10px] text-[#6E7C9C] mt-0.5">{song.artist}</p>
                        )}
                      </div>
                      <span className="text-[9px] text-[#6E7C9C] px-2 py-1 rounded border border-white/10">
                        {song.defaultKey}
                      </span>
                    </div>

                    {/* Section color strip */}
                    <div className="flex gap-1 mb-3">
                      {song.sections.map(sec => (
                        <div
                          key={sec.id}
                          title={sec.name}
                          className="flex-1 h-1.5 rounded-full"
                          style={{ background: sec.colorTag, opacity: 0.8 }}
                        />
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => { setActiveSong(song.id); toggleSongPanel(); }}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold tracking-wider transition-all ${
                          isActive
                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)] border border-[var(--color-primary)]/40'
                            : 'border border-white/10 text-[#6E7C9C] hover:text-white hover:border-white/30'
                        }`}
                      >
                        {isActive ? '✓ Active' : 'Load'}
                      </button>
                      <button
                        onClick={() => startEdit(song)}
                        className="px-3 py-1.5 rounded-lg text-[10px] border border-white/10 text-[#6E7C9C] hover:text-white hover:border-white/30 transition-all"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete "${song.name}"?`)) deleteSong(song.id);
                        }}
                        className="px-3 py-1.5 rounded-lg text-[10px] border border-white/10 text-[#6E7C9C] hover:text-[#FF4D6D] hover:border-[#FF4D6D]/40 transition-all"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ── EDITOR TAB ──────────────────────────────────────────────── */}
          {activeTab === 'editor' && draft && (
            <>
              {/* Song Info */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">Song Title *</label>
                <input
                  className={inputCls}
                  placeholder="e.g. Let Her Go"
                  value={draft.name}
                  onChange={e => setDraft(d => d ? { ...d, name: e.target.value } : d)}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">Artist</label>
                  <input
                    className={inputCls}
                    placeholder="Artist name"
                    value={draft.artist ?? ''}
                    onChange={e => setDraft(d => d ? { ...d, artist: e.target.value } : d)}
                  />
                </div>
                <div className="flex flex-col gap-2 w-24">
                  <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">BPM</label>
                  <input
                    type="number"
                    min={40} max={300}
                    className={inputCls}
                    value={draft.defaultBpm ?? 120}
                    onChange={e => setDraft(d => d ? { ...d, defaultBpm: parseInt(e.target.value) || 120 } : d)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex flex-col gap-2 flex-1">
                  <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">Default Key</label>
                  <select
                    className={`${selCls} w-full`}
                    value={draft.defaultKey}
                    onChange={e => setDraft(d => d ? { ...d, defaultKey: e.target.value } : d)}
                  >
                    {CHROMATIC_NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/05 my-1" />

              {/* Sections */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">
                    Sections ({draft.sections.length})
                  </label>
                </div>

                {draft.sections.length === 0 && (
                  <div className="text-center py-6 text-[#6E7C9C] text-[11px] border border-dashed border-white/10 rounded-xl">
                    <p className="text-xl mb-2">📋</p>
                    <p>No sections yet. Add one below.</p>
                  </div>
                )}

                {draft.sections.map((sec, i) => (
                  <div key={sec.id} className="mb-3">
                    <div className="flex items-center gap-1 mb-1">
                      <button
                        onClick={() => moveSection(i, -1)}
                        disabled={i === 0}
                        className="text-[#6E7C9C] hover:text-white disabled:opacity-20 text-xs px-1"
                        title="Move up"
                      >▲</button>
                      <button
                        onClick={() => moveSection(i, 1)}
                        disabled={i === draft.sections.length - 1}
                        className="text-[#6E7C9C] hover:text-white disabled:opacity-20 text-xs px-1"
                        title="Move down"
                      >▼</button>
                    </div>
                    <SectionCard
                      section={sec}
                      onUpdate={s => updateSection(i, s)}
                      onRemove={() => removeSection(i)}
                    />
                  </div>
                ))}

                {/* Section picker */}
                <div
                  className="mt-2 p-3 rounded-xl border border-dashed border-white/10"
                  style={{ background: 'rgba(255,255,255,0.02)' }}
                >
                  <SectionPicker onAdd={addSection} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer actions (editor only) */}
        {activeTab === 'editor' && draft && (
          <div
            className="px-5 py-4 flex gap-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <button
              onClick={() => { setDraft(null); setActiveTab('library'); }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-[11px] text-[#6E7C9C] hover:text-white hover:border-white/30 transition-all tracking-wider"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!draft.name.trim() || draft.sections.length === 0}
              className="flex-2 flex-grow-[2] py-2.5 rounded-xl text-[11px] font-bold tracking-[0.2em] uppercase transition-all disabled:opacity-30"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                color: 'white',
                boxShadow: '0 0 20px rgba(0,240,255,0.2)',
              }}
            >
              Save Song
            </button>
          </div>
        )}
      </div>
    </>
  );
}
