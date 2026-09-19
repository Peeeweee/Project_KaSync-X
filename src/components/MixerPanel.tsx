import { useState } from 'react';
import { useLooperStore } from '../store/looperState';
import type { InstrumentType } from '../store/musicState';
import { exportMIDI } from '../looper/midiExport';
import { exportAudioWav } from '../looper/audioExport';
import { WakandanSelect } from './WakandanSelect';

const INSTRUMENTS: InstrumentType[] = ['Subtractive', 'FM', 'Electric Piano', 'Pad'];

export function MixerPanel() {
  const { tracks, setTrackProperty, armTrack, isGlobalRecording, bpm } = useLooperStore();
  const [isExportingWav, setIsExportingWav] = useState(false);

  const handleExportMidi = () => {
    exportMIDI(tracks, bpm);
  };

  const handleExportWav = async () => {
    setIsExportingWav(true);
    // Allow React state to update UI before heavy audio rendering starts
    setTimeout(async () => {
      await exportAudioWav(tracks, bpm);
      setIsExportingWav(false);
    }, 50);
  };

  return (
    <div className="absolute top-[110px] left-8 z-40 flex flex-col gap-2 pointer-events-none w-56">
      
      {/* Sleek Export Header */}
      <div className="pointer-events-auto flex items-center justify-between bg-black/80 backdrop-blur-3xl border-b-2 border-t border-l border-r border-t-transparent border-l-transparent border-r-transparent border-b-[var(--color-primary-glow)] px-3 py-1.5 shadow-[0_5px_15px_rgba(157,78,221,0.15)] rounded-t-lg">
        <span className="text-[9px] text-[var(--color-metal-light)] font-bold uppercase tracking-widest">Master <span className="text-[var(--color-primary-glow)]">Out</span></span>
        <div className="flex gap-1.5">
          <button
            onClick={handleExportMidi}
            className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest rounded bg-[var(--color-metal)] text-[var(--color-metal-light)] hover:text-white transition-colors"
          >
            MIDI
          </button>
          <button
            onClick={handleExportWav}
            disabled={isExportingWav}
            className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest rounded transition-colors flex items-center justify-center min-w-[36px] ${
              isExportingWav 
                ? 'bg-[var(--color-highlight)] text-black cursor-wait' 
                : 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-glow)]'
            }`}
          >
            {isExportingWav ? (
              <div className="w-2 h-2 border border-black border-t-transparent rounded-full animate-spin"></div>
            ) : (
              'WAV'
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-280px)] pr-1 custom-scrollbar">
        {tracks.map((track) => (
          <div 
            key={track.id} 
            className={`pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-xl border-l-2 border-t border-r border-b border-t-[var(--color-metal-dark)] border-r-[var(--color-metal-dark)] border-b-[var(--color-metal-dark)] rounded-r-md px-2 py-1 shadow-lg transition-all hover:bg-black/80 group ${track.isArmed ? 'border-l-[var(--color-primary-glow)] bg-black/80' : 'border-l-[var(--color-metal-light)]'}`}
          >
          {/* Track Number & Arm */}
          <button
            aria-label={`Arm Track ${track.id + 1}`}
            aria-pressed={track.isArmed}
            onClick={() => armTrack(track.id)}
            className={`w-5 h-5 shrink-0 rounded flex items-center justify-center font-bold text-[9px] transition-all ${
              track.isArmed 
                ? isGlobalRecording 
                  ? 'bg-[var(--color-highlight)] text-black shadow-[0_0_10px_var(--color-highlight)]' 
                  : 'bg-[var(--color-primary)] text-white shadow-[0_0_8px_var(--color-primary-glow)]'
                : 'bg-transparent border border-[var(--color-metal)] text-[var(--color-metal-light)] group-hover:text-white'
            }`}
          >
            {track.id + 1}
          </button>

          {/* Instrument Selector */}
          <WakandanSelect 
            aria-label={`Select Instrument for Track ${track.id + 1}`}
            value={track.instrument}
            onChange={(e) => setTrackProperty(track.id, 'instrument', e.target.value as InstrumentType)}
            className="w-16 flex-1 text-[11px] font-bold"
            color="var(--color-primary-glow)"
          >
            {INSTRUMENTS.map(i => <option key={i} value={i} className="bg-[var(--color-bg)] tracking-normal">{i}</option>)}
          </WakandanSelect>

          {/* Mute / Solo */}
          <div className="flex gap-1 shrink-0 ml-auto">
            <button
              aria-label={`Mute Track ${track.id + 1}`}
              aria-pressed={track.isMuted}
              onClick={() => setTrackProperty(track.id, 'isMuted', !track.isMuted)}
              className={`w-4 h-4 rounded-sm text-[8px] font-bold flex items-center justify-center transition-all ${track.isMuted ? 'bg-[var(--color-danger)] text-white shadow-[0_0_5px_var(--color-danger)]' : 'bg-[var(--color-metal)] text-[var(--color-bg)] opacity-50 hover:opacity-100'}`}
            >
              M
            </button>
            <button
              aria-label={`Solo Track ${track.id + 1}`}
              aria-pressed={track.isSoloed}
              onClick={() => setTrackProperty(track.id, 'isSoloed', !track.isSoloed)}
              className={`w-4 h-4 rounded-sm text-[8px] font-bold flex items-center justify-center transition-all ${track.isSoloed ? 'bg-[var(--color-highlight)] text-black shadow-[0_0_5px_var(--color-highlight)]' : 'bg-[var(--color-metal)] text-[var(--color-bg)] opacity-50 hover:opacity-100'}`}
            >
              S
            </button>
          </div>

          <div className="w-px h-4 bg-[var(--color-metal)] shrink-0 mx-0.5"></div>

          {/* Volume */}
          <input 
            aria-label={`Volume Track ${track.id + 1}`}
            type="range" 
            min="0" 
            max="1" 
            step="0.01" 
            value={track.volume}
            onChange={(e) => setTrackProperty(track.id, 'volume', parseFloat(e.target.value))}
            className="w-12 h-1 shrink-0 accent-[var(--color-primary-glow)] bg-[var(--color-metal)] rounded-full appearance-none outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-[var(--color-primary-glow)] [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
      ))}
      </div>
    </div>
  );
}
