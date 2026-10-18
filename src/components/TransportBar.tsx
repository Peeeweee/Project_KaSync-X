import { useState, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMusicStore } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { useSongStore } from '../store/songStore';
import { CHROMATIC_NOTES } from '../music/scales';
import { WakandanSelect } from './WakandanSelect';
import { looperService } from '../looper/recorder';
import { PerformanceSelection } from './PerformanceSelection';

/** Inline Song navigation widget for TransportBar in Song Mode */
function SongTransportControls() {
  const songs = useSongStore(s => s.songs);
  const activeSongId = useSongStore(s => s.activeSongId);
  const activeSectionIndex = useSongStore(s => s.activeSectionIndex);
  const nextSection = useSongStore(s => s.nextSection);
  const prevSection = useSongStore(s => s.prevSection);
  const activeSectionRepeat = useSongStore(s => s.activeSectionRepeat);
  const autoAdvanceEnabled = useSongStore(s => s.autoAdvanceEnabled);
  const setAutoAdvance = useSongStore(s => s.setAutoAdvance);

  const activeSong = songs.find(s => s.id === activeSongId);
  const activeSection = activeSong?.sections[activeSectionIndex];
  const total = activeSong?.sections.length ?? 0;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={prevSection}
        aria-label="Previous song section"
        disabled={activeSectionIndex === 0}
        className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-xs text-[#6E7C9C] hover:text-white hover:border-white/30 disabled:opacity-20 transition-all"
      >
        ‹
      </button>
      <div className="flex flex-col items-center min-w-[80px]">
        <span
          className="text-[10px] font-bold tracking-widest"
          style={{ color: activeSection?.colorTag ?? '#9D4EDD' }}
        >
          {activeSection?.name ?? '—'}
        </span>
        <span className="text-[8px] text-[#6E7C9C] tracking-widest font-mono">
          {activeSectionIndex + 1}/{total} · LOOP {activeSectionRepeat}/{activeSection?.repeatCount ?? 1}
        </span>
      </div>
      <button
        onClick={nextSection}
        aria-label="Next song section"
        disabled={activeSectionIndex >= total - 1}
        className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-xs text-[#6E7C9C] hover:text-white hover:border-white/30 disabled:opacity-20 transition-all"
      >
        ›
      </button>
      <button
        onClick={() => setAutoAdvance(!autoAdvanceEnabled)}
        aria-pressed={autoAdvanceEnabled}
        className={`h-7 px-2 rounded-full border text-[8px] tracking-wider transition-all ${
          autoAdvanceEnabled
            ? 'border-[#00f0ff]/40 bg-[#00f0ff]/10 text-[#00f0ff]'
            : 'border-white/10 text-[#6E7C9C]'
        }`}
        title="Advance sections after their configured repeats"
      >
        AUTO
      </button>
      <button
        onClick={() => useSongStore.getState().toggleSongPanel()}
        aria-label="Open Song Architect"
        className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-[10px] text-[#6E7C9C] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 transition-all"
        title="Song Architect"
      >
        ♪
      </button>
    </div>
  );
}

export function TransportBar() {
  const { mode, showExtendedQualities, currentKey, snapToScale, currentScale, setMusicState } = useMusicStore(useShallow(s => ({
    mode: s.mode, showExtendedQualities: s.showExtendedQualities, currentKey: s.currentKey,
    snapToScale: s.snapToScale, currentScale: s.currentScale, setMusicState: s.setMusicState,
  })));
  const {
    isPlaying, isGlobalRecording, isCountingIn, quantize, bpm, metronomeEnabled,
    countInBars, overdubEnabled, undoHistory, redoHistory, setTransportState,
    tracks, setTrackProperty, undoTrack, redoTrack
  } = useLooperStore(useShallow(s => ({
    isPlaying: s.isPlaying, isGlobalRecording: s.isGlobalRecording, isCountingIn: s.isCountingIn,
    quantize: s.quantize, bpm: s.bpm, metronomeEnabled: s.metronomeEnabled, countInBars: s.countInBars,
    overdubEnabled: s.overdubEnabled, undoHistory: s.undoHistory, redoHistory: s.redoHistory,
    setTransportState: s.setTransportState, tracks: s.tracks, setTrackProperty: s.setTrackProperty,
    undoTrack: s.undoTrack, redoTrack: s.redoTrack,
  })));
  const [panel, setPanel] = useState<'setup' | 'effects' | null>(null);

  const armedTrack = useMemo(() => tracks.find(t => t.isArmed) || tracks[0], [tracks]);
  const effectCount = Object.values(armedTrack.effects).filter(Boolean).length;
  const canUndo = (undoHistory[armedTrack.id]?.length ?? 0) > 0;
  const canRedo = (redoHistory[armedTrack.id]?.length ?? 0) > 0;

  const toggleEffect = (eff: keyof typeof armedTrack.effects) => {
    setTrackProperty(armedTrack.id, 'effects', { ...armedTrack.effects, [eff]: !armedTrack.effects[eff] });
  };

  const closePanel = (container: HTMLElement | null) => {
    container?.querySelector<HTMLButtonElement>('.kasync-panel-buttons [aria-expanded="true"]')?.focus();
    setPanel(null);
  };

  const hudLabelClass = "text-[8px] text-[#00f0ff] uppercase tracking-widest font-light mb-1 opacity-60";
  const hudValueClass = "bg-transparent font-medium text-sm tracking-wider outline-none text-center appearance-none cursor-pointer hover:text-white transition-colors duration-200";

  return (
    <section className="kasync-transport kasync-performance-dock" aria-label="Transport and performance controls"
      onKeyDown={event => {
        if (event.key === 'Escape' && panel) {
          event.stopPropagation(); closePanel(event.currentTarget);
        }
      }}>
      {panel && <div className="kasync-control-panel" id="performance-control-panel" role="region" aria-label={panel === 'setup' ? 'Performance setup' : 'Track effects'}>
        <div className="kasync-control-panel-heading"><strong>{panel === 'setup' ? 'Performance setup' : 'Track ' + (armedTrack.id + 1) + ' effects'}</strong>
          <button aria-label="Close control panel" onClick={event => closePanel(event.currentTarget.closest('section'))}>Close ×</button>
        </div>
        {panel === 'setup' ? <>
        <div className="kasync-setup-fields">
          <div className="flex flex-col items-center">
            <span className={hudLabelClass}>Quantize</span>
            <button
              aria-label="Quantize to sixteenth notes" aria-pressed={quantize}
              onClick={() => setTransportState({ quantize: !quantize })}
              className={`${hudValueClass} w-10 ${quantize ? 'text-[#9D4EDD]' : 'text-[#6E7C9C]'}`}
            >
              {quantize ? '16N' : 'OFF'}
            </button>
          </div>


          {mode !== 'Song' && (
            <>
              <div className="flex flex-col items-center">
                <span className={hudLabelClass}>Root</span>
                <WakandanSelect
                  aria-label="Key" value={currentKey}
                  onChange={(e) => setMusicState({ currentKey: e.target.value })}
                  className="text-[12px] font-bold"
                  color="#00f0ff"
                >
                  {CHROMATIC_NOTES.map(n => <option key={n} value={n} className="bg-[#0a0b10]">{n}</option>)}
                </WakandanSelect>
              </div>

              <div className="flex flex-col items-center">
                <span className={hudLabelClass}>Scale</span>
                <WakandanSelect
                  aria-label="Scale" value={currentScale}
                  onChange={(e) => setMusicState({ currentScale: e.target.value })}
                  className="text-[12px] font-bold"
                  color="#9D4EDD"
                >
                  <option value="Major" className="bg-[#0a0b10]">Major</option>
                  <option value="Minor" className="bg-[#0a0b10]">Minor</option>
                  <option value="PentatonicMajor" className="bg-[#0a0b10]">Pentatonic</option>
                  <option value="Blues" className="bg-[#0a0b10]">Blues</option>
                </WakandanSelect>
              </div>

              <div className="flex flex-col items-center">
                <span className={hudLabelClass}>Snap</span>
                <button
                  aria-label="Snap to scale" aria-pressed={snapToScale}
                  onClick={() => setMusicState({ snapToScale: !snapToScale })}
                  className={`${hudValueClass} w-10 ${snapToScale ? 'text-[#00f0ff]' : 'text-[#6E7C9C]'}`}
                >
                  {snapToScale ? 'ON' : 'OFF'}
                </button>
              </div>
            </>
          )}

          {mode === 'Chord' && (
            <div className="flex flex-col items-center">
              <span className={hudLabelClass}>Voicing</span>
              <button
                aria-label="Extended voicings" aria-pressed={showExtendedQualities}
                onClick={() => setMusicState({ showExtendedQualities: !showExtendedQualities })}
                className={`${hudValueClass} ${showExtendedQualities ? 'text-[#00f0ff]' : 'text-[#6E7C9C]'}`}
              >
                {showExtendedQualities ? 'EXT' : 'BASE'}
              </button>
            </div>
          )}

        </div>
        <div className="kasync-recording-options"><span>Recording</span>
<div className="kasync-transport-tools pointer-events-auto mb-2 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/65 px-3 py-1.5 font-mono text-[8px] uppercase tracking-wider backdrop-blur-xl">
        <button
          onClick={() => setTransportState({ metronomeEnabled: !metronomeEnabled })}
          aria-pressed={metronomeEnabled}
          className={`rounded-full px-2.5 py-1 transition-colors ${metronomeEnabled ? 'bg-[#00f0ff]/15 text-[#00f0ff]' : 'text-[#6E7C9C] hover:text-white'}`}
        >
          Met
        </button>
        <button
          onClick={() => setTransportState({ countInBars: countInBars === 0 ? 1 : countInBars === 1 ? 2 : 0 })}
          className={`rounded-full px-2.5 py-1 transition-colors ${countInBars > 0 ? 'bg-[#9D4EDD]/15 text-[#c99cff]' : 'text-[#6E7C9C] hover:text-white'}`}
          title="Count-in before recording"
        >
          Count {countInBars === 0 ? 'Off' : `${countInBars} Bar${countInBars === 2 ? 's' : ''}`}
        </button>
        <button
          onClick={() => setTransportState({ overdubEnabled: !overdubEnabled })}
          aria-pressed={overdubEnabled}
          className={`rounded-full px-2.5 py-1 transition-colors ${overdubEnabled ? 'bg-[#9D4EDD]/15 text-[#c99cff]' : 'text-[#F9A826]'}`}
          title={overdubEnabled ? 'Layer notes over the current loop' : 'Replace the armed track on the next take'}
        >
          {overdubEnabled ? 'Overdub' : 'Replace'}
        </button>
        <span className="mx-1 h-3 w-px bg-white/10" />
        <button disabled={!canUndo || isGlobalRecording} onClick={() => undoTrack(armedTrack.id)} className="px-1.5 py-1 text-[#6E7C9C] hover:text-white disabled:opacity-20">Undo</button>
        <button disabled={!canRedo || isGlobalRecording} onClick={() => redoTrack(armedTrack.id)} className="px-1.5 py-1 text-[#6E7C9C] hover:text-white disabled:opacity-20">Redo</button>
      </div>
        </div>
        </> : <div className="kasync-effect-options">
          {(Object.keys(armedTrack.effects) as Array<keyof typeof armedTrack.effects>).map(eff => <button key={eff}
            aria-pressed={armedTrack.effects[eff]} onClick={() => toggleEffect(eff)}>{eff}</button>)}
        </div>}
      </div>}
      <PerformanceSelection />
      <div className="kasync-primary-controls">
        <div className="kasync-playback">
          <button
            aria-label={isPlaying ? 'Stop playback' : 'Play'}
            aria-pressed={isPlaying}
            onClick={() => setTransportState({ isPlaying: !isPlaying })}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-all ${
              isPlaying
                ? 'bg-[#00f0ff]/10 border border-[#00f0ff]/60 shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                : 'bg-black/40 border border-white/10 hover:border-[#00f0ff]/40'
            }`}
          >
            <span className={`text-lg ml-1 ${isPlaying ? 'text-[#00f0ff]' : 'text-[#6E7C9C]'}`}>
              {isPlaying ? '■' : '▶'}
            </span>
          </button>

          <button
            aria-label={isCountingIn ? 'Cancel count-in' : isGlobalRecording ? 'Stop recording' : 'Record'}
            onClick={() => looperService.toggleRecording()}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-all ${
              isGlobalRecording || isCountingIn
                ? 'bg-[#9D4EDD]/10 border border-[#9D4EDD]/60 shadow-[0_0_15px_rgba(157,78,221,0.4)]'
                : 'bg-black/40 border border-white/10 hover:border-[#9D4EDD]/40'
            }`}
          >
            <span className={`text-sm ${isGlobalRecording || isCountingIn ? 'text-[#9D4EDD]' : 'text-[#6E7C9C]'}`}>
              {isCountingIn ? countInBars : '●'}
            </span>
          </button>
        </div>


        <div className="kasync-primary-settings">
          <div className="flex flex-col items-center">
            <span className={hudLabelClass}>BPM</span>
            <input
              aria-label="Tempo" type="number" value={bpm} min={30} max={300}
              onChange={(e) => setTransportState({ bpm: Math.max(30, Math.min(300, parseInt(e.target.value) || 120)) })}
              className={`${hudValueClass} w-10 text-[#00f0ff]`}
            />
          </div>

          <div className="flex flex-col items-center mt-1">
            <span className={hudLabelClass}>Mode</span>
            <WakandanSelect
              aria-label="Performance mode" value={mode}
              onChange={(e) => setMusicState({ mode: e.target.value as 'Melody' | 'Chord' | 'Song' })}
              className="text-[12px] font-bold"
              color="#9D4EDD"
            >
              <option value="Melody" className="bg-[#0a0b10]">Melody</option>
              <option value="Chord" className="bg-[#0a0b10]">Chord</option>
              <option value="Song" className="bg-[#0a0b10]">Song</option>
            </WakandanSelect>
          </div>


        </div>
        <div className="kasync-panel-buttons">
          <button aria-expanded={panel === 'setup'} aria-controls={panel === 'setup' ? 'performance-control-panel' : undefined}
            onClick={() => setPanel(panel === 'setup' ? null : 'setup')}>Setup</button>
          <button aria-expanded={panel === 'effects'} aria-controls={panel === 'effects' ? 'performance-control-panel' : undefined}
            onClick={() => setPanel(panel === 'effects' ? null : 'effects')}>FX <span>{effectCount || 'Off'}</span></button>
        </div>
      </div>
      {mode === 'Song' && <div className="kasync-song-navigation"><SongTransportControls /></div>}
    </section>
  );
}
