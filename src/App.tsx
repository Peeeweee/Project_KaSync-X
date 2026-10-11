import { useState, useEffect, useCallback, useMemo } from 'react';
import { CameraFeed } from './components/CameraFeed';
import { CanvasOverlay } from './components/CanvasOverlay';
import { RootWheel } from './components/RootWheel';
import { QualityWheel } from './components/QualityWheel';
import { SongPalette } from './components/SongPalette';
import { SongPanel } from './components/SongPanel';
import { TransportBar } from './components/TransportBar';
import { Visualizer } from './components/Visualizer';
import { MixerPanel } from './components/MixerPanel';
import { InstrumentPanel } from './components/InstrumentPanel';
import { TutorialOverlay } from './components/TutorialOverlay';
import { MidiPanel } from './components/MidiPanel';
import { ToastContainer } from './components/ToastContainer';
import { SessionPanel } from './components/SessionPanel';
import { ArrangementPanel } from './components/ArrangementPanel';
import { looperService } from './looper/recorder';
import { useHandStore } from './store/handState';
import { useMusicStore, INSTRUMENT_ORDER } from './store/musicState';
import { useSongStore } from './store/songStore';
import { useLooperStore } from './store/looperState';
import { formatChordName } from './music/enharmonics';
import { usePerformanceMonitor } from './hooks/usePerformanceMonitor';
import { useInstrumentGesture } from './hooks/useInstrumentGesture';
import { useAudioTrigger } from './hooks/useAudioTrigger';
import { useMidi } from './hooks/useMidi';
import { useSongTransport } from './hooks/useSongTransport';
import { getScreenHands } from './tracking/handUtils';
import { useSessionStore } from './store/sessionState';
import { useTrackingSettingsStore } from './store/trackingSettings';
import { saveAutosave } from './session/sessionManager';
import { toast } from './store/toastStore';
import { useArrangementStore } from './store/arrangementState';
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

  // Song Mode reactive state (needed for HUD display key resolution)
  const activeSectionIndex = useSongStore(state => state.activeSectionIndex);
  const songSections = useSongStore(state => state.songs.find(s => s.id === state.activeSongId)?.sections);
  const songDefaultKey = useSongStore(state => state.songs.find(s => s.id === state.activeSongId)?.defaultKey);

  // ── Hand-gesture instrument switching ──
  useInstrumentGesture();

  // ── MIDI (input, output, clock, learn) ──
  useMidi();
  useSongTransport();

  // ── Keyboard instrument switching ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in an input / select / textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      const store = useMusicStore.getState();
      const songStore = useSongStore.getState();

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (saveAutosave()) toast.success('Project saved locally.');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const looper = useLooperStore.getState();
        const armedId = looper.tracks.find(track => track.isArmed)?.id;
        if (armedId !== undefined) {
          if (e.shiftKey) looper.redoTrack(armedId);
          else looper.undoTrack(armedId);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        const looper = useLooperStore.getState();
        const armedId = looper.tracks.find(track => track.isArmed)?.id;
        if (armedId !== undefined) looper.redoTrack(armedId);
        return;
      }

      if (e.key === 'Escape') {
        useArrangementStore.getState().setOpen(false);
        useSessionStore.getState().setPanelOpen(false);
        useTrackingSettingsStore.getState().setPanelOpen(false);
        if (songStore.isSongPanelOpen) songStore.toggleSongPanel();
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        const session = useSessionStore.getState();
        session.setPanelOpen(!session.isPanelOpen);
        return;
      }

      if (!e.repeat && e.code === 'Space') {
        e.preventDefault();
        const looper = useLooperStore.getState();
        looper.setTransportState({ isPlaying: !looper.isPlaying });
        return;
      }

      if (!e.repeat && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        looperService.toggleRecording();
        return;
      }

      if (!e.repeat && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const looper = useLooperStore.getState();
        looper.setTransportState({ metronomeEnabled: !looper.metronomeEnabled });
        return;
      }

      // Song Mode section navigation
      if (store.mode === 'Song') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          songStore.nextSection();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          songStore.prevSection();
          return;
        }
      }

      // Keys 1–4: direct instrument pick
      const directMap: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 };
      if (e.key in directMap) {
        e.preventDefault();
        store.setMusicState({ currentInstrument: INSTRUMENT_ORDER[directMap[e.key]] });
        return;
      }

      // Tab / Shift+Tab: cycle
      if (e.key === 'Tab') {
        e.preventDefault();
        store.cycleInstrument(e.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleStartAudio = useCallback(async () => {
    await looperService.startAudioContext();
    setAudioStarted(true);
  }, []);

  // ── Audio trigger (direct store subscription — bypasses React render cycle) ──
  useAudioTrigger(audioStarted);

  // Ensure AudioContext is unlocked and resumed on ANY user interaction (click, tap, keypress)
  useEffect(() => {
    const resumeAudio = async () => {
      try {
        if (!audioStarted) {
          await looperService.startAudioContext();
          setAudioStarted(true);
        } else if (Tone.context.state !== 'running') {
          await Tone.context.resume();
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener('pointerdown', resumeAudio, { passive: true });
    window.addEventListener('keydown', resumeAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
    };
  }, [audioStarted]);

  const { displayText, isPlaying } = useMemo(() => {
    let text = 'READY';
    let playing = false;
    const { leftHand, rightHand } = getScreenHands(hands);

    if (mode === 'Chord') {
      const isLeftPinching = leftHand?.isPinching ?? false;
      const isRightPinching = rightHand?.isPinching ?? false;
      playing = isLeftPinching || isRightPinching;
      if (hoveredRoot && hoveredQuality) {
        text = formatChordName(hoveredRoot, hoveredQuality, hoveredBass, currentKey);
      } else if (hoveredRoot) {
        text = formatChordName(hoveredRoot, 'maj', hoveredBass, currentKey);
      } else {
        text = hands.length > 0 ? 'HOVER' : 'READY';
      }
    } else if (mode === 'Song') {
      playing = !!leftHand?.isPinching;
      if (hoveredRoot) {
        const quality = hoveredQuality || 'maj';
        const keyToUse = songSections?.[activeSectionIndex]?.key ?? songDefaultKey ?? currentKey;
        text = formatChordName(hoveredRoot, quality, hoveredBass, keyToUse);
      } else {
        text = hands.length > 0 ? 'HOVER' : 'READY';
      }
    } else {
      const h = leftHand ?? rightHand ?? hands[0];
      playing = !!h?.isPinching;
      if (hoveredRoot) {
        text = formatChordName(hoveredRoot, '', hoveredBass, currentKey);
      } else {
        text = hands.length > 0 ? 'HOVER' : 'READY';
      }
    }
    return { displayText: text, isPlaying: playing };
  }, [mode, hands, hoveredRoot, hoveredQuality, hoveredBass, currentKey, activeSectionIndex, songSections, songDefaultKey]);

  return (
    <main className="kasync-app relative flex h-screen w-full items-center justify-center bg-[var(--color-bg)] overflow-hidden">
      <CameraFeed />
      <CanvasOverlay />
      <TransportBar />
      <Visualizer />
      <MixerPanel />
      <InstrumentPanel />
      
      {audioStarted && (
        <>
          {mode !== 'Song' && (
            <>
              <RootWheel />
              <QualityWheel />
            </>
          )}
          {mode === 'Song' && <SongPalette />}
          <SongPanel />
        </>
      )}

      {/* Center Readout (Wakandan Holographic Core) */}
      <div 
        className="kasync-center-readout absolute z-20 flex flex-col items-center justify-center pointer-events-none"
        style={{ top: 'var(--kasync-stage-y, 50%)', left: '50%', transform: 'translate(-50%, -50%)' }}
      >
        <div className="relative w-28 h-28 flex items-center justify-center">
          
          {/* Holographic orbital rings — clean aesthetic, non-distracting */}
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
             {/* Subtle internal pulse/glow */}
             <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,78,221,0.25)_0%,transparent_70%)]"></div>
             {isPlaying && <div className="absolute inset-0 bg-[var(--color-primary-glow)]/20 animate-pulse"></div>}
          </div>
          
          <span 
            className={`relative z-10 font-black tracking-widest transition-all duration-300 ml-0.5 select-none text-center px-1 ${
              displayText.length > 7 ? 'text-xs md:text-sm' : displayText.length > 5 ? 'text-sm md:text-base' : 'text-base md:text-lg'
            } ${isPlaying ? 'text-white drop-shadow-[0_0_12px_var(--color-primary-glow)] scale-105' : 'text-[var(--color-primary-glow)] opacity-70 drop-shadow-[0_0_6px_var(--color-primary-glow)]'}`}
          >
            {displayText}
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



      {/* Header Logo (Premium Wakandan HUD Style) */}
      <div className="kasync-logo absolute top-8 left-8 z-40 pointer-events-none flex items-center gap-4">
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
      <MidiPanel />
      <ToastContainer />
      <SessionPanel />
      <ArrangementPanel />
      <div className="sr-only" aria-live="polite">
        Transport {isLowPerf ? 'performance protection enabled' : 'ready'}.
      </div>
    </main>
  );
}

export default App;
