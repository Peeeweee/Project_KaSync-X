import { useMemo } from 'react';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { useSongStore } from '../store/songStore';
import { formatChordName } from '../music/enharmonics';

export function CenterReadout() {
  const mode = useMusicStore(state => state.mode);
  const hoveredRoot = useMusicStore(state => state.hoveredRoot);
  const hoveredQuality = useMusicStore(state => state.hoveredQuality);
  const hoveredBass = useMusicStore(state => state.hoveredBass);
  const currentKey = useMusicStore(state => state.currentKey);

  const activeSectionIndex = useSongStore(state => state.activeSectionIndex);
  const songSections = useSongStore(state => state.songs.find(s => s.id === state.activeSongId)?.sections);
  const songDefaultKey = useSongStore(state => state.songs.find(s => s.id === state.activeSongId)?.defaultKey);

  const hands = useHandStore(state => state.smoothedHands);

  const isPlaying = useMusicStore(state => state.playingNotes.length > 0);
  const displayText = useMemo(() => {
    let text = 'READY';
    if (mode === 'Chord') {
      if (hoveredRoot && hoveredQuality) {
        text = formatChordName(hoveredRoot, hoveredQuality, hoveredBass, currentKey);
      } else if (hoveredRoot) {
        text = formatChordName(hoveredRoot, 'maj', hoveredBass, currentKey);
      } else {
        text = hands.length > 0 ? 'HOVER' : 'READY';
      }
    } else if (mode === 'Song') {
      if (hoveredRoot) {
        const quality = hoveredQuality || 'maj';
        const keyToUse = songSections?.[activeSectionIndex]?.key ?? songDefaultKey ?? currentKey;
        text = formatChordName(hoveredRoot, quality, hoveredBass, keyToUse);
      } else {
        text = hands.length > 0 ? 'HOVER' : 'READY';
      }
    } else {
      if (hoveredRoot) {
        text = formatChordName(hoveredRoot, '', hoveredBass, currentKey);
      } else {
        text = hands.length > 0 ? 'HOVER' : 'READY';
      }
    }
    return text;
  }, [mode, hands, hoveredRoot, hoveredQuality, hoveredBass, currentKey, activeSectionIndex, songSections, songDefaultKey]);

  return (
    <div
      className="kasync-center-readout absolute z-20 flex flex-col items-center justify-center pointer-events-none"
      style={{ top: 'var(--kasync-stage-y, 50%)', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div className="relative w-28 h-28 flex items-center justify-center">
        {/* Holographic orbital rings */}
        {mode !== 'Song' && (
          <>
            <div className="absolute inset-0 rounded-full border border-[var(--color-primary-glow)]/30 opacity-40"></div>
            <div className="absolute inset-1 rounded-full border border-[var(--color-secondary)]/30 opacity-30"></div>
            {isPlaying && (
              <div className="absolute inset-0 rounded-full border-2 border-[var(--color-primary-glow)] animate-ping opacity-30"></div>
            )}
          </>
        )}

        {/* Main Core */}
        <div className="absolute inset-2.5 rounded-full bg-black/80 backdrop-blur-xl shadow-[0_0_15px_rgba(157,78,221,0.3)] border border-[var(--color-metal)] flex items-center justify-center overflow-hidden">
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,78,221,0.25)_0%,transparent_70%)]"></div>
           {isPlaying && <div className="absolute inset-0 bg-[var(--color-primary-glow)]/20 animate-pulse"></div>}
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center select-none text-center px-1">
          <span
            className={`font-black tracking-widest transition-all duration-300 ml-0.5 ${
              displayText.length > 7 ? 'text-xs md:text-sm' : displayText.length > 5 ? 'text-sm md:text-base' : 'text-base md:text-lg'
            } ${isPlaying ? 'text-white drop-shadow-[0_0_12px_var(--color-primary-glow)] scale-105' : 'text-[var(--color-primary-glow)] opacity-70 drop-shadow-[0_0_6px_var(--color-primary-glow)]'}`}
          >
            {displayText}
          </span>
          <span className={`text-[7px] font-mono tracking-widest uppercase transition-opacity duration-200 mt-0.5 ${
            isPlaying ? 'text-[#00f0ff] font-bold animate-pulse' : 'text-white/40'
          }`}>
            {isPlaying ? 'STRIKE • CHOKE' : hands.length > 0 ? (hoveredRoot ? 'POINT IN • PINCH' : 'HOVER NOTE') : 'RAISE HAND'}
          </span>
        </div>
      </div>
    </div>
  );
}
