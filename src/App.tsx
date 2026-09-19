import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { CanvasOverlay } from './components/CanvasOverlay';
import { RootWheel } from './components/RootWheel';
import { QualityWheel } from './components/QualityWheel';
import { TransportBar } from './components/TransportBar';
import { Visualizer } from './components/Visualizer';
import { MixerPanel } from './components/MixerPanel';
import { TutorialOverlay } from './components/TutorialOverlay';
import { looperService } from './looper/recorder';
import { useHandStore } from './store/handState';
import { useMusicStore } from './store/musicState';
import { buildChord } from './music/chords';
import { formatChordName } from './music/enharmonics';
import { usePerformanceMonitor } from './hooks/usePerformanceMonitor';
import './index.css';

function App() {
  const [audioStarted, setAudioStarted] = useState(false);
  const isLowPerf = usePerformanceMonitor();
  const mode = useMusicStore(state => state.mode);
  // Use specific selectors to avoid re-rendering on every setMusicState call (prevents infinite loop)
  const hoveredRoot = useMusicStore(state => state.hoveredRoot);
  const hoveredQuality = useMusicStore(state => state.hoveredQuality);
  const hoveredBass = useMusicStore(state => state.hoveredBass);
  const currentKey = useMusicStore(state => state.currentKey);
  const hands = useHandStore(state => state.smoothedHands);

  const handleStartAudio = useCallback(async () => {
    await looperService.startAudioContext();
    setAudioStarted(true);
  }, []);

  const lastChordKeyRef = useRef<string>('');

  // Master fade out when hands leave
  useEffect(() => {
    if (!audioStarted) return;
    if (hands.length === 0) {
      looperService.setMasterVolume(-60, 3.0); // 3-second gradual fade to silence
    } else {
      looperService.setMasterVolume(0, 0.5);   // Quick fade back in
    }
  }, [hands.length, audioStarted]);

  useEffect(() => {
    if (!audioStarted) return;

    if (mode === 'Chord') {
      const isLeftPinching = hands[0]?.isPinching ?? false;
      const rightPinching = hands[1]?.isPinching ?? false;
      
      if (isLeftPinching && rightPinching && hoveredRoot && hoveredQuality) {
        const chordNotes = buildChord(hoveredRoot, hoveredQuality, hoveredBass);
        const chordKey = chordNotes.join(',');
        
        // Only trigger audio if chord actually changed — prevents engine spam
        if (chordKey !== lastChordKeyRef.current) {
          lastChordKeyRef.current = chordKey;
          const velocity = Math.max(hands[0]!.pinchStrength, hands[1]!.pinchStrength);
          looperService.triggerChord(chordNotes, velocity);
          useMusicStore.getState().setMusicState({ playingNotes: chordNotes });
        }
      } else {
        if (lastChordKeyRef.current !== '') {
          lastChordKeyRef.current = '';
          const noHandsOnScreen = hands.length === 0;
          looperService.releaseChord(noHandsOnScreen);
          useMusicStore.getState().setMusicState({ playingNotes: [] });
        }
      }
    } else {
      const hand = hands[0];
      if (hand?.isPinching && hoveredRoot) {
        // Play root note with octave doubling for a fuller melody sound
        const noteLow  = `${hoveredRoot}4`;
        const noteHigh = `${hoveredRoot}5`;
        const noteKey  = `${noteLow},${noteHigh}`;
        if (lastChordKeyRef.current !== noteKey) {
          lastChordKeyRef.current = noteKey;
          looperService.triggerChord([noteLow, noteHigh], hand.pinchStrength);
          useMusicStore.getState().setMusicState({ playingNotes: [noteLow, noteHigh] });
        }
      } else {
        if (lastChordKeyRef.current !== '') {
          lastChordKeyRef.current = '';
          const noHandsOnScreen = hands.length === 0;
          looperService.releaseNote(noHandsOnScreen);
          useMusicStore.getState().setMusicState({ playingNotes: [] });
        }
      }
    }
  }, [hands, mode, hoveredRoot, hoveredQuality, hoveredBass, audioStarted]);

  const { displayText, isPlaying } = useMemo(() => {
    let text = 'OFF';
    let playing = false;

    if (mode === 'Chord') {
      const isLeftPinching = hands[0]?.isPinching ?? false;
      const rightPinching  = hands[1]?.isPinching ?? false;
      playing = !!(isLeftPinching && rightPinching);
      if (hoveredRoot && hoveredQuality) {
        text = formatChordName(hoveredRoot, hoveredQuality, hoveredBass, currentKey);
      } else if (hoveredRoot) {
        text = formatChordName(hoveredRoot, '', hoveredBass, currentKey);
      }
    } else {
      playing = !!hands[0]?.isPinching;
      if (hoveredRoot) {
        text = formatChordName(hoveredRoot, '', hoveredBass, currentKey);
      }
    }
    return { displayText: text, isPlaying: playing };
  }, [mode, hands, hoveredRoot, hoveredQuality, hoveredBass, currentKey]);

  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-[var(--color-bg)] overflow-hidden">
      <CameraFeed />
      <CanvasOverlay />
      <TransportBar />
      <Visualizer />
      <MixerPanel />
      
      {audioStarted && (
        <>
          <RootWheel />
          <QualityWheel />
        </>
      )}

      {/* Center Readout (Wakandan Holographic Core) */}
      <div 
        className="absolute z-20 flex flex-col items-center justify-center pointer-events-none"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="relative w-48 h-48 flex items-center justify-center">
          
          {/* Animated decorative outer rings — will-change promotes to compositor layer */}
          <div className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--color-primary-glow)] opacity-30 animate-spin-slow" style={{ willChange: 'transform' }}></div>
          <div className="absolute inset-1.5 rounded-full border-[1px] border-[var(--color-secondary)] opacity-40 animate-[spin_12s_linear_infinite_reverse]" style={{ willChange: 'transform' }}></div>
          <div className="absolute inset-4 rounded-full border-2 border-transparent border-t-[var(--color-primary)] border-b-[var(--color-primary)] opacity-40 animate-[spin_4s_ease-in-out_infinite_alternate]" style={{ willChange: 'transform' }}></div>
          
          {/* Main Core */}
          <div className="absolute inset-6 rounded-full bg-black/70 backdrop-blur-xl shadow-[0_0_30px_rgba(157,78,221,0.3)] border border-[var(--color-metal)] flex items-center justify-center overflow-hidden">
             {/* Subtle internal pulse/glow */}
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,78,221,0.25)_0%,transparent_70%)]"></div>
             {isPlaying && <div className="absolute inset-0 bg-[var(--color-primary-glow)]/20 animate-pulse"></div>}
          </div>
          
          <span 
            className={`relative z-10 text-4xl font-black tracking-widest transition-all duration-300 ml-2 ${isPlaying ? 'text-white drop-shadow-[0_0_20px_var(--color-primary-glow)] scale-110' : 'text-[var(--color-primary-glow)] opacity-60 drop-shadow-[0_0_10px_var(--color-primary-glow)]'}`}
          >
            {displayText === 'OFF' && isPlaying ? '' : displayText}
          </span>
        </div>
      </div>
      
      {!audioStarted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <button 
            onClick={handleStartAudio}
            className="px-8 py-4 text-2xl font-bold tracking-widest uppercase text-[var(--color-bg)] bg-[var(--color-primary)] hover:bg-[var(--color-primary-glow)] transition-colors shadow-[0_0_20px_var(--color-primary-glow)] pointer-events-auto beveled-panel"
          >
            Initialize Audio Engine
          </button>
        </div>
      )}

      {/* Low Performance Toast */}
      {isLowPerf && (
        <div className="absolute top-4 right-4 z-50 bg-[var(--color-danger)]/90 text-white text-xs font-bold px-4 py-2 rounded shadow-lg animate-pulse">
          Performance Warning: Visuals reduced to maintain audio fidelity.
        </div>
      )}

      {/* Header Logo (Premium Wakandan HUD Style) */}
      <div className="absolute top-8 left-8 z-40 pointer-events-none flex items-center gap-4">
        {/* Geometric Hexagon Icon */}
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 border-[1.5px] border-[var(--color-primary)] opacity-40 animate-pulse rotate-45"></div>
          <div className="absolute inset-1 border-[1.5px] border-[var(--color-secondary)] opacity-80 rotate-12"></div>
          <div className="w-2 h-2 bg-[var(--color-secondary)] shadow-[0_0_10px_var(--color-secondary)] rotate-45"></div>
        </div>
        
        {/* Vertical Divider */}
        <div className="w-[1px] h-10 bg-gradient-to-b from-transparent via-[var(--color-secondary)] to-transparent opacity-50"></div>
        
        {/* Typography */}
        <div className="flex flex-col">
          <h1 className="text-2xl font-light tracking-[0.4em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            K A S Y N C<span className="font-bold text-[var(--color-secondary)] ml-1 drop-shadow-[0_0_15px_var(--color-secondary)]">.X</span>
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-[1px] w-6 bg-[var(--color-primary)] opacity-60"></div>
            <p className="text-[7px] tracking-[0.4em] text-[var(--color-primary-glow)] font-bold uppercase opacity-80">
              Vibranium Audio Matrix
            </p>
          </div>
        </div>
      </div>
      
      <TutorialOverlay />
    </div>
  );
}

export default App;
