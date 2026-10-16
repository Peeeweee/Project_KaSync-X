import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useHandStore } from '../store/handState';
import { useLooperStore } from '../store/looperState';
import { useMusicStore } from '../store/musicState';
import { useVolumeGestureStore, volumeHandId } from '../store/volumeGesture';
import { dialDelta } from '../tracking/volumeDial';
import { openPalmPose, OpenPalmDialTracker } from '../tracking/openPalmDial';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useEffectDialStore } from '../store/effectDial';

const R = 267;
const ARC = 2 * Math.PI * R * 0.75;
const TICKS = Array.from({ length: 31 }, (_, i) => i);

export function VolumeRing({ kind = 'volume' }: { kind?: 'volume' | 'effects' }) {
  const mode = useMusicStore(s => s.mode);
  const volumePercent = useLooperStore(s => Math.round(s.masterVolume * 100));
  const effectPercent = useEffectDialStore(s => Math.round(s.level * 100));
  const percent = kind === 'volume' ? volumePercent : effectPercent;
  const ownerKey = kind === 'volume' ? 'owner' : 'effectOwner';
  const owner = useVolumeGestureStore(s => s[ownerKey]);
  const effectNames = useLooperStore(s => Object.entries(s.tracks.find(t => t.isArmed)?.effects ?? {})
    .filter(([name, enabled]) => enabled && name !== 'sustain').map(([name]) => name).join(' + '));
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const drag = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const measure = () => { box.current = element.getBoundingClientRect(); };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const tracker = new OpenPalmDialTracker();
    let wasReady = false;
    const unsubscribe = useHandStore.subscribe(state => {
      const rect = box.current;
      if (!rect.width || !rect.height) return;
      const radius = rect.width * R / 550;
      const hands = state.rawHands.length ? state.rawHands : state.smoothedHands;
      const current = kind === 'volume' ? useLooperStore.getState().masterVolume : useEffectDialStore.getState().level;
      const result = tracker.update(hands.map(hand => ({ id: volumeHandId(hand),
        pose: hand.isPinching ? null : openPalmPose(hand.landmarks, hand.imageYScale ?? 1,
          useTrackingSettingsStore.getState().mirrorCamera),
        x: (hand.palmPosition.x * window.innerWidth - rect.left - rect.width / 2) / radius,
        y: (hand.palmPosition.y * window.innerHeight - rect.top - rect.height / 2) / radius,
      })), current);
      if (wasReady !== result.ready) { wasReady = result.ready; setReady(result.ready); }
      if (useVolumeGestureStore.getState()[ownerKey] !== result.reserved) {
        if (kind === 'effects' && !result.reserved) useEffectDialStore.setState({ settledLevel: useEffectDialStore.getState().level });
        useVolumeGestureStore.setState({ [ownerKey]: result.reserved });
      }
      if (drag.current === null && result.owner && result.value !== current) {
        if (kind === 'volume') useLooperStore.getState().setMasterVolume(result.value);
        else useEffectDialStore.setState({ level: result.value });
      }
    });
    return () => {
      unsubscribe(); observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      useVolumeGestureStore.setState({ [ownerKey]: null });
      if (kind === 'effects') useEffectDialStore.setState({ settledLevel: useEffectDialStore.getState().level });
    };
  }, [mode, kind, ownerKey]);

  const pointerAngle = (e: PointerEvent<SVGCircleElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - rect.top - rect.height / 2, e.clientX - rect.left - rect.width / 2);
  };
  const setVolume = (value: number) => {
    const next = Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
    if (kind === 'volume') {
      if (next !== useLooperStore.getState().masterVolume) useLooperStore.getState().setMasterVolume(next);
    } else if (next !== useEffectDialStore.getState().level) {
      useEffectDialStore.setState({ level: next, ...(drag.current === null ? { settledLevel: next } : {}) });
    }
  };
  const keyDown = (e: KeyboardEvent<SVGCircleElement>) => {
    const value = kind === 'volume' ? useLooperStore.getState().masterVolume : useEffectDialStore.getState().level;
    const next = { ArrowUp: value + 0.02, ArrowRight: value + 0.02, ArrowDown: value - 0.02,
      ArrowLeft: value - 0.02, Home: 0, End: 1, PageUp: value + 0.1, PageDown: value - 0.1 }[e.key];
    if (next !== undefined) { e.preventDefault(); e.stopPropagation(); setVolume(next); }
  };
  const endDrag = () => {
    drag.current = null; setDragging(false);
    if (kind === 'effects') useEffectDialStore.setState({ settledLevel: useEffectDialStore.getState().level });
  };
  const active = !!owner || dragging;
  const label = kind === 'volume' ? 'Master volume' : 'Effect amount and duration';
  return <><div className={`kasync-volume-ring kasync-performance-wheel ${kind === 'volume' ? 'kasync-performance-wheel--left' : 'kasync-performance-wheel--right is-effects'} ${active ? 'is-active' : ''} ${ready ? 'is-ready' : ''}`}>
    <svg ref={svg} className="kasync-wheel-svg" viewBox="0 0 550 550" aria-label={`${label} dial`}>
      {kind === 'effects' && mode === 'Melody' && <circle cx="275" cy="275" r="245" fill="rgba(8,12,20,.65)" />}
      <circle cx="275" cy="275" r={R} className="volume-ring-track" />
      <g transform={`rotate(${135 + percent * 2.7} 275 275)`} className="volume-ring-ticks">
        {TICKS.map(i => <path key={i} d="M 535 275 L 540 275" transform={`rotate(${i * 9} 275 275)`} />)}
      </g>
      <circle cx="275" cy="275" r={R} className="volume-ring-level" transform="rotate(135 275 275)"
        strokeDasharray={`${ARC * percent / 100} ${2 * Math.PI * R}`} />
      <circle cx="275" cy="275" r={R} className="volume-ring-grip" role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        aria-describedby={`ring-hint-${kind}`}
        aria-valuetext={`${percent} percent. Show five extended fingers over this ring and rotate your wrist clockwise to increase.`}
        onKeyDown={keyDown}
        onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = pointerAngle(e); setDragging(true); }}
        onPointerMove={e => { if (drag.current === null) return; const angle = pointerAngle(e); const delta = dialDelta(drag.current, angle);
          const current = kind === 'volume' ? useLooperStore.getState().masterVolume : useEffectDialStore.getState().level;
          if (Math.abs(delta) < Math.PI / 3) setVolume(current + delta / Math.PI); drag.current = angle; }}
        onPointerUp={e => { e.currentTarget.releasePointerCapture(e.pointerId); endDrag(); }}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag} />
      <g className="volume-ring-readout" aria-hidden="true">
        <circle cx="275" cy="275" r="54" />
        {[0,1,2,3,4].map(i => <circle key={i} cx={259 + i * 8} cy="237" r="2"
          style={{ fill: ready ? 'currentColor' : '#ffffff30', stroke: 'none' }} />)}
        <text x="275" y="252" className="volume-ring-label">{kind === 'volume' ? 'VOLUME' : 'FX + TAIL'}</text>
        <text x="275" y="281" className="volume-ring-value">{percent}<tspan className="volume-ring-unit">%</tspan></text>
        <text x="275" y="302" className="volume-ring-hint">{dragging ? 'ADJUSTING' : ready ? '5 / 5 LINKED' : 'SHOW PALM'}</text>
      </g>
    </svg>
  </div>
    <div id={`ring-hint-${kind}`} className={`kasync-ring-caption kasync-ring-caption--${kind}`}>
      <strong>{ready ? 'Five fingers linked · turn wrist' : 'Open palm · turn wrist'}</strong>
      <span>{kind === 'volume' ? 'Clockwise louder · counterclockwise softer' : effectNames ? 'Clockwise stronger · longer tail' : 'Enable an effect in the FX controls'}</span>
    </div>
  </>;
}
