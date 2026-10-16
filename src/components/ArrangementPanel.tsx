import { useEffect, useMemo, useState } from 'react';
import { SOUND_PRESETS } from '../audio/presets';
import { downloadSystemReport } from '../diagnostics/systemReport';
import { looperService } from '../looper/recorder';
import {
  DEFAULT_PPQ,
  LOOP_BAR_OPTIONS,
  METER_OPTIONS,
  loopTicks,
  type BeatsPerBar,
  type LoopBars,
} from '../looper/timing';
import { useMidiStore } from '../midi/midiManager';
import { useArrangementStore } from '../store/arrangementState';
import { useLooperStore } from '../store/looperState';
import { useMusicStore } from '../store/musicState';
import { toast } from '../store/toastStore';
import { useTrackingSettingsStore } from '../store/trackingSettings';

interface EventSelection {
  trackId: number;
  eventIndex: number;
}

const panelButton = 'rounded border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[#9aa7c4] transition hover:border-[#00f0ff]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

export function ArrangementPanel() {
  const isOpen = useArrangementStore(state => state.isOpen);
  const setOpen = useArrangementStore(state => state.setOpen);
  const {
    tracks, loopBars, beatsPerBar, isPerformanceRecording, setLoopStructure,
    updateTrackEvent, deleteTrackEvent, duplicateTrackEvent, duplicateTrack,
    consolidateAudibleTracks, setTrackProperty,
  } = useLooperStore();
  const [selection, setSelection] = useState<EventSelection | null>(null);
  const [targetTrackId, setTargetTrackId] = useState(1);
  const [draft, setDraft] = useState({ startBeat: 1, lengthBeats: 1, velocity: 0.8 });
  // Ignore per-frame diagnostics while this panel is hidden.
  const tracking = useTrackingSettingsStore(state => isOpen ? state : null);
  const midi = useMidiStore();

  const armedTrack = tracks.find(track => track.isArmed) ?? tracks[0];
  const selectedTrack = selection ? tracks.find(track => track.id === selection.trackId) : undefined;
  const selectedEvent = selection ? selectedTrack?.events[selection.eventIndex] : undefined;
  const length = loopTicks(DEFAULT_PPQ, loopBars, beatsPerBar);
  const totalBeats = loopBars * beatsPerBar;

  useEffect(() => {
    if (!selectedEvent) return;
    setDraft({
      startBeat: selectedEvent.tick / DEFAULT_PPQ + 1,
      lengthBeats: selectedEvent.durationTicks / DEFAULT_PPQ,
      velocity: selectedEvent.velocity,
    });
  }, [selectedEvent]);

  const beatMarkers = useMemo(
    () => Array.from({ length: totalBeats + 1 }, (_, index) => index),
    [totalBeats],
  );

  if (!isOpen || !tracking) return null;

  const commitEvent = () => {
    if (!selection || !selectedEvent) return;
    updateTrackEvent(selection.trackId, selection.eventIndex, {
      tick: Math.round((Math.max(1, draft.startBeat) - 1) * DEFAULT_PPQ),
      durationTicks: Math.round(Math.max(0.0625, draft.lengthBeats) * DEFAULT_PPQ),
      velocity: draft.velocity,
    });
    setSelection(null);
    toast.success('Event updated.');
  };

  const handleDuplicateTrack = () => {
    if (targetTrackId === armedTrack.id) return;
    const target = tracks.find(track => track.id === targetTrackId);
    if (target?.events.length && !window.confirm(`Replace Track ${targetTrackId + 1} with Track ${armedTrack.id + 1}?`)) return;
    duplicateTrack(armedTrack.id, targetTrackId);
    toast.success(`Track ${armedTrack.id + 1} copied to Track ${targetTrackId + 1}.`);
  };

  const handleConsolidate = () => {
    if (armedTrack.events.length && !window.confirm(`Replace Track ${armedTrack.id + 1} with all audible events?`)) return;
    consolidateAudibleTracks(armedTrack.id);
    toast.success(`Audible event layers consolidated to Track ${armedTrack.id + 1}.`);
  };

  const togglePerformanceCapture = async () => {
    if (isPerformanceRecording) await looperService.stopPerformanceRecording();
    else await looperService.startPerformanceRecording();
  };

  return (
    <div className="absolute inset-0 z-[85] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Arrangement studio">
      <section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#00f0ff]/25 bg-[#080b13]/95 shadow-[0_0_60px_rgba(0,240,255,0.12)]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white">Arrangement Studio</h2>
            <p className="mt-1 text-[9px] uppercase tracking-widest text-[#6E7C9C]">Edit the loop · shape tracks · capture the full performance</p>
          </div>
          <button onClick={() => setOpen(false)} className="h-9 w-9 rounded-full border border-white/10 text-[#9aa7c4] hover:border-white/30 hover:text-white" aria-label="Close arrangement studio">×</button>
        </header>

        <div className="custom-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <label className="text-[9px] uppercase tracking-widest text-[#6E7C9C]">Loop bars
                <select value={loopBars} onChange={event => setLoopStructure(Number(event.target.value) as LoopBars, beatsPerBar)} className="mt-1 block rounded border border-white/10 bg-[#111622] px-3 py-2 text-xs text-white">
                  {LOOP_BAR_OPTIONS.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label className="text-[9px] uppercase tracking-widest text-[#6E7C9C]">Meter
                <select value={beatsPerBar} onChange={event => setLoopStructure(loopBars, Number(event.target.value) as BeatsPerBar)} className="mt-1 block rounded border border-white/10 bg-[#111622] px-3 py-2 text-xs text-white">
                  {METER_OPTIONS.map(value => <option key={value} value={value}>{value}/4</option>)}
                </select>
              </label>
              <div className="ml-auto text-right">
                <div className="text-lg font-black text-[#00f0ff]">{totalBeats}</div>
                <div className="text-[8px] uppercase tracking-widest text-[#6E7C9C]">beats per loop</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-3">
              <div className="min-w-[640px] space-y-2">
                <div className="ml-20 flex h-5 text-[8px] text-[#6E7C9C]">
                  {Array.from({ length: loopBars }, (_, bar) => <span key={bar} className="flex-1">BAR {bar + 1}</span>)}
                </div>
                {tracks.map(track => (
                  <div key={track.id} className="flex items-center gap-3">
                    <button onClick={() => useLooperStore.getState().armTrack(track.id)} className={`w-[68px] shrink-0 rounded px-2 py-3 text-left text-[9px] font-bold uppercase ${track.isArmed ? 'bg-[#9D4EDD]/25 text-[#d9a8ff]' : 'bg-white/5 text-[#6E7C9C]'}`}>
                      Track {track.id + 1}<span className="mt-1 block truncate text-[7px] font-normal">{track.instrument}</span>
                    </button>
                    <div className="relative h-12 flex-1 overflow-hidden rounded border border-white/10 bg-[#0d1220]">
                      {beatMarkers.map(beat => (
                        <i key={beat} className={`absolute inset-y-0 border-l ${beat % beatsPerBar === 0 ? 'border-[#00f0ff]/20' : 'border-white/5'}`} style={{ left: `${(beat / totalBeats) * 100}%` }} />
                      ))}
                      {track.events.map((event, eventIndex) => {
                        const widthTicks = Math.min(event.durationTicks, length - event.tick);
                        return (
                          <button
                            key={`${event.tick}-${eventIndex}`}
                            onClick={() => setSelection({ trackId: track.id, eventIndex })}
                            className={`absolute top-1.5 h-9 overflow-hidden rounded border px-1 text-left text-[8px] font-bold text-white ${selection?.trackId === track.id && selection.eventIndex === eventIndex ? 'border-[#00f0ff] bg-[#00f0ff]/30' : 'border-[#9D4EDD]/50 bg-[#9D4EDD]/30 hover:bg-[#9D4EDD]/45'}`}
                            style={{ left: `${(event.tick / length) * 100}%`, width: `${Math.max(1.4, (widthTicks / length) * 100)}%` }}
                            title={`${event.notes.join(' ')} · beat ${(event.tick / DEFAULT_PPQ + 1).toFixed(2)}`}
                          >
                            <span className="block truncate">{event.notes.join(' ')}</span>
                            <span className="opacity-60">{(event.durationTicks / DEFAULT_PPQ).toFixed(2)}b</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedEvent ? (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#9D4EDD]/30 bg-[#9D4EDD]/5 p-3">
                <div className="mr-2"><div className="text-xs font-bold text-white">Track {selection!.trackId + 1}: {selectedEvent.notes.join(' ')}</div><div className="text-[8px] uppercase tracking-widest text-[#6E7C9C]">Selected event</div></div>
                <label className="text-[8px] uppercase text-[#6E7C9C]">Start beat<input type="number" min="1" max={totalBeats} step="0.25" value={draft.startBeat} onChange={event => setDraft(value => ({ ...value, startBeat: Number(event.target.value) }))} className="mt-1 block w-24 rounded bg-[#111622] px-2 py-2 text-xs text-white" /></label>
                <label className="text-[8px] uppercase text-[#6E7C9C]">Length<input type="number" min="0.0625" max={totalBeats} step="0.25" value={draft.lengthBeats} onChange={event => setDraft(value => ({ ...value, lengthBeats: Number(event.target.value) }))} className="mt-1 block w-24 rounded bg-[#111622] px-2 py-2 text-xs text-white" /></label>
                <label className="text-[8px] uppercase text-[#6E7C9C]">Velocity<input type="number" min="0" max="1" step="0.05" value={draft.velocity} onChange={event => setDraft(value => ({ ...value, velocity: Number(event.target.value) }))} className="mt-1 block w-24 rounded bg-[#111622] px-2 py-2 text-xs text-white" /></label>
                <button onClick={commitEvent} className={panelButton}>Apply</button>
                <button onClick={() => { duplicateTrackEvent(selection!.trackId, selection!.eventIndex); setSelection(null); }} className={panelButton}>Duplicate +1 beat</button>
                <button onClick={() => { deleteTrackEvent(selection!.trackId, selection!.eventIndex); setSelection(null); }} className={`${panelButton} hover:border-red-400/50 hover:text-red-300`}>Delete</button>
              </div>
            ) : <p className="text-center text-[9px] uppercase tracking-widest text-[#46516b]">Select an event block to edit its timing and expression.</p>}
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <h3 className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-[#00f0ff]">Track operations</h3>
              <p className="mb-3 text-[9px] text-[#6E7C9C]">Source / destination operations include undo history.</p>
              <select value={targetTrackId} onChange={event => setTargetTrackId(Number(event.target.value))} className="mb-2 w-full rounded border border-white/10 bg-[#111622] px-3 py-2 text-xs text-white">
                {tracks.filter(track => track.id !== armedTrack.id).map(track => <option key={track.id} value={track.id}>Destination: Track {track.id + 1}</option>)}
              </select>
              <button onClick={handleDuplicateTrack} className={`${panelButton} mb-2 w-full`}>Copy armed track</button>
              <button onClick={handleConsolidate} className={`${panelButton} w-full`}>Consolidate audible → armed</button>
              <p className="mt-2 text-[8px] leading-relaxed text-[#46516b]">Consolidation merges editable note events. Use WAV export or Performance Capture for a rendered audio bounce.</p>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <h3 className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-[#9D4EDD]">Sound presets · Track {armedTrack.id + 1}</h3>
              <div className="space-y-2">
                {SOUND_PRESETS.map(preset => <button key={preset.id} onClick={() => {
                  setTrackProperty(armedTrack.id, 'instrument', preset.instrument);
                  setTrackProperty(armedTrack.id, 'effects', { ...preset.effects });
                  setTrackProperty(armedTrack.id, 'volume', preset.volume);
                  useMusicStore.getState().setMusicState({ currentInstrument: preset.instrument });
                  toast.success(`${preset.name} applied to Track ${armedTrack.id + 1}.`);
                }} className="w-full rounded border border-white/10 bg-black/20 p-2 text-left transition hover:border-[#9D4EDD]/50 hover:bg-[#9D4EDD]/10">
                  <span className="block text-[10px] font-bold text-white">{preset.name}</span><span className="block text-[8px] text-[#6E7C9C]">{preset.description}</span>
                </button>)}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.025] p-3">
              <h3 className="mb-3 text-[9px] font-black uppercase tracking-[0.2em] text-[#00f0ff]">Capture & diagnostics</h3>
              <button onClick={togglePerformanceCapture} className={`mb-3 w-full rounded border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${isPerformanceRecording ? 'animate-pulse border-red-400 bg-red-500/20 text-red-200' : 'border-[#00f0ff]/30 bg-[#00f0ff]/10 text-[#00f0ff] hover:bg-[#00f0ff]/20'}`}>{isPerformanceRecording ? '■ Stop & save capture' : '● Record full performance'}</button>
              <dl className="grid grid-cols-2 gap-2 text-[8px]">
                <div><dt className="text-[#46516b]">TRACKING</dt><dd className="text-[#9aa7c4]">{tracking.backend ?? 'idle'} · {tracking.inferenceLatencyMs?.toFixed(1) ?? '—'} ms</dd></div>
                <div><dt className="text-[#46516b]">MIDI</dt><dd className="text-[#9aa7c4]">{midi.isSupported ? `${midi.inputPorts.length} in / ${midi.outputPorts.length} out` : 'unsupported'}</dd></div>
                <div><dt className="text-[#46516b]">AUDIO</dt><dd className="text-[#9aa7c4]">live context</dd></div>
                <div><dt className="text-[#46516b]">TARGET FPS</dt><dd className="text-[#9aa7c4]">{tracking.targetFps}</dd></div>
              </dl>
              <button onClick={() => { downloadSystemReport(); toast.success('System report downloaded.'); }} className={`${panelButton} mt-3 w-full`}>Download test report</button>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
