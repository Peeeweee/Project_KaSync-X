import { useEffect, useRef } from 'react';
import { useMusicStore } from '../store/musicState';
import { usePerformanceFeedback } from '../hooks/usePerformanceFeedback';

function NotePulse() {
  const circle = useRef<SVGCircleElement>(null);
  useEffect(() => {
    const element = circle.current;
    if (!element) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let pulse: Animation | undefined;
    const cancel = () => { pulse?.cancel(); pulse = undefined; };
    const onPreference = () => { if (reduced?.matches) cancel(); };
    reduced?.addEventListener('change',onPreference);
    const unsubscribe = useMusicStore.subscribe((state,previous) => {
      if (state.playingNotes === previous.playingNotes) return;
      cancel();
      if (!state.playingNotes.length || reduced?.matches || typeof element.animate !== 'function') return;
      // One finite native animation per note request. No render/timer/frame loop.
      pulse = element.animate([
        {opacity:.75,transform:'scale(.97)'},
        {opacity:0,transform:'scale(1.02)'},
      ],{duration:240,easing:'cubic-bezier(.2,.7,.2,1)'});
    });
    return () => { unsubscribe(); cancel(); reduced?.removeEventListener('change',onPreference); };
  },[]);
  return <circle ref={circle} cx="275" cy="275" r="248" className="ring-note-pulse" />;
}

/** Decorative feedback only; keyboard, pointer and camera input remain unchanged. */
export function PerformanceRim() {
  const feedback = usePerformanceFeedback();
  return <g className="ring-performance-feedback" data-note-state={feedback.state} aria-hidden="true" pointerEvents="none">
    <circle cx="275" cy="275" r="248" className="ring-note-outline" />
    <NotePulse />
  </g>;
}
