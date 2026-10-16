import { useEffect, useState, useMemo, useRef } from 'react';
import { useHandStore } from '../store/handState';
import { useSongStore } from '../store/songStore';
import { useMusicStore } from '../store/musicState';
import type { EffectsState } from '../store/musicState';
import { useLooperStore } from '../store/looperState';
import { formatChordName } from '../music/enharmonics';
import { getScreenHands } from '../tracking/handUtils';
import type { SongSection } from '../store/songStore';

const SIZE = 420;
const CENTER = 210;
const OUTER_R = 195;
const INNER_R = 50;
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
  songName,
}: {
  sections: { name: string; colorTag?: string }[];
  activeSectionIndex: number;
  onSelect: (idx: number) => void;
  songName: string;
}) {
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = activeButtonRef.current;
    const ribbon = button?.parentElement;
    if (!button || !ribbon) return;
    // Scroll only the ribbon, keeping the stage and camera stationary.
    const left = button.offsetLeft - ribbon.offsetLeft;
    if (left < ribbon.scrollLeft) ribbon.scrollLeft = left;
    else if (left + button.offsetWidth > ribbon.scrollLeft + ribbon.clientWidth) {
      ribbon.scrollLeft = left + button.offsetWidth - ribbon.clientWidth;
    }
  }, [activeSectionIndex, sections]);

  return (
    <header role="region" aria-label="Song sections navigation"
      className="kasync-song-hud absolute left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="kasync-song-console">
        <div className="kasync-song-identity">
          <span className="kasync-song-badge"><span aria-hidden="true" />Song mode</span>
          <span className="kasync-song-title" title={songName}>{songName}</span>
        </div>
        <div className="kasync-song-actions">
          <span className="kasync-song-shortcuts" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd> Sections</span>
          <button type="button" aria-label="Open song library and editor"
            className="kasync-song-edit"
            onClick={e => { e.stopPropagation(); useSongStore.getState().toggleSongPanel(); }}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="m16 3 5 5L9 20l-6 1 1-6L16 3Z" /><path d="m14 5 5 5" />
            </svg>
            Edit song
          </button>
        </div>
      </div>
      {sections.length > 0 && (
        <nav aria-label="Section selector" className="kasync-song-sections">
          {sections.map((sec, i) => (
            <button key={`${i}-${sec.name}`} type="button"
              ref={i === activeSectionIndex ? activeButtonRef : undefined}
              aria-current={i === activeSectionIndex ? 'step' : undefined}
              className="kasync-song-section"
              style={{ '--section-color': sec.colorTag ?? '#9D4EDD' } as React.CSSProperties}
              onClick={e => { e.stopPropagation(); onSelect(i); }}>
              {sec.name}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}

// ── ChordWheel ─────────────────────────────────────────────────────────────────
function ChordWheel({
  activeSection,
  sectionKey,
  sectionColor,
}: {
  activeSection: SongSection;
  sectionKey: string;
  sectionColor: string;
}) {
  const setMusicState = useMusicStore(s => s.setMusicState);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const prevHoveredRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutCache = useRef({ width: 0, height: 0, left: 0, top: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      layoutCache.current = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    if (!activeSection || activeSection.chords.length === 0) {
      setHoveredIndex(null);
      prevHoveredRef.current = null;
      setMusicState({ hoveredRoot: null, hoveredQuality: null, hoveredBass: null });
      if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const unsub = useHandStore.subscribe((state) => {
      const hands = state.smoothedHands;
      const { leftHand } = getScreenHands(hands);
      const hand = leftHand ?? (hands.length === 1 ? hands[0] : undefined);
      if (!state.isTracking || !hand) {
        setHoveredIndex(null);
        prevHoveredRef.current = null;
        setMusicState(prev => prev.hoveredRoot === null && prev.hoveredQuality === null && prev.hoveredBass === null
          ? prev
          : { hoveredRoot: null, hoveredQuality: null, hoveredBass: null });
        if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
        return;
      }

      let rect = layoutCache.current;
      if (rect.width === 0 && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        layoutCache.current = { width: r.width, height: r.height, left: r.left, top: r.top };
        rect = layoutCache.current;
      }
      if (rect.width === 0) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const handX = hand.indexTipPosition.x * window.innerWidth;
      const handY = hand.indexTipPosition.y * window.innerHeight;

      const dx = handX - centerX;
      const dy = handY - centerY;
      const dist = Math.hypot(dx, dy);

      const scale = rect.width / SIZE;
      if (dist < INNER_R * scale || dist > (OUTER_R + 14) * scale) {
        setHoveredIndex(null);
        prevHoveredRef.current = null;
        setMusicState(prev => prev.hoveredRoot === null && prev.hoveredQuality === null && prev.hoveredBass === null
          ? prev
          : { hoveredRoot: null, hoveredQuality: null, hoveredBass: null });
        if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
        return;
      }

      if (containerRef.current) {
        const maxP = 20;
        const px = Math.max(-maxP, Math.min(maxP, (dx / 200) * maxP));
        const py = Math.max(-maxP, Math.min(maxP, (dy / 200) * maxP));
        containerRef.current.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      }

      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += 2 * Math.PI;

      const numSlices = activeSection.chords.length;
      const sliceAngle = (2 * Math.PI) / numSlices;

      let adj = angle + sliceAngle / 2;
      if (adj >= 2 * Math.PI) adj -= 2 * Math.PI;

      const idx = Math.floor(adj / sliceAngle) % numSlices;
      const chord = activeSection.chords[idx];
      if (chord && idx !== prevHoveredRef.current) {
        setMusicState(prev => (
          prev.hoveredRoot === chord.root &&
          prev.hoveredQuality === chord.quality &&
          prev.hoveredBass === (chord.bass ?? null)
        ) ? prev : {
          hoveredRoot: chord.root,
          hoveredQuality: chord.quality,
          hoveredBass: chord.bass ?? null,
        });
      }
      prevHoveredRef.current = idx;
      setHoveredIndex(idx);
    });

    return unsub;
  }, [activeSection, setMusicState]);

  const chords = activeSection?.chords ?? [];
  const numSlices = chords.length;
  if (numSlices === 0) return null;
  const sliceDeg = 360 / numSlices;

  return (
    <div
      ref={containerRef}
      className="kasync-song-wheel kasync-performance-wheel kasync-performance-wheel--left absolute z-30 pointer-events-none"
      style={{
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="kasync-wheel-svg">
        <circle
          cx={CENTER} cy={CENTER} r={OUTER_R + 10}
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
          {chords.map((chord, index: number) => {
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
                  fill={isActive ? '#ffffff' : sectionColor} fontSize={isActive ? '17' : '15'} fontWeight="bold" letterSpacing="0.5" opacity={isActive ? 1 : 0.7}
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
  const setMusicState = useMusicStore(s => s.setMusicState);
  const armedTrack = useLooperStore(s => s.tracks.find(t => t.isArmed));
  const effects = armedTrack?.effects;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const prevHoveredRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const layoutCache = useRef({ width: 0, height: 0, left: 0, top: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      layoutCache.current = { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const unsub = useHandStore.subscribe((state) => {
      const hands = state.smoothedHands;
      const { rightHand: hand } = getScreenHands(hands);
      if (!state.isTracking || !hand) {
        setHoveredIndex(null);
        prevHoveredRef.current = null;
        setMusicState(prev => prev.hoveredEffect === null ? prev : { hoveredEffect: null });
        if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
        return;
      }

      let rect = layoutCache.current;
      if (rect.width === 0 && containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        layoutCache.current = { width: r.width, height: r.height, left: r.left, top: r.top };
        rect = layoutCache.current;
      }
      if (!rect || rect.width === 0) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const handX = hand.indexTipPosition.x * window.innerWidth;
      const handY = hand.indexTipPosition.y * window.innerHeight;

      const dx = handX - centerX;
      const dy = handY - centerY;
      const dist = Math.hypot(dx, dy);

      const scale = rect.width / SIZE;
      if (dist < INNER_R * scale || dist > (OUTER_R + 14) * scale) {
        setHoveredIndex(null);
        prevHoveredRef.current = null;
        setMusicState(prev => prev.hoveredEffect === null ? prev : { hoveredEffect: null });
        if (containerRef.current) containerRef.current.style.transform = 'translate(-50%, -50%)';
        return;
      }

      if (containerRef.current) {
        const maxP = 20;
        const px = Math.max(-maxP, Math.min(maxP, (dx / 200) * maxP));
        const py = Math.max(-maxP, Math.min(maxP, (dy / 200) * maxP));
        containerRef.current.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      }

      let angle = Math.atan2(dx, -dy);
      if (angle < 0) angle += 2 * Math.PI;

      const numSlices = FX_LIST.length;
      const sliceAngle = (2 * Math.PI) / numSlices;

      let adj = angle + sliceAngle / 2;
      if (adj >= 2 * Math.PI) adj -= 2 * Math.PI;

      const idx = Math.floor(adj / sliceAngle) % numSlices;
      if (idx !== prevHoveredRef.current) {
        const effect = FX_LIST[idx].id;
        setMusicState(prev => prev.hoveredEffect === effect ? prev : { hoveredEffect: effect });
      }
      prevHoveredRef.current = idx;
      setHoveredIndex(idx);
    });

    return unsub;
  }, [setMusicState]);

  const numSlices = FX_LIST.length;
  const sliceDeg = 360 / numSlices;

  return (
    <div
      ref={containerRef}
      className="kasync-song-wheel kasync-performance-wheel kasync-performance-wheel--right absolute z-30 pointer-events-none"
      style={{
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`} className="kasync-wheel-svg">
        <circle
          cx={CENTER} cy={CENTER} r={OUTER_R + 10}
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
                  fill={isActive || isEnabled ? '#ffffff' : '#6E7C9C'} fontSize={isActive ? '15' : '13'} fontWeight="bold" letterSpacing="1" opacity={isActive || isEnabled ? 1 : 0.7}
                  style={{ transition: 'font-size 0.1s, opacity 0.15s', filter: isActive || isEnabled ? `drop-shadow(0 0 8px ${fx.color})` : 'none', pointerEvents: 'none' }}
                >
                  {fx.label}
                </text>
                {isEnabled && (
                  <circle cx={tx} cy={ty + 15} r="3" fill={fx.color} opacity="0.8" />
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

  // Fallback section for when no song is loaded — always have something to play
  const fallbackSection = useMemo<SongSection>(() => ({
    id: 'fallback',
    name: 'FREE',
    colorTag: '#9D4EDD',
    repeatCount: 1,
    chords: [
      { root: 'C', quality: 'maj' },
      { root: 'G', quality: 'maj' },
      { root: 'A', quality: 'min' },
      { root: 'F', quality: 'maj' },
      { root: 'D', quality: 'min' },
      { root: 'E', quality: 'min' },
    ],
  }), []);

  if (mode !== 'Song') return null;

  const effectiveSection = activeSection ?? fallbackSection;
  const sectionKey = effectiveSection.key ?? activeSong?.defaultKey ?? 'C';
  const sectionColor = effectiveSection.colorTag ?? '#9D4EDD';

  return (
    <>
      <SongHUD
        sections={(activeSong?.sections ?? []).map(s => ({
          name: s.name,
          colorTag: s.colorTag,
        }))}
        activeSectionIndex={activeSectionIndex}
        onSelect={setActiveSection}
        songName={activeSong?.name ?? 'NEW SONG'}
      />
      <ChordWheel activeSection={effectiveSection} sectionKey={sectionKey} sectionColor={sectionColor} />
      <FxWheel />
    </>
  );
}
