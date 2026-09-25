import { useEffect, useMemo, useState, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useMusicStore } from '../store/musicState';
import { CHROMATIC_NOTES, getActiveNoteIndex } from '../music/scales';

export function getWedgePath(
  innerRadius: number,
  outerRadius: number,
  angleSpanDegrees: number
) {
  const startAngle = -angleSpanDegrees / 2;
  const endAngle = angleSpanDegrees / 2;

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
  const mode = useMusicStore((state) => state.mode);
  const isTracking = useHandStore((state) => state.isTracking);
  const hands = useHandStore((state) => state.smoothedHands);

  const hand = useMemo(() => {
    if (mode === 'Chord') {
      if (hands.length >= 2) {
        // Left wheel takes the hand further to the left on screen (smaller X)
        return hands[0].indexTipPosition.x < hands[1].indexTipPosition.x ? hands[0] : hands[1];
      }
      return hands[0];
    }
    return hands[0];
  }, [hands, mode]);

  const { currentScale, currentKey, snapToScale } = useMusicStore();
  const setMusicState = useMusicStore((state) => state.setMusicState);
  const hoveredRoot = useMusicStore((state) => state.hoveredRoot);
  const hoveredBass = useMusicStore((state) => state.hoveredBass);

  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const SIZE = mode === 'Chord' ? 400 : 500;
  const CENTER = SIZE / 2;
  const INNER_RADIUS = mode === 'Chord' ? 60 : 80;
  const ROOT_RADIUS = mode === 'Chord' ? 140 : 180;
  const BASS_RADIUS = mode === 'Chord' ? 180 : 230;

  const rootWedge = useMemo(
    () => getWedgePath(INNER_RADIUS, ROOT_RADIUS, 30),
    [INNER_RADIUS, ROOT_RADIUS]
  );
  const bassWedge = useMemo(
    () => getWedgePath(ROOT_RADIUS + 5, BASS_RADIUS, 30),
    [ROOT_RADIUS, BASS_RADIUS]
  );

  useEffect(() => {
    if (isTracking && hand) {
      const { indexTipPosition } = hand;
      
      let wheelCenterX = mode === 'Chord' ? 0.25 : 0.5;
      let wheelCenterY = 0.5;

      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        wheelCenterX = (rect.left + rect.width / 2) / window.innerWidth;
        wheelCenterY = (rect.top + rect.height / 2) / window.innerHeight;
      }

      const dx = indexTipPosition.x - wheelCenterX;
      const rawDy = indexTipPosition.y - wheelCenterY;

      // Distance from wheel center in normalized screen space
      const dist = Math.sqrt(dx * dx + rawDy * rawDy);

      // Active zone thresholds (in normalized 0-1 screen units)
      // The wheel SVG is ~450px on a ~1000px screen = ~0.45 of screen width
      // Inner dead zone: inside the center hub
      // Outer dead zone: too far from wheel
      const INNER_DEAD = 0.04;  // inner hub, no selection here
      const OUTER_DEAD = 0.28;  // outside ring, stop responding

      const isInActiveZone = dist >= INNER_DEAD && dist <= OUTER_DEAD;

      if (isInActiveZone) {
        setParallax({ x: dx * 80, y: rawDy * 80 });

        // Calculate angle where UP (12 o'clock) = 0, RIGHT (3 o'clock) = PI/2
        // Screen Y increases downward, so -rawDy points UP
        let angle = Math.atan2(dx, -rawDy);
        if (angle < 0) angle += 2 * Math.PI;

        const isBassOverride = dist > 0.20;

        const rootIndex = CHROMATIC_NOTES.indexOf(currentKey);
        const selectedIndex = getActiveNoteIndex(
          angle,
          snapToScale,
          currentScale,
          rootIndex
        );

        let nextRoot = hoveredRoot;
        let nextBass = hoveredBass;

        if (isBassOverride) {
          nextRoot = CHROMATIC_NOTES[selectedIndex];
          nextBass = CHROMATIC_NOTES[selectedIndex];
        } else {
          nextRoot = CHROMATIC_NOTES[selectedIndex];
          nextBass = null;
        }

        if (nextRoot !== hoveredRoot || nextBass !== hoveredBass) {
          setMusicState({ hoveredRoot: nextRoot, hoveredBass: nextBass });
        }
      } else {
        // Finger is OUTSIDE the active zone — freeze, silence
        setParallax({ x: 0, y: 0 });
        if (hoveredRoot || hoveredBass) {
          setMusicState({ hoveredRoot: null, hoveredBass: null });
        }
      }
    } else {
      setParallax({ x: 0, y: 0 });
      if (hoveredRoot || hoveredBass) {
        setMusicState({ hoveredRoot: null, hoveredBass: null });
      }
    }
  }, [
    hand,
    isTracking,
    mode,
    currentScale,
    currentKey,
    snapToScale,
    setMusicState,
    hoveredRoot,
    hoveredBass,
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
      className="absolute z-30 pointer-events-none drop-shadow-2xl transition-all duration-300 ease-out"
      style={{ 
        top: '50%', 
        left: mode === 'Chord' ? '30%' : '50%',
        transform: `translate(calc(-50% + ${parallax.x}px), calc(-50% + ${parallax.y}px))` 
      }}
    >
      <svg ref={svgRef} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* Holographic Concentric Rings */}
        <g style={{ transformOrigin: 'center' }} className="animate-spin-slow opacity-40">
          <circle cx={CENTER} cy={CENTER} r={BASS_RADIUS + 15} fill="none" stroke="var(--color-primary)" strokeWidth="1.5" strokeDasharray="4 12" />
        </g>
        <g style={{ transformOrigin: 'center', animationDirection: 'reverse', animationDuration: '30s' }} className="animate-spin-slow opacity-30">
          <circle cx={CENTER} cy={CENTER} r={BASS_RADIUS + 25} fill="none" stroke="var(--color-secondary)" strokeWidth="0.5" strokeDasharray="20 10 5 10" />
        </g>
        <circle cx={CENTER} cy={CENTER} r={BASS_RADIUS} fill="rgba(3,3,5,0.6)" stroke="var(--color-metal)" strokeWidth="1" />
        
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
              ? 'scale-[1.03] transition-all duration-150 drop-shadow-[0_0_20px_var(--color-primary-glow)]'
              : 'animate-breathe transition-all duration-500 opacity-60';
            const bassClass = isBassActive
              ? 'scale-[1.02] transition-all duration-150 drop-shadow-[0_0_15px_var(--color-highlight)]'
              : 'animate-breathe transition-all duration-500 opacity-20';

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
                  <g className={bassClass} style={{ transformOrigin: '0 0' }}>
                    <path d={bassWedge} fill={bassFill} stroke={bassStroke} strokeWidth="2" />
                  </g>
                  <g className={rootClass} style={{ transformOrigin: '0 0' }}>
                    <path d={rootWedge} fill={rootFill} stroke={rootStroke} strokeWidth="2" />
                  </g>
                </g>
                {/* Labels */}
                <text
                  x={rx}
                  y={ry}
                  fill={isRootActive ? "white" : "var(--color-primary-glow)"}
                  fontSize="14"
                  fontWeight="bold"
                  letterSpacing="2"
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  opacity={isRootActive ? 1 : 0.6}
                  className="pointer-events-none"
                  style={{ textShadow: isRootActive ? '0 0 10px white' : 'none' }}
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
                    style={{ textShadow: isBassActive ? '0 0 5px white' : 'none' }}
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
