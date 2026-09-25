import { useEffect, useState, useMemo, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useSongStore } from '../store/songStore';
import { useMusicStore } from '../store/musicState';
import type { EffectsState } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { formatChordName } from '../music/enharmonics';

const SIZE = 420;
const CENTER = 210;
const OUTER_R = 175;
const INNER_R = 65;
const GAP_DEG = 3;

function makeWedgePath(
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const startRad = toRad(startDeg);
  const endRad = toRad(endDeg);

  const x1 = outerR * Math.cos(startRad);
  const y1 = outerR * Math.sin(startRad);
  const x2 = outerR * Math.cos(endRad);
  const y2 = outerR * Math.sin(endRad);

  const x3 = innerR * Math.cos(endRad);
  const y3 = innerR * Math.sin(endRad);
  const x4 = innerR * Math.cos(startRad);
  const y4 = innerR * Math.sin(startRad);

  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return `
    M ${x1} ${y1}
    A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}
    L ${x3} ${y3}
    A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}
    Z
  `;
}

// ── SongHUD ──────────────────────────────────────────────────────────────────
function SongHUD({
  sections,
  activeSectionIndex,
  onSelect,
}: {
  sections: { name: string; colorTag?: string }[];
  activeSectionIndex: number;
  onSelect: (idx: number) => void;
}) {
  return (
    <div className="absolute top-[15%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 flex flex-col items-center">
      {/* Current song section info */}
      <div className="mb-6 flex flex-col items-center">
        <span className="text-[10px] tracking-[0.3em] font-mono text-[#F78FB3] uppercase opacity-90 drop-shadow-[0_0_8px_rgba(247,143,179,0.5)]">
          ♪ SONG MODE — {useSongStore.getState().songs.find(s => s.id === useSongStore.getState().activeSongId)?.title ?? 'NEW SONG'}
        </span>
      </div>

      <div className="flex items-center gap-3 bg-[#030308]/80 px-4 py-2 rounded-full border border-white/5 backdrop-blur-md">
        {sections.map((sec, i) => {
          const isActive = i === activeSectionIndex;
          const color = sec.colorTag ?? '#9D4EDD';
          return (
            <button
              key={`${i}-${sec.name}`}
              onClick={(e) => { e.stopPropagation(); onSelect(i); }}
              className={`
                relative px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all
                ${isActive ? 'text-white' : 'text-white/40 hover:text-white/70'}
              `}
              style={{
                border: isActive ? `1px solid ${color}` : '1px solid transparent',
                boxShadow: isActive ? `0 0 15px ${color}40, inset 0 0 8px ${color}20` : 'none'
              }}
            >
              {sec.name}
              {isActive && (
                <div
                  className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2 gap-4">
        <span className="text-[8px] tracking-widest text-white font-mono opacity-20">
          ← → ARROW KEYS
        </span>
        <button
          className="pointer-events-auto text-[8px] tracking-[0.25em] uppercase px-2 py-1 rounded border border-white/10 text-[#6E7C9C] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)]/40 transition-all"
          onClick={e => { e.stopPropagation(); useSongStore.getState().toggleSongPanel(); }}
        >
          ✏️ Edit Song
        </button>
      </div>
    </div>
  );
}

// ── ChordWheel ─────────────────────────────────────────────────────────────────
function ChordWheel({
  activeSection,
  sectionKey,
  sectionColor,
}: {
  activeSection: any;
  sectionKey: string;
  sectionColor: string;
}) {
  const hands = useHandStore(s => s.smoothedHands);
  const isTracking = useHandStore(s => s.isTracking);
  const setMusicState = useMusicStore(s => s.setMusicState);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const prevHoveredRef = useRef<number | null>(null);

  useEffect(() => {
    if (!activeSection || activeSection.chords.length === 0) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    const hand = hands[0]; // Left hand maps to ChordWheel
    if (!isTracking || !hand) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    const { x: tipX, y: tipY } = hand.indexTipPosition;
    // Remap hand X (0-0.5 is left side of screen) to center of the wheel (which is at 25% of screen width)
    const normalizedX = tipX * 2; 
    const dx = normalizedX - 0.5;
    const dy = tipY - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.08) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    setParallax({ x: dx * 60, y: dy * 60 });

    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;

    const numSlices = activeSection.chords.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    let adj = angle + sliceAngle / 2;
    if (adj >= 2 * Math.PI) adj -= 2 * Math.PI;

    const idx = Math.floor(adj / sliceAngle) % numSlices;
    setHoveredIndex(idx);
  }, [hands, isTracking, activeSection]);

  useEffect(() => {
    if (hoveredIndex === prevHoveredRef.current) return;
    prevHoveredRef.current = hoveredIndex;

    if (activeSection && hoveredIndex !== null) {
      const chord = activeSection.chords[hoveredIndex];
      if (chord) {
        setMusicState(prev => {
          if (prev.hoveredRoot === chord.root && prev.hoveredQuality === chord.quality && prev.hoveredBass === (chord.bass ?? null)) return prev;
          return {
            hoveredRoot: chord.root,
            hoveredQuality: chord.quality,
            hoveredBass: chord.bass ?? null,
          };
        });
        return;
      }
    }
    setMusicState(prev => {
      if (prev.hoveredRoot === null && prev.hoveredQuality === null && prev.hoveredBass === null) return prev;
      return { hoveredRoot: null, hoveredQuality: null, hoveredBass: null };
    });
  }, [hoveredIndex, activeSection, setMusicState]);

  const chords = activeSection?.chords ?? [];
  const numSlices = chords.length;
  if (numSlices === 0) return null;
  const sliceDeg = 360 / numSlices;

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{
        top: '50%',
        left: '25%', // Left side
        transform: `translate(calc(-50% + ${parallax.x}px), calc(-50% + ${parallax.y}px))`,
        transition: 'transform 0.08s ease-out',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[50vh] h-[50vh] max-w-[420px] max-h-[420px]">
        <circle
          cx={CENTER} cy={CENTER} r={OUTER_R + 14}
          fill="none" stroke={sectionColor} strokeWidth="0.5" opacity="0.25" strokeDasharray="6 10"
        >
          <animateTransform
            attributeName="transform" type="rotate"
            from={`0 ${CENTER} ${CENTER}`} to={`360 ${CENTER} ${CENTER}`}
            dur="30s" repeatCount="indefinite"
          />
        </circle>
        <circle cx={CENTER} cy={CENTER} r={OUTER_R + 4} fill="rgba(3,3,8,0.88)" stroke={sectionColor} strokeWidth="1" opacity="0.6" />
        <circle cx={CENTER} cy={CENTER} r={INNER_R - 2} fill="rgba(3,3,8,0.95)" />

        {activeSection.key ? (
          <>
            <text x={CENTER} y={CENTER - 10} textAnchor="middle" fill={sectionColor} fontSize="9" fontWeight="bold" letterSpacing="3" opacity="0.95">
              {activeSection.name.toUpperCase()}
            </text>
            <line x1={CENTER - 20} y1={CENTER - 1} x2={CENTER + 20} y2={CENTER - 1} stroke={sectionColor} strokeWidth="0.5" opacity="0.3" />
            <rect x={CENTER - 22} y={CENTER + 4} width={44} height={14} rx={7} fill="#F9A82622" stroke="#F9A826" strokeWidth="0.8" />
            <text x={CENTER} y={CENTER + 12} textAnchor="middle" fill="#F9A826" fontSize="8" fontWeight="bold" letterSpacing="1.5">
              ♪ KEY {activeSection.key}
            </text>
          </>
        ) : (
          <text x={CENTER} y={CENTER + 4} textAnchor="middle" fill={sectionColor} fontSize="10" fontWeight="bold" letterSpacing="3" opacity="0.9">
            {activeSection.name.toUpperCase()}
          </text>
        )}

        <g transform={`translate(${CENTER}, ${CENTER})`}>
          {chords.map((chord: any, index: number) => {
            const isActive = index === hoveredIndex;
            const startDeg = index * sliceDeg - 90 - sliceDeg / 2 + GAP_DEG / 2;
            const endDeg = (index + 1) * sliceDeg - 90 - sliceDeg / 2 - GAP_DEG / 2;
            const pathD = makeWedgePath(INNER_R, OUTER_R, startDeg, endDeg);
            const midDeg = index * sliceDeg - 90;
            const midRad = (midDeg * Math.PI) / 180;
            const midR = (INNER_R + OUTER_R) / 2;
            const tx = midR * Math.cos(midRad);
            const ty = midR * Math.sin(midRad);
            const chordLabel = formatChordName(chord.root, chord.quality, chord.bass ?? null, sectionKey);

            return (
              <g key={`${index}-${chord.root}-${chord.quality}`}>
                <path
                  d={pathD}
                  fill={isActive ? `${sectionColor}55` : 'rgba(20,20,35,0.85)'}
                  stroke={isActive ? sectionColor : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isActive ? 1.5 : 0.8}
                  style={{ transition: 'fill 0.15s ease, stroke 0.15s ease', filter: isActive ? `drop-shadow(0 0 10px ${sectionColor})` : 'none' }}
                />
                <text
                  x={tx} y={ty + 1} textAnchor="middle" dominantBaseline="middle"
                  fill={isActive ? '#ffffff' : sectionColor} fontSize={isActive ? '16' : '14'} fontWeight="bold" letterSpacing="0.5" opacity={isActive ? 1 : 0.65}
                  style={{ transition: 'font-size 0.1s, opacity 0.15s', filter: isActive ? `drop-shadow(0 0 8px ${sectionColor})` : 'none', pointerEvents: 'none' }}
                >
                  {chordLabel}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── FxWheel ────────────────────────────────────────────────────────────────────
const FX_LIST: { id: keyof EffectsState, label: string, color: string }[] = [
  { id: 'reverb', label: 'REVERB', color: '#4ADE80' },
  { id: 'delay', label: 'DELAY', color: '#60A5FA' },
  { id: 'chorus', label: 'CHORUS', color: '#C084FC' },
  { id: 'bitcrusher', label: 'CRUSH', color: '#F87171' },
  { id: 'sustain', label: 'SUSTAIN', color: '#FBBF24' },
];

function FxWheel() {
  const hands = useHandStore(s => s.smoothedHands);
  const isTracking = useHandStore(s => s.isTracking);
  const setMusicState = useMusicStore(s => s.setMusicState);
  const armedTrack = useLooperStore(s => s.tracks.find(t => t.isArmed));
  const effects = armedTrack?.effects;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const prevHoveredRef = useRef<number | null>(null);

  useEffect(() => {
    const hand = hands[1]; // Right hand maps to FxWheel
    if (!isTracking || !hand) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    const { x: tipX, y: tipY } = hand.indexTipPosition;
    // Remap hand X (0.5-1.0 is right side of screen) to center of the wheel (which is at 75% of screen width)
    const normalizedX = (tipX - 0.5) * 2; 
    const dx = normalizedX - 0.5;
    const dy = tipY - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.08) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    setParallax({ x: dx * 60, y: dy * 60 });

    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;

    const numSlices = FX_LIST.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    let adj = angle + sliceAngle / 2;
    if (adj >= 2 * Math.PI) adj -= 2 * Math.PI;

    const idx = Math.floor(adj / sliceAngle) % numSlices;
    setHoveredIndex(idx);
  }, [hands, isTracking]);

  useEffect(() => {
    if (hoveredIndex === prevHoveredRef.current) return;
    prevHoveredRef.current = hoveredIndex;

    if (hoveredIndex !== null) {
      setMusicState(prev => prev.hoveredEffect === FX_LIST[hoveredIndex].id ? prev : { hoveredEffect: FX_LIST[hoveredIndex].id });
    } else {
      setMusicState(prev => prev.hoveredEffect === null ? prev : { hoveredEffect: null });
    }
  }, [hoveredIndex, setMusicState]);

  const numSlices = FX_LIST.length;
  const sliceDeg = 360 / numSlices;

  return (
    <div
      className="absolute z-30 pointer-events-none"
      style={{
        top: '50%',
        left: '75%', // Right side
        transform: `translate(calc(-50% + ${parallax.x}px), calc(-50% + ${parallax.y}px))`,
        transition: 'transform 0.08s ease-out',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-[50vh] h-[50vh] max-w-[420px] max-h-[420px]">
        <circle
          cx={CENTER} cy={CENTER} r={OUTER_R + 14}
          fill="none" stroke="#6E7C9C" strokeWidth="0.5" opacity="0.25" strokeDasharray="6 10"
        >
          <animateTransform
            attributeName="transform" type="rotate"
            from={`360 ${CENTER} ${CENTER}`} to={`0 ${CENTER} ${CENTER}`}
            dur="40s" repeatCount="indefinite"
          />
        </circle>
        <circle cx={CENTER} cy={CENTER} r={OUTER_R + 4} fill="rgba(3,3,8,0.88)" stroke="#6E7C9C" strokeWidth="1" opacity="0.6" />
        <circle cx={CENTER} cy={CENTER} r={INNER_R - 2} fill="rgba(3,3,8,0.95)" />

        <text x={CENTER} y={CENTER + 4} textAnchor="middle" fill="#6E7C9C" fontSize="10" fontWeight="bold" letterSpacing="3" opacity="0.9">
          FX & CTL
        </text>

        <g transform={`translate(${CENTER}, ${CENTER})`}>
          {FX_LIST.map((fx, index) => {
            const isActive = index === hoveredIndex;
            const isEnabled = effects?.[fx.id] ?? false;
            
            const startDeg = index * sliceDeg - 90 - sliceDeg / 2 + GAP_DEG / 2;
            const endDeg = (index + 1) * sliceDeg - 90 - sliceDeg / 2 - GAP_DEG / 2;
            const pathD = makeWedgePath(INNER_R, OUTER_R, startDeg, endDeg);
            const midDeg = index * sliceDeg - 90;
            const midRad = (midDeg * Math.PI) / 180;
            const midR = (INNER_R + OUTER_R) / 2;
            const tx = midR * Math.cos(midRad);
            const ty = midR * Math.sin(midRad);

            return (
              <g key={fx.id}>
                <path
                  d={pathD}
                  fill={isActive ? `${fx.color}55` : isEnabled ? `${fx.color}22` : 'rgba(20,20,35,0.85)'}
                  stroke={isActive ? fx.color : isEnabled ? `${fx.color}88` : 'rgba(255,255,255,0.08)'}
                  strokeWidth={isActive ? 1.5 : isEnabled ? 1 : 0.8}
                  style={{ transition: 'fill 0.15s ease, stroke 0.15s ease', filter: isActive || isEnabled ? `drop-shadow(0 0 10px ${fx.color})` : 'none' }}
                />
                <text
                  x={tx} y={ty + 1} textAnchor="middle" dominantBaseline="middle"
                  fill={isActive || isEnabled ? '#ffffff' : '#6E7C9C'} fontSize={isActive ? '14' : '12'} fontWeight="bold" letterSpacing="1" opacity={isActive || isEnabled ? 1 : 0.65}
                  style={{ transition: 'font-size 0.1s, opacity 0.15s', filter: isActive || isEnabled ? `drop-shadow(0 0 8px ${fx.color})` : 'none', pointerEvents: 'none' }}
                >
                  {fx.label}
                </text>
                {isEnabled && (
                  <circle cx={tx} cy={ty + 14} r="3" fill={fx.color} opacity="0.8" />
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ── Main SongPalette ───────────────────────────────────────────────────────────
export function SongPalette() {
  const mode = useMusicStore(s => s.mode);
  
  const songs = useSongStore(s => s.songs);
  const activeSongId = useSongStore(s => s.activeSongId);
  const activeSectionIndex = useSongStore(s => s.activeSectionIndex);
  const setActiveSection = useSongStore(s => s.setActiveSection);

  const activeSong = useMemo(
    () => songs.find(s => s.id === activeSongId),
    [songs, activeSongId]
  );
  const activeSection = activeSong?.sections[activeSectionIndex];

  // ── Clear state when leaving Song Mode ──
  useEffect(() => {
    if (mode !== 'Song') {
      useMusicStore.getState().setMusicState({ hoveredRoot: null, hoveredQuality: null, hoveredBass: null, hoveredEffect: null });
    }
  }, [mode]);

  if (mode !== 'Song' || !activeSection) return null;

  const sectionKey = activeSection.key ?? activeSong?.defaultKey ?? 'C';
  const sectionColor = activeSection.colorTag ?? '#9D4EDD';

  return (
    <>
      <SongHUD
        sections={(activeSong?.sections ?? []).map(s => ({
          name: s.name,
          colorTag: s.colorTag,
        }))}
        activeSectionIndex={activeSectionIndex}
        onSelect={setActiveSection}
      />
      <ChordWheel activeSection={activeSection} sectionKey={sectionKey} sectionColor={sectionColor} />
      <FxWheel />
    </>
  );
}
