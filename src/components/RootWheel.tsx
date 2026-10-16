import { useEffect, useMemo, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { CHROMATIC_NOTES, getActiveNoteIndex } from '../music/scales';
import { getScreenHands } from '../tracking/handUtils';
import { isVolumeHand } from '../store/volumeGesture';

export function getWedgePath(
  innerRadius: number,
  outerRadius: number,
  angleSpanDegrees: number
) {
  const gap = 1.5;
  const startAngle = -angleSpanDegrees / 2 + gap;
  const endAngle = angleSpanDegrees / 2 - gap;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const startOuter = {
    x: outerRadius * Math.cos(toRad(startAngle)),
    y: outerRadius * Math.sin(toRad(startAngle)),
  };
  const endOuter = {
    x: outerRadius * Math.cos(toRad(endAngle)),
    y: outerRadius * Math.sin(toRad(endAngle)),
  };
  const startInner = {
    x: innerRadius * Math.cos(toRad(startAngle)),
    y: innerRadius * Math.sin(toRad(startAngle)),
  };
  const endInner = {
    x: innerRadius * Math.cos(toRad(endAngle)),
    y: innerRadius * Math.sin(toRad(endAngle)),
  };

  return `
    M ${startOuter.x} ${startOuter.y}
    A ${outerRadius} ${outerRadius} 0 0 1 ${endOuter.x} ${endOuter.y}
    L ${endInner.x} ${endInner.y}
    A ${innerRadius} ${innerRadius} 0 0 0 ${startInner.x} ${startInner.y}
    Z
  `;
}

export function RootWheel() {
  const currentScale = useMusicStore((state) => state.currentScale);
  const currentKey = useMusicStore((state) => state.currentKey);
  const snapToScale = useMusicStore((state) => state.snapToScale);
  const hoveredRoot = useMusicStore((state) => state.hoveredRoot);
  const hoveredBass = useMusicStore((state) => state.hoveredBass);
  const mode = useMusicStore((state) => state.mode);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const layoutCache = useRef({ width: 0, height: 0, left: 0, top: 0 });

  const SIZE = 550;
  const CENTER = SIZE / 2;
  const INNER_RADIUS = 75;
  const ROOT_RADIUS = mode === 'Chord' ? 195 : 240;
  const BASS_RADIUS = 250;

  const rootWedge = useMemo(
    () => getWedgePath(INNER_RADIUS, ROOT_RADIUS, 30),
    [INNER_RADIUS, ROOT_RADIUS]
  );
  const bassWedge = useMemo(
    () => getWedgePath(ROOT_RADIUS + 5, BASS_RADIUS, 30),
    [ROOT_RADIUS, BASS_RADIUS]
  );

  useEffect(() => {
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      layoutCache.current = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    }
    if (typeof ResizeObserver === 'undefined' || !svgRef.current) return;
    const observer = new ResizeObserver(() => {
      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        layoutCache.current = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
      }
    });
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    const unsub = useHandStore.subscribe((state) => {
      const music = useMusicStore.getState();
      const hands = state.smoothedHands;
      const { leftHand } = getScreenHands(hands);
      const hand = leftHand ?? hands[0];
      if (hand && isVolumeHand(hand)) return;

      if (!state.isTracking || !hand) {
        if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
        if (music.hoveredRoot || music.hoveredBass) {
          if (hands.length === 0) music.setMusicState({ hoveredRoot: null, hoveredBass: null });
          else music.setMusicState({ hoveredBass: null });
        }
        return;
      }

      const { indexTipPosition } = hand;
      
      let wheelCenterX = 0.25;
      let wheelCenterY = 0.5;

      if (svgRef.current) {
        const rect = layoutCache.current;
        if (rect.width > 0 && rect.height > 0) {
          wheelCenterX = (rect.left + rect.width / 2) / (window.innerWidth || 1024);
          wheelCenterY = (rect.top + rect.height / 2) / (window.innerHeight || 768);
        }
      }

      const viewportWidth = window.innerWidth || 1024;
      const viewportHeight = window.innerHeight || 768;
      const dx = (indexTipPosition.x - wheelCenterX) * viewportWidth;
      const rawDy = (indexTipPosition.y - wheelCenterY) * viewportHeight;
      const dist = Math.hypot(dx, rawDy);
      const measuredWidth = layoutCache.current.width;
      const renderedSize = measuredWidth > 0 ? measuredWidth : 400;
      const scale = renderedSize / SIZE;
      const INNER_DEAD = INNER_RADIUS * scale;
      const maxOuterRadius = mode === 'Chord' ? BASS_RADIUS : ROOT_RADIUS;
      const OUTER_DEAD = (maxOuterRadius + 12) * scale;

      const isInActiveZone = dist >= INNER_DEAD && dist <= OUTER_DEAD;

      if (isInActiveZone) {
        if (containerRef.current) {
          const parallaxX = Math.max(-10, Math.min(10, dx * 0.04));
          const parallaxY = Math.max(-10, Math.min(10, rawDy * 0.04));
          containerRef.current.style.transform = `translate(calc(-50% + ${parallaxX}px), calc(-50% + ${parallaxY}px))`;
        }

        // Calculate angle where UP (12 o'clock) = 0, RIGHT (3 o'clock) = PI/2
        // Screen Y increases downward, so -rawDy points UP
        let angle = Math.atan2(dx, -rawDy);
        if (angle < 0) angle += 2 * Math.PI;

        const isBassOverride = mode === 'Chord' && dist > (ROOT_RADIUS + 3) * scale;

        const rootIndex = CHROMATIC_NOTES.indexOf(currentKey);
        const selectedIndex = getActiveNoteIndex(
          angle,
          snapToScale,
          currentScale,
          rootIndex
        );

        let nextRoot = music.hoveredRoot;
        let nextBass = music.hoveredBass;

        if (isBassOverride) {
          nextRoot = CHROMATIC_NOTES[selectedIndex];
          nextBass = CHROMATIC_NOTES[selectedIndex];
        } else {
          nextRoot = CHROMATIC_NOTES[selectedIndex];
          nextBass = null;
        }

        if (nextRoot !== music.hoveredRoot || nextBass !== music.hoveredBass) {
          music.setMusicState({ hoveredRoot: nextRoot, hoveredBass: nextBass });
        }
      } else {
        // Finger is OUTSIDE the active zone — freeze, silence
        if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
        if (music.hoveredRoot || music.hoveredBass) {
          music.setMusicState({ hoveredBass: null });
        }
      }
    });

    return unsub;
  }, [
    mode,
    currentScale,
    currentKey,
    snapToScale,
  ]);

  const activeRootIndex = hoveredRoot
    ? CHROMATIC_NOTES.indexOf(hoveredRoot)
    : -1;
  const activeBassIndex = hoveredBass
    ? CHROMATIC_NOTES.indexOf(hoveredBass)
    : -1;

  if (mode === 'Song') return null;

  return (
    <div
      ref={containerRef}
      className="kasync-root-wheel kasync-performance-wheel kasync-performance-wheel--left absolute z-30 pointer-events-none drop-shadow-2xl"
      style={{ transform: 'translate(-50%, -50%)' }}
    >
      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="kasync-wheel-svg">
        {/* Holographic Concentric Rings */}
        <g style={{ transformOrigin: 'center' }} className="opacity-30">
          <circle cx={CENTER} cy={CENTER} r={(mode === 'Chord' ? BASS_RADIUS : ROOT_RADIUS) + 12} fill="none" stroke="var(--color-primary)" strokeWidth="1" />
        </g>
        <g style={{ transformOrigin: 'center' }} className="opacity-25">
          <circle cx={CENTER} cy={CENTER} r={(mode === 'Chord' ? BASS_RADIUS : ROOT_RADIUS) + 20} fill="none" stroke="var(--color-secondary)" strokeWidth="0.5" />
        </g>
        <circle cx={CENTER} cy={CENTER} r={mode === 'Chord' ? BASS_RADIUS : ROOT_RADIUS} fill="rgba(3,3,5,0.6)" stroke="var(--color-metal)" strokeWidth="1" />
        
        <g transform={`translate(${CENTER}, ${CENTER})`}>
          {CHROMATIC_NOTES.map((note, index) => {
            const isRootActive = index === activeRootIndex;
            const isBassActive = index === activeBassIndex;

            const rootFill = isRootActive
              ? 'var(--color-primary)'
              : 'var(--color-metal)';
            const rootStroke = isRootActive
              ? 'var(--color-primary-glow)'
              : 'var(--color-metal-light)';

            const bassFill = isBassActive
              ? 'var(--color-highlight)'
              : 'var(--color-metal)';
            const bassStroke = isBassActive
              ? 'var(--color-highlight)'
              : 'var(--color-metal-light)';

            const rootClass = isRootActive
              ? 'opacity-100'
              : 'animate-breathe opacity-60';
            const bassClass = isBassActive
              ? 'opacity-100'
              : 'animate-breathe opacity-20';

            const angleDeg = index * 30 - 90;
            const angleRad = (angleDeg * Math.PI) / 180;
            
            const rootMidR = (INNER_RADIUS + ROOT_RADIUS) / 2;
            const rx = rootMidR * Math.cos(angleRad);
            const ry = rootMidR * Math.sin(angleRad);

            const bassMidR = (ROOT_RADIUS + BASS_RADIUS) / 2;
            const bx = bassMidR * Math.cos(angleRad);
            const by = bassMidR * Math.sin(angleRad);

            return (
              <g key={note}>
                {/* Wedges */}
                <g transform={`rotate(${angleDeg})`}>
                  {mode === 'Chord' && (
                    <g className={bassClass} style={{ transformOrigin: '0 0' }}>
                    <path d={bassWedge} fill={bassFill} stroke={bassStroke} strokeWidth="2" />
                    </g>
                  )}
                  <g className={rootClass} style={{ transformOrigin: '0 0' }}>
                    <path d={rootWedge} fill={rootFill} stroke={rootStroke} strokeWidth="2" />
                  </g>
                </g>
                {/* Labels */}
                <text
                  x={rx}
                  y={ry}
                  fill={isRootActive ? "white" : "var(--color-primary-glow)"}
                  fontSize={mode === 'Chord' ? "13" : "16"}
                  fontWeight="bold"
                  letterSpacing="2"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  opacity={isRootActive ? 1 : 0.6}
                  className="pointer-events-none"
                  style={{}}
                >
                  {note}
                </text>
                {mode === 'Chord' && (
                  <text
                    x={bx}
                    y={by}
                    fill={isBassActive ? "white" : "var(--color-highlight)"}
                    fontSize="10"
                    fontWeight="500"
                    letterSpacing="1"
                    textAnchor="middle"
                    alignmentBaseline="middle"
                    opacity={isBassActive ? 1 : 0.4}
                    className="pointer-events-none"
                    style={{}}
                  >
                    {note}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
