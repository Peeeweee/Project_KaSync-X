import { useMusicStore } from '../store/musicState';
import { useSelectedChord } from '../hooks/useSelectedChord';
import { usePerformanceFeedback } from '../hooks/usePerformanceFeedback';

export function CenterReadout() {
  const feedback = usePerformanceFeedback();
  const mode = useMusicStore(state => state.mode);
  const hoveredRoot = useMusicStore(state => state.hoveredRoot);
  const displayText = useSelectedChord();
  const isPlaying = useMusicStore(state => state.playingNotes.length > 0);
  const coreText = displayText ?? feedback.label;

  return (
    <div
      className="kasync-center-readout absolute z-20 flex flex-col items-center justify-center pointer-events-none"
      data-state={feedback.state}
      aria-label={`Performance: ${feedback.label}. ${feedback.hint}`}
      style={{ top: 'var(--kasync-stage-y, 50%)', left: '50%', transform: 'translate(-50%, -50%)' }}
    >
      <div className="relative w-28 h-28 flex items-center justify-center">
        {/* Holographic orbital rings */}
        {mode !== 'Song' && (
          <>
            <div className="absolute inset-0 rounded-full border border-[var(--color-primary-glow)]/30 opacity-40"></div>
            <div className="absolute inset-1 rounded-full border border-[var(--color-secondary)]/30 opacity-30"></div>
            <div className="kasync-core-state-ring absolute inset-0 rounded-full" />
          </>
        )}

        {/* Main Core */}
        <div className="absolute inset-2.5 rounded-full bg-black/80 backdrop-blur-xl shadow-[0_0_15px_rgba(157,78,221,0.3)] border border-[var(--color-metal)] flex items-center justify-center overflow-hidden">
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(157,78,221,0.25)_0%,transparent_70%)]"></div>
           <div className="kasync-core-state-fill absolute inset-0" />
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center select-none text-center px-1">
          <span
            className={`kasync-core-title font-black tracking-widest transition-colors duration-150 ml-0.5 ${
              coreText.length > 10 ? 'text-[10px]' : coreText.length > 7 ? 'text-xs' : coreText.length > 5 ? 'text-sm md:text-base' : 'text-base md:text-lg'
            } ${isPlaying ? 'text-white drop-shadow-[0_0_12px_var(--color-primary-glow)] scale-105' : 'text-[var(--color-primary-glow)] opacity-70 drop-shadow-[0_0_6px_var(--color-primary-glow)]'}`}
          >
            {coreText}
          </span>
          {hoveredRoot && <span className="kasync-core-state-label">{feedback.label}</span>}
          <span className="kasync-core-state-hint">{feedback.hint}</span>
          {feedback.connected && <span className="kasync-core-link">PINCH LINKED</span>}
        </div>
      </div>
    </div>
  );
}
