import { useEffect, useState, useMemo, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useSongStore } from '../store/songStore';
import { useMusicStore } from '../store/musicState';
import { formatChordName } from '../music/enharmonics';

const SIZE = 420;
const CENTER = 210;
const OUTER_R = 175;
const INNER_R = 65;
const GAP_DEG = 3; // gap between wedges in degrees

// ── SVG wedge helper (self-contained, correct 3-param signature) ──────────────
function makeWedgePath(
  innerR: number,
  outerR: number,
  startDeg: number,
  endDeg: number
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const s = toRad(startDeg);
  const e = toRad(endDeg);
  const cos = Math.cos;
  const sin = Math.sin;
  const large = endDeg - startDeg > 180 ? 1 : 0;

  const x1 = outerR * cos(s), y1 = outerR * sin(s);
  const x2 = outerR * cos(e), y2 = outerR * sin(e);
  const x3 = innerR * cos(e), y3 = innerR * sin(e);
  const x4 = innerR * cos(s), y4 = innerR * sin(s);

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

// ── Song HUD Strip (section timeline) ─────────────────────────────────────────
function SongHUD({
  sections,
  activeSectionIndex,
  onSelect,
}: {
  sections: { name: string; colorTag: string }[];
  activeSectionIndex: number;
  onSelect: (i: number) => void;
}) {
  const song = useSongStore(s => s.songs.find(x => x.id === s.activeSongId));

  return (
    <div
      className="absolute pointer-events-auto"
      style={{ top: 'calc(50% - 260px)', left: '50%', transform: 'translateX(-50%)' }}
    >
      {/* Song title */}
      <div className="text-center mb-2">
        <span className="text-[9px] tracking-[0.35em] uppercase text-[var(--color-primary-glow)] opacity-70 font-bold">
          ♪ Song Mode — {song?.name ?? '—'}
        </span>
      </div>

      {/* Section pills */}
      <div className="flex items-center gap-1.5">
        {sections.map((sec, i) => {
          const isActive = i === activeSectionIndex;
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className="relative px-3 py-1 rounded-full text-[9px] font-bold tracking-widest uppercase transition-all duration-200 pointer-events-auto"
              style={{
                border: `1px solid ${sec.colorTag}${isActive ? 'ff' : '44'}`,
                background: isActive ? `${sec.colorTag}22` : 'transparent',
                color: isActive ? sec.colorTag : '#6E7C9C',
                boxShadow: isActive ? `0 0 12px ${sec.colorTag}55` : 'none',
              }}
            >
              {sec.name}
              {isActive && (
                <span
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: sec.colorTag }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Keyboard hint */}
      <div className="text-center mt-2 opacity-30">
        <span className="text-[8px] tracking-widest text-white font-mono">
          ← → ARROW KEYS TO NAVIGATE
        </span>
      </div>
    </div>
  );
}

// ── Main SongPalette ───────────────────────────────────────────────────────────
export function SongPalette() {
  const hands = useHandStore(s => s.smoothedHands);
  const isTracking = useHandStore(s => s.isTracking);
  const mode = useMusicStore(s => s.mode);
  const setMusicState = useMusicStore(s => s.setMusicState);

  const songs = useSongStore(s => s.songs);
  const activeSongId = useSongStore(s => s.activeSongId);
  const activeSectionIndex = useSongStore(s => s.activeSectionIndex);
  const setActiveSection = useSongStore(s => s.setActiveSection);

  const activeSong = useMemo(
    () => songs.find(s => s.id === activeSongId),
    [songs, activeSongId]
  );
  const activeSection = activeSong?.sections[activeSectionIndex];

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const prevHoveredRef = useRef<number | null>(null);

  // ── Hand → slice mapping ──
  useEffect(() => {
    if (mode !== 'Song' || !activeSection || activeSection.chords.length === 0) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    const hand = hands[0];
    if (!isTracking || !hand) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    // Use indexTipPosition for precision (same as RootWheel)
    const { x: tipX, y: tipY } = hand.indexTipPosition;
    const dx = tipX - 0.5;
    const dy = tipY - 0.5;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.08) {
      setHoveredIndex(null);
      setParallax({ x: 0, y: 0 });
      return;
    }

    setParallax({ x: dx * 60, y: dy * 60 });

    // atan2(x, -y) gives 0 = top, clockwise positive
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;

    const numSlices = activeSection.chords.length;
    const sliceAngle = (2 * Math.PI) / numSlices;

    // Index 0 is at top-center. Rotate by half a slice so 0 is centered.
    let adj = angle + sliceAngle / 2;
    if (adj >= 2 * Math.PI) adj -= 2 * Math.PI;

    const idx = Math.floor(adj / sliceAngle) % numSlices;
    setHoveredIndex(idx);
  }, [hands, isTracking, mode, activeSection]);

  // ── Sync hovered chord → music store (for audio) ──
  useEffect(() => {
    if (mode !== 'Song') return;
    if (hoveredIndex === prevHoveredRef.current) return;
    prevHoveredRef.current = hoveredIndex;

    if (activeSection && hoveredIndex !== null) {
      const chord = activeSection.chords[hoveredIndex];
      if (chord) {
        setMusicState({
          hoveredRoot: chord.root,
          hoveredQuality: chord.quality,
          hoveredBass: chord.bass ?? null,
        });
        return;
      }
    }
    setMusicState({ hoveredRoot: null, hoveredQuality: null, hoveredBass: null });
  }, [hoveredIndex, mode, activeSection, setMusicState]);

  // ── Clear state when leaving Song Mode ──
  useEffect(() => {
    if (mode !== 'Song') {
      setMusicState({ hoveredRoot: null, hoveredQuality: null, hoveredBass: null });
    }
  }, [mode, setMusicState]);

  if (mode !== 'Song' || !activeSection) return null;

  const chords = activeSection.chords;
  const numSlices = chords.length;
  if (numSlices === 0) return null;

  const sectionKey = activeSection.key ?? activeSong?.defaultKey ?? 'C';
  const sectionColor = activeSection.colorTag ?? '#9D4EDD';
  const sliceDeg = 360 / numSlices;

  return (
    <>
      {/* Section timeline HUD above the wheel */}
      <SongHUD
        sections={(activeSong?.sections ?? []).map(s => ({
          name: s.name,
          colorTag: s.colorTag,
        }))}
        activeSectionIndex={activeSectionIndex}
        onSelect={setActiveSection}
      />

      {/* The chord palette wheel */}
      <div
        className="absolute z-30 pointer-events-none"
        style={{
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${parallax.x}px), calc(-50% + ${parallax.y}px))`,
          transition: 'transform 0.08s ease-out',
        }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Decorative outer ring */}
          <circle
            cx={CENTER} cy={CENTER} r={OUTER_R + 14}
            fill="none"
            stroke={sectionColor}
            strokeWidth="0.5"
            opacity="0.25"
            strokeDasharray="6 10"
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 ${CENTER} ${CENTER}`}
              to={`360 ${CENTER} ${CENTER}`}
              dur="30s"
              repeatCount="indefinite"
            />
          </circle>

          {/* Dark background disk */}
          <circle
            cx={CENTER} cy={CENTER} r={OUTER_R + 4}
            fill="rgba(3,3,8,0.88)"
            stroke={sectionColor}
            strokeWidth="1"
            opacity="0.6"
          />

          {/* Inner hub: section name + optional key-change badge */}
          {/* Dark hub circle */}
          <circle
            cx={CENTER} cy={CENTER} r={INNER_R - 2}
            fill="rgba(3,3,8,0.95)"
          />

          {activeSection.key ? (
            /* Key change layout: name on top, ↕ divider, KEY badge */
            <>
              <text
                x={CENTER} y={CENTER - 10}
                textAnchor="middle"
                fill={sectionColor}
                fontSize="9"
                fontWeight="bold"
                letterSpacing="3"
                opacity="0.95"
              >
                {activeSection.name.toUpperCase()}
              </text>
              {/* thin divider line */}
              <line
                x1={CENTER - 20} y1={CENTER - 1}
                x2={CENTER + 20} y2={CENTER - 1}
                stroke={sectionColor} strokeWidth="0.5" opacity="0.3"
              />
              {/* KEY CHANGE badge */}
              <rect
                x={CENTER - 22} y={CENTER + 4}
                width={44} height={14}
                rx={7}
                fill="#F9A82622"
                stroke="#F9A826"
                strokeWidth="0.8"
              />
              <text
                x={CENTER} y={CENTER + 12}
                textAnchor="middle"
                fill="#F9A826"
                fontSize="8"
                fontWeight="bold"
                letterSpacing="1.5"
              >
                ♪ KEY {activeSection.key}
              </text>
            </>
          ) : (
            /* Normal layout: just section name centered */
            <text
              x={CENTER} y={CENTER + 4}
              textAnchor="middle"
              fill={sectionColor}
              fontSize="10"
              fontWeight="bold"
              letterSpacing="3"
              opacity="0.9"
            >
              {activeSection.name.toUpperCase()}
            </text>
          )}

          {/* Wedges */}
          <g transform={`translate(${CENTER}, ${CENTER})`}>
            {chords.map((chord, index) => {
              const isActive = index === hoveredIndex;

              // FIX: subtract sliceDeg/2 so index 0 is CENTERED at top (12 o'clock).
              // This aligns visual wedge positions with the hand-angle selection math,
              // which uses `angle + sliceAngle/2` to make index 0 activate at angle=0 (top).
              const startDeg = index * sliceDeg - 90 - sliceDeg / 2 + GAP_DEG / 2;
              const endDeg = (index + 1) * sliceDeg - 90 - sliceDeg / 2 - GAP_DEG / 2;

              const pathD = makeWedgePath(INNER_R, OUTER_R, startDeg, endDeg);

              // Text at midpoint of the wedge arc
              const midDeg = index * sliceDeg - 90; // index 0 → -90° → top (cos=-0, sin=-1)
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
                    style={{
                      transition: 'fill 0.15s ease, stroke 0.15s ease',
                      filter: isActive ? `drop-shadow(0 0 10px ${sectionColor})` : 'none',
                    }}
                  />
                  <text
                    x={tx}
                    y={ty + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={isActive ? '#ffffff' : sectionColor}
                    fontSize={isActive ? '16' : '14'}
                    fontWeight="bold"
                    letterSpacing="0.5"
                    opacity={isActive ? 1 : 0.65}
                    style={{
                      transition: 'font-size 0.1s, opacity 0.15s',
                      filter: isActive ? `drop-shadow(0 0 8px ${sectionColor})` : 'none',
                      pointerEvents: 'none',
                    }}
                  >
                    {chordLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </>
  );
}
