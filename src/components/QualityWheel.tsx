import { useEffect, useMemo, useState, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { CHORD_QUALITIES } from '../music/chords';
import { getWedgePath } from './RootWheel';
import { getScreenHands } from '../tracking/handUtils';

export function QualityWheel() {
  const mode = useMusicStore((state) => state.mode);
  const isTracking = useHandStore((state) => state.isTracking);
  const hands = useHandStore((state) => state.smoothedHands);

  const { showExtendedQualities } = useMusicStore();
  const setMusicState = useMusicStore((state) => state.setMusicState);
  const hoveredQuality = useMusicStore((state) => state.hoveredQuality);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const SIZE = 400;
  const CENTER = SIZE / 2;
  const INNER_RADIUS = 60;
  const BASIC_RADIUS = 140;
  const EXTENDED_RADIUS = 180;

  const basicWedge = useMemo(() => getWedgePath(INNER_RADIUS, BASIC_RADIUS, 360 / CHORD_QUALITIES.basic.length), []);
  const extendedWedge = useMemo(() => getWedgePath(BASIC_RADIUS + 5, EXTENDED_RADIUS, 360 / CHORD_QUALITIES.extended.length), []);

  useEffect(() => {
    const unsub = useHandStore.subscribe((state) => {
      if (useMusicStore.getState().mode !== 'Chord') return;
      
      const hands = state.smoothedHands;
      const { rightHand: hand } = getScreenHands(hands);

      if (!state.isTracking || !hand) {
        if (containerRef.current) containerRef.current.style.transform = 'translate(50%, -50%)';
        const music = useMusicStore.getState();
        if (music.hoveredQuality) music.setMusicState({ hoveredQuality: null });
        return;
      }

      const { indexTipPosition } = hand;
      
      let wheelCenterX = 0.75;
      let wheelCenterY = 0.5;

      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          wheelCenterX = (rect.left + rect.width / 2) / (window.innerWidth || 1024);
          wheelCenterY = (rect.top + rect.height / 2) / (window.innerHeight || 768);
        }
      }

      const dx = indexTipPosition.x - wheelCenterX;
      const rawDy = indexTipPosition.y - wheelCenterY;

      const dist = Math.sqrt(dx * dx + rawDy * rawDy);

      const INNER_DEAD = 0.04;
      const OUTER_DEAD = 0.28;
      const isInActiveZone = dist >= INNER_DEAD && dist <= OUTER_DEAD;

      if (isInActiveZone) {
        if (containerRef.current) {
          containerRef.current.style.transform = `translate(calc(50% + ${dx * 80}px), calc(-50% + ${rawDy * 80}px))`;
        }

        // Calculate angle where UP (12 o'clock) = 0, RIGHT (3 o'clock) = PI/2
        // Screen Y increases downward, so -rawDy points UP
        let angle = Math.atan2(dx, -rawDy);
        if (angle < 0) angle += 2 * Math.PI;

        const isExtended = dist > 0.20 && showExtendedQualities;

        let nextQuality = hoveredQuality;

        if (isExtended) {
          const segAngle = (2 * Math.PI) / CHORD_QUALITIES.extended.length;
          const index = Math.floor((angle + segAngle / 2) / segAngle) % CHORD_QUALITIES.extended.length;
          nextQuality = CHORD_QUALITIES.extended[index];
        } else {
          const segAngle = (2 * Math.PI) / CHORD_QUALITIES.basic.length;
          const index = Math.floor((angle + segAngle / 2) / segAngle) % CHORD_QUALITIES.basic.length;
          nextQuality = CHORD_QUALITIES.basic[index];
        }

        const music = useMusicStore.getState();
        if (nextQuality !== music.hoveredQuality) {
          music.setMusicState({ hoveredQuality: nextQuality });
        }
      } else {
        if (containerRef.current) containerRef.current.style.transform = 'translate(50%, -50%)';
        const music = useMusicStore.getState();
        if (music.hoveredQuality) music.setMusicState({ hoveredQuality: null });
      }
    });

    return unsub;
  }, [showExtendedQualities]);

  if (mode !== 'Chord') return null;

  const basicIndex = CHORD_QUALITIES.basic.indexOf(hoveredQuality!);
  const extendedIndex = CHORD_QUALITIES.extended.indexOf(hoveredQuality!);

  return (
    <div 
      ref={containerRef}
      className="absolute z-30 pointer-events-none drop-shadow-2xl transition-all duration-300 ease-out"
      style={{ 
        top: '50%',
        right: '30%',
        transform: 'translate(calc(50%), calc(-50%))'
      }}
    >
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[50vh] h-[50vh] max-w-[460px] max-h-[460px]">
        {/* Holographic Concentric Rings */}
        <g style={{ transformOrigin: 'center' }} className="animate-spin-slow opacity-40">
          <circle cx={CENTER} cy={CENTER} r={EXTENDED_RADIUS + 15} fill="none" stroke="var(--color-secondary)" strokeWidth="1.5" strokeDasharray="4 12" />
        </g>
        <g style={{ transformOrigin: 'center', animationDirection: 'reverse', animationDuration: '45s' }} className="animate-spin-slow opacity-30">
          <circle cx={CENTER} cy={CENTER} r={EXTENDED_RADIUS + 25} fill="none" stroke="var(--color-primary-glow)" strokeWidth="0.5" strokeDasharray="30 15 5 15" />
        </g>
        <circle cx={CENTER} cy={CENTER} r={EXTENDED_RADIUS} fill="rgba(3,3,5,0.6)" stroke="var(--color-metal)" strokeWidth="1" />
        <g transform={`translate(${CENTER}, ${CENTER})`}>
          {CHORD_QUALITIES.basic.map((quality, index) => {
            const isActive = index === basicIndex;
            const fill = isActive ? 'var(--color-secondary)' : 'var(--color-metal)';
            const stroke = isActive ? 'var(--color-secondary)' : 'var(--color-metal-light)';
            const angleDeg = (360 / CHORD_QUALITIES.basic.length) * index;
            const angleRad = ((angleDeg - 90) * Math.PI) / 180;
            
            const basicMidR = (INNER_RADIUS + BASIC_RADIUS) / 2;
            const tx = basicMidR * Math.cos(angleRad);
            const ty = basicMidR * Math.sin(angleRad);

            const wedgeClass = isActive 
              ? 'scale-[1.03] transition-all duration-150 drop-shadow-[0_0_20px_var(--color-secondary)]' 
              : 'animate-breathe transition-all duration-500 opacity-60';

            return (
              <g key={quality}>
                <g transform={`rotate(${angleDeg - 90})`}>
                  <g className={wedgeClass} style={{ transformOrigin: '0 0' }}>
                    <path d={basicWedge} fill={fill} stroke={stroke} strokeWidth="2" />
                  </g>
                </g>
                <text
                  x={tx}
                  y={ty}
                  fill={isActive ? "white" : "var(--color-secondary)"}
                  fontSize="12"
                  fontWeight="bold"
                  letterSpacing="1"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  opacity={isActive ? 1 : 0.6}
                  className="pointer-events-none"
                  style={{ textShadow: isActive ? '0 0 10px white' : 'none' }}
                >
                  {quality || 'maj'}
                </text>
              </g>
            );
          })}

          {showExtendedQualities && CHORD_QUALITIES.extended.map((quality, index) => {
            const isActive = index === extendedIndex;
            const fill = isActive ? 'var(--color-secondary)' : 'var(--color-metal)';
            const stroke = isActive ? 'var(--color-secondary)' : 'var(--color-metal-light)';
            const angleDeg = (360 / CHORD_QUALITIES.extended.length) * index;
            const angleRad = ((angleDeg - 90) * Math.PI) / 180;
            
            const extMidR = (BASIC_RADIUS + EXTENDED_RADIUS) / 2;
            const tx = extMidR * Math.cos(angleRad);
            const ty = extMidR * Math.sin(angleRad);

            const wedgeClass = isActive 
              ? 'scale-[1.02] transition-all duration-150 drop-shadow-[0_0_15px_var(--color-secondary)]' 
              : 'animate-breathe transition-all duration-500 opacity-30';

            return (
              <g key={quality}>
                <g transform={`rotate(${angleDeg - 90})`}>
                  <g className={wedgeClass} style={{ transformOrigin: '0 0' }}>
                    <path d={extendedWedge} fill={fill} stroke={stroke} strokeWidth="2" />
                  </g>
                </g>
                <text
                  x={tx}
                  y={ty}
                  fill={isActive ? "white" : "var(--color-secondary)"}
                  fontSize="10"
                  fontWeight="500"
                  letterSpacing="1"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  opacity={isActive ? 1 : 0.4}
                  className="pointer-events-none"
                  style={{ textShadow: isActive ? '0 0 5px white' : 'none' }}
                >
                  {quality}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
