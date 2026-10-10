import { useState } from 'react';
import type { Song, SongSection } from '../store/songStore';
import { CHROMATIC_NOTES } from '../music/scales';
import { CHORD_QUALITIES } from '../music/chords';

// Basic parser for plain text chords
// Format expected:
// [Verse 1]
// C G Am F
// [Chorus]
// F G C Am
function parseSongText(title: string, artist: string, text: string): Song {
  const song: Song = {
    id: Math.random().toString(36).slice(2, 10),
    name: title || 'Imported Song',
    artist: artist || '',
    defaultKey: 'C',
    defaultBpm: 120,
    sections: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let currentSection: SongSection | null = null;

  const flushSection = () => {
    if (currentSection) {
      if (currentSection.chords.length === 0) {
        currentSection.chords.push({ root: 'C', quality: 'maj' });
      }
      song.sections.push(currentSection);
      currentSection = null;
    }
  };

  const isValidRoot = (root: string) => CHROMATIC_NOTES.includes(root);
  const basicQualities = [...CHORD_QUALITIES.basic, ...CHORD_QUALITIES.extended];

  for (const line of lines) {
    // Detect section headers like [Chorus] or Verse:
    const headerMatch = line.match(/^\[?(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus)[\]:]?\s*(.*)$/i) || line.match(/^\[(.*)\]$/);
    
    if (headerMatch) {
      flushSection();
      const name = headerMatch[1] + (headerMatch[2] ? ' ' + headerMatch[2] : '');
      const colorTag = name.toLowerCase().includes('chorus') ? '#F9A826' :
                       name.toLowerCase().includes('verse') ? '#9D4EDD' :
                       name.toLowerCase().includes('bridge') ? '#FF4D6D' : '#00f0ff';
      currentSection = {
        id: Math.random().toString(36).slice(2, 10),
        name: name,
        colorTag,
        repeatCount: 1,
        chords: []
      };
      continue;
    }

    if (!currentSection) {
      // Default section if chords appear before any header
      currentSection = {
        id: Math.random().toString(36).slice(2, 10),
        name: 'Intro',
        colorTag: '#00f0ff',
        repeatCount: 1,
        chords: []
      };
    }

    // Try to parse chords from the line. E.g., "Cmaj7 G/B Am Fm"
    // We split by spaces
    const tokens = line.split(/\s+/);
    for (const token of tokens) {
      // Very basic regex to extract root, quality, bass
      // Matches A-G with optional #/b, then quality string, then optional /Bass
      const chordMatch = token.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
      if (chordMatch) {
        let root = chordMatch[1];
        let qual = chordMatch[2].toLowerCase();
        let bass = chordMatch[3];

        // Normalize accidentals
        if (root === 'Db') root = 'C#';
        if (root === 'Eb') root = 'D#';
        if (root === 'Gb') root = 'F#';
        if (root === 'Ab') root = 'G#';
        if (root === 'Bb') root = 'A#';
        
        if (bass) {
          if (bass === 'Db') bass = 'C#';
          if (bass === 'Eb') bass = 'D#';
          if (bass === 'Gb') bass = 'F#';
          if (bass === 'Ab') bass = 'G#';
          if (bass === 'Bb') bass = 'A#';
        }

        if (isValidRoot(root)) {
          // Normalize common qualities
          if (qual === '' || qual === 'm' || qual === 'min' || qual === '-') qual = qual === '' ? 'maj' : 'min';
          else if (qual === '7') qual = 'dom7';
          else if (qual === 'm7' || qual === 'min7') qual = 'min7';
          else if (qual === 'maj7' || qual === 'M7') qual = 'maj7';
          else if (qual === 'dim') qual = 'dim';
          else if (qual === 'aug') qual = 'aug';
          else if (qual === 'sus4') qual = 'sus4';
          else if (qual === 'sus2') qual = 'sus2';

          if (!basicQualities.includes(qual)) qual = 'maj'; // fallback

          currentSection.chords.push({ root, quality: qual, bass: isValidRoot(bass) ? bass : undefined });
        }
      }
    }
    
    // If line had no chords, we just ignore it (it might be lyrics)
  }

  flushSection();

  if (song.sections.length === 0) {
    // If no sections parsed, create a default one
    song.sections.push({
      id: Math.random().toString(36).slice(2, 10),
      name: 'Part 1',
      colorTag: '#9D4EDD',
      repeatCount: 1,
      chords: [{ root: 'C', quality: 'maj' }]
    });
  }

  return song;
}

export function SongWizard({ onImport, onCancel }: { onImport: (song: Song) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [text, setText] = useState('');

  const handleParse = () => {
    const song = parseSongText(title, artist, text);
    onImport(song);
  };

  const inputCls = 'w-full bg-[#0a0b14] border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[var(--color-primary)] transition-colors placeholder-white/20';

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2">
        <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">Song Title</label>
        <input className={inputCls} placeholder="e.g. Shape of You" value={title} onChange={e => setTitle(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">Artist (Optional)</label>
        <input className={inputCls} placeholder="e.g. Ed Sheeran" value={artist} onChange={e => setArtist(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <label className="text-[9px] text-[#6E7C9C] tracking-widest uppercase">Paste Chords (with section headers like [Chorus])</label>
        <textarea
          className={`${inputCls} flex-1 resize-none font-mono text-xs`}
          style={{ minHeight: '180px' }}
          placeholder={"[Verse]\nAm F C G\n\n[Chorus]\nF G C Am\n"}
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <p className="text-[10px] text-[#6E7C9C] italic mt-1">
          Tip: Lyrics are automatically ignored. Only valid chords (e.g., C, Am, G/B, Fmaj7) are extracted.
        </p>
      </div>

      <div className="flex gap-3 mt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-lg border border-white/10 text-[10px] font-bold tracking-widest text-[#6E7C9C] hover:text-white transition-all uppercase"
        >
          Cancel
        </button>
        <button
          onClick={handleParse}
          disabled={!text.trim()}
          className="flex-1 py-3 rounded-lg border border-[var(--color-primary)]/40 text-[10px] font-bold tracking-widest text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 disabled:opacity-30 transition-all uppercase"
        >
          Generate Song
        </button>
      </div>
    </div>
  );
}
