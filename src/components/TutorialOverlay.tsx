import { useState, useEffect } from 'react';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';

export function TutorialOverlay() {
  const [step, setStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  
  const { smoothedHands } = useHandStore();
  const { hoveredRoot, activeBass } = useMusicStore();

  useEffect(() => {
    const hasCompleted = localStorage.getItem('kasync_tutorial_completed');
    if (!hasCompleted) {
      setIsVisible(true);
    }
  }, []);

  const skipTutorial = () => {
    localStorage.setItem('kasync_tutorial_completed', 'true');
    setIsVisible(false);
  };

  useEffect(() => {
    if (!isVisible) return;
    
    const isPinching = smoothedHands.some(h => h.isPinching);

    if (step === 1 && isPinching) {
      setStep(2);
    }
    
    if (step === 2 && isPinching && hoveredRoot) {
      setStep(3);
    }
    
    if (step === 3 && isPinching && activeBass && activeBass !== hoveredRoot) {
      setStep(4);
    }
  }, [smoothedHands, hoveredRoot, activeBass, step, isVisible]);

  if (!isVisible) return null;

  const isInteractiveStep = step > 0 && step < 4;

  return (
    <div className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-none transition-all duration-500 ${isInteractiveStep ? 'bg-transparent' : 'bg-black/80 backdrop-blur-md'}`}>
      
      <div className={`bg-[var(--color-bg-elevated)] border border-[var(--color-primary-glow)] beveled-panel p-8 max-w-md pointer-events-auto shadow-[0_0_30px_var(--color-primary-glow)] flex flex-col items-center text-center gap-6 transition-all duration-500 ${isInteractiveStep ? 'absolute top-8 translate-y-0 scale-90 opacity-90' : 'scale-100'}`}>
        
        <h2 className="text-xl font-bold text-white tracking-widest uppercase">
          {step === 0 && "Welcome to Kasync-Kasync"}
          {step === 1 && "Step 1: The Pinch"}
          {step === 2 && "Step 2: The Wheels"}
          {step === 3 && "Step 3: Slash Chords"}
          {step === 4 && "You're Ready"}
        </h2>
        
        <p className="text-[var(--color-metal-light)] leading-relaxed text-sm">
          {step === 0 && "This instrument is played entirely with your hands. Ensure your webcam is on and your hands are visible. Ready to learn?"}
          {step === 1 && "Hold your hand up to the camera and touch your thumb and index finger together (Pinch). This is how you trigger a note."}
          {step === 2 && "While pinching, move your hand (the palm center) towards the segments of the glowing wheel to change chords."}
          {step === 3 && "Drag your pinch slightly outward past the root wheel into the thin outer ring to trigger a different bass note (slash chord)."}
          {step === 4 && "You have mastered the core gestures! You can now arm tracks in the Mixer and start recording your loops."}
        </p>

        <div className="flex gap-4 w-full justify-center mt-2">
          {step === 0 && (
            <button onClick={() => setStep(1)} className="px-6 py-2 bg-[var(--color-primary)] text-white font-bold beveled-panel uppercase hover:bg-[var(--color-primary-glow)] transition-colors text-xs tracking-widest">Start Tutorial</button>
          )}
          {step === 4 && (
            <button onClick={skipTutorial} className="px-6 py-2 bg-[var(--color-highlight)] text-black font-bold beveled-panel uppercase hover:brightness-110 shadow-[0_0_15px_var(--color-highlight)] transition-all text-xs tracking-widest">Start Playing</button>
          )}
          {step < 4 && (
            <button onClick={skipTutorial} className="px-4 py-2 bg-[var(--color-metal)] text-white/70 font-bold beveled-panel uppercase hover:text-white transition-colors text-xs tracking-widest">Skip</button>
          )}
        </div>
      </div>
    </div>
  );
}
