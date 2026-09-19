import { useEffect, useRef } from 'react';
import { useMusicStore } from '../store/musicState';
import { CHROMATIC_NOTES } from '../music/scales';

// ── Piano layout (3 octaves: C3–B5) ──────────────────────────
type WhiteKey = { isBlack: false; wi: number };
type BlackKey = { isBlack: true;  bx: number };

const KEY_LAYOUT: (WhiteKey | BlackKey)[] = [
  { isBlack: false, wi: 0 },  // C
  { isBlack: true,  bx: 0.72 }, // C#
  { isBlack: false, wi: 1 },  // D
  { isBlack: true,  bx: 1.72 }, // D#
  { isBlack: false, wi: 2 },  // E
  { isBlack: false, wi: 3 },  // F
  { isBlack: true,  bx: 3.75 }, // F#
  { isBlack: false, wi: 4 },  // G
  { isBlack: true,  bx: 4.75 }, // G#
  { isBlack: false, wi: 5 },  // A
  { isBlack: true,  bx: 5.75 }, // A#
  { isBlack: false, wi: 6 },  // B
];

const OCTAVES    = [3, 4, 5];
const WK_PER_OCT = 7;
const TOTAL_WK   = WK_PER_OCT * OCTAVES.length; // 21

// Vibranium glow animation state
interface GlowState { [noteStr: string]: number } // 0→1 fade

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animId: number;
    let cachedNotes: string[] = [];
    let glows: GlowState = {};
    let lastKey = '';
    let frameCount = 0;

    const unsub = useMusicStore.subscribe(s => { cachedNotes = s.playingNotes; });

    const W   = canvas.width;
    const H   = canvas.height;
    const wkw = W / TOTAL_WK;
    const bkw = wkw * 0.56;
    const wkh = H;
    const bkh = H * 0.60;

    const whiteX = (oi: number, wi: number) => (oi * WK_PER_OCT + wi) * wkw;

    // ── Pre-cache static key gradients (computed once) ───────────────────────
    // White key inactive gradient
    const staticWhiteGrad = ctx.createLinearGradient(0, 0, 0, wkh);
    staticWhiteGrad.addColorStop(0, '#2e3450');
    staticWhiteGrad.addColorStop(0.4, '#222840');
    staticWhiteGrad.addColorStop(1, '#1a1f32');

    // Black key inactive gradient
    const staticBlackGrad = ctx.createLinearGradient(0, 0, bkw, bkh);
    staticBlackGrad.addColorStop(0, '#0f1220');
    staticBlackGrad.addColorStop(1, '#070912');

    // ── Offscreen canvas for the background dot grid ─────────────────────────
    // Drawn once, then composited via drawImage on every frame — avoids 240+ fillRect calls/frame
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width  = W;
    bgCanvas.height = H;
    const bgCtx = bgCanvas.getContext('2d')!;

    const bgGrad = bgCtx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#06080f');
    bgGrad.addColorStop(1, '#03040a');
    bgCtx.fillStyle = bgGrad;
    bgCtx.fillRect(0, 0, W, H);

    bgCtx.fillStyle = 'rgba(80,60,140,0.15)';
    for (let gx = 4; gx < W; gx += 12) {
      for (let gy = 4; gy < H; gy += 10) {
        const offset = (Math.floor(gy / 10) % 2) * 6;
        bgCtx.fillRect(gx + offset, gy, 1, 1);
      }
    }

    // Draw Wakandan circuit etch lines on a key
    const drawCircuitEtch = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.moveTo(x + 2, y + h * 0.35); ctx.lineTo(x + w - 2, y + h * 0.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 2, y + h * 0.70); ctx.lineTo(x + w - 2, y + h * 0.70); ctx.stroke();
      const cx = x + w / 2;
      const cy = y + h * 0.35;
      ctx.beginPath(); ctx.moveTo(cx, cy - 1.5); ctx.lineTo(cx + 1.5, cy); ctx.lineTo(cx, cy + 1.5); ctx.lineTo(cx - 1.5, cy); ctx.closePath(); ctx.stroke();
    };

    // Draw energy vein lines (thin glowing lines through key)
    const drawEnergyVein = (x: number, y: number, h: number, color: string, intensity: number) => {
      ctx.save();
      ctx.globalAlpha = intensity * 0.6;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
      ctx.restore();
    };

    const drawFrame = () => {
      animId = requestAnimationFrame(drawFrame);
      frameCount++;

      const activeKey = cachedNotes.join(',');
      const active = new Set(cachedNotes);
      const hasNotes = active.size > 0;

      // Animate glow intensities (fade in/out)
      let animating = false;
      const allKeys = new Set([...Object.keys(glows), ...cachedNotes]);
      allKeys.forEach(noteStr => {
        const target = active.has(noteStr) ? 1 : 0;
        const current = glows[noteStr] ?? 0;
        const diff = target - current;
        if (Math.abs(diff) > 0.01) {
          glows[noteStr] = current + diff * 0.25;
          animating = true;
        } else {
          glows[noteStr] = target;
          if (target === 0) delete glows[noteStr];
        }
      });

      const keyChanged = activeKey !== lastKey;

      // Throttle to 30 FPS when nothing is animating — halves GPU work during idle
      if (!keyChanged && !animating) {
        if (frameCount % 2 !== 0) return;
      }
      lastKey = activeKey;

      // Update dot indicator
      if (dotRef.current) {
        dotRef.current.style.background = hasNotes ? '#00F0FF' : '#1e2535';
        dotRef.current.style.boxShadow  = hasNotes
          ? '0 0 7px #00F0FF, 0 0 14px rgba(0,240,255,0.4)' : 'none';
      }

      // ── Background: single drawImage from offscreen cache ──
      ctx.drawImage(bgCanvas, 0, 0);

      // ── Pass 1: White keys — Vibranium panels ──
      OCTAVES.forEach((oct, oi) => {
        KEY_LAYOUT.forEach((key, ci) => {
          if (key.isBlack) return;
          const noteStr = `${CHROMATIC_NOTES[ci]}${oct}`;
          const glow = glows[noteStr] ?? 0;
          const x = whiteX(oi, key.wi);

          // Use pre-cached static gradient for inactive keys; build gradient only for glowing keys
          if (glow > 0.05) {
            const g = ctx.createLinearGradient(x, 0, x, wkh);
            g.addColorStop(0, `rgba(0,${Math.round(180*glow+40)},${Math.round(220*glow+20)},1)`);
            g.addColorStop(0.5, `rgba(${Math.round(20*glow)},${Math.round(60*glow)},${Math.round(80*glow+20)},1)`);
            g.addColorStop(1, `rgba(${Math.round(100*glow)},${Math.round(30*glow)},${Math.round(160*glow)},1)`);
            ctx.fillStyle = g;
          } else {
            ctx.fillStyle = staticWhiteGrad;
          }
          ctx.fillRect(x + 0.5, 0, wkw - 1, wkh);

          const etchColor = glow > 0.1
            ? `rgba(0,240,255,${0.15 + glow * 0.5})`
            : 'rgba(80,100,160,0.18)';
          drawCircuitEtch(x + 0.5, 2, wkw - 1, wkh - 4, etchColor);

          if (glow > 0.05) {
            const veinColor = ci > 5 ? `rgba(0,240,255,1)` : `rgba(157,78,221,1)`;
            drawEnergyVein(x + 0.5, 0, wkh, veinColor, glow);
            drawEnergyVein(x + wkw - 0.5, 0, wkh, veinColor, glow * 0.6);

            const burstR = (wkw / 2) + glow * wkh * 0.5;
            const burst = ctx.createRadialGradient(x + wkw/2, wkh * 0.4, 0, x + wkw/2, wkh * 0.4, burstR);
            const isCyan = ci > 5;
            burst.addColorStop(0, isCyan ? `rgba(0,240,255,${glow * 0.7})` : `rgba(200,120,255,${glow * 0.7})`);
            burst.addColorStop(0.4, isCyan ? `rgba(0,180,200,${glow * 0.3})` : `rgba(140,60,200,${glow * 0.3})`);
            burst.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = burst;
            ctx.fillRect(x, 0, wkw, wkh);

            ctx.fillStyle = isCyan ? `rgba(0,240,255,${glow * 0.9})` : `rgba(200,100,255,${glow * 0.9})`;
            ctx.fillRect(x + 1, 0, wkw - 2, 2 + glow * 1.5);
          }

          ctx.strokeStyle = glow > 0.05
            ? `rgba(0,240,255,${glow * 0.9})`
            : 'rgba(0,200,255,0.3)';
          ctx.lineWidth = glow > 0.05 ? 1 : 0.7;
          ctx.strokeRect(x + 0.5, 0.5, wkw - 1, wkh - 1);
        });
      });

      // ── Pass 2: Black keys — Obsidian Vibranium ──
      OCTAVES.forEach((oct, oi) => {
        KEY_LAYOUT.forEach((key, ci) => {
          if (!key.isBlack) return;
          const noteStr = `${CHROMATIC_NOTES[ci]}${oct}`;
          const glow = glows[noteStr] ?? 0;
          const bx = oi * WK_PER_OCT * wkw + key.bx * wkw - bkw / 2;

          if (glow > 0.05) {
            const isCyan = ci > 5;
            const g = ctx.createLinearGradient(bx, 0, bx + bkw, bkh);
            g.addColorStop(0, isCyan
              ? `rgba(0,${Math.round(160*glow)},${Math.round(180*glow)},1)`
              : `rgba(${Math.round(120*glow)},${Math.round(30*glow)},${Math.round(180*glow)},1)`);
            g.addColorStop(1, '#020306');
            ctx.fillStyle = g;
          } else {
            ctx.fillStyle = staticBlackGrad;
          }
          ctx.fillRect(bx, 0, bkw, bkh);

          ctx.fillStyle = glow > 0.1 ? `rgba(255,255,255,${glow * 0.2})` : 'rgba(255,255,255,0.06)';
          ctx.fillRect(bx + 1, 0, 1.5, bkh * 0.5);

          if (glow > 0.05) {
            const isCyan = ci > 5;
            ctx.fillStyle = isCyan ? `rgba(0,240,255,${glow})` : `rgba(200,120,255,${glow})`;
            ctx.fillRect(bx, 0, bkw, 2 + glow * 2);
            ctx.fillStyle = isCyan ? `rgba(0,240,255,${glow * 0.5})` : `rgba(157,78,221,${glow * 0.5})`;
            ctx.fillRect(bx, 0, 1, bkh * glow);
            ctx.fillRect(bx + bkw - 1, 0, 1, bkh * glow);
          }

          ctx.strokeStyle = glow > 0.05 ? `rgba(0,200,240,${glow * 0.6})` : 'rgba(0,180,220,0.25)';
          ctx.lineWidth = 0.6;
          ctx.strokeRect(bx + 0.5, 0.5, bkw - 1, bkh - 1);
        });
      });

      // ── Octave dividers (energy seams) ──
      for (let i = 1; i < OCTAVES.length; i++) {
        const x = Math.round(i * WK_PER_OCT * wkw);
        const seamGrad = ctx.createLinearGradient(x, 0, x, H);
        seamGrad.addColorStop(0, 'rgba(0,240,255,0.5)');
        seamGrad.addColorStop(0.5, 'rgba(157,78,221,0.4)');
        seamGrad.addColorStop(1, 'rgba(0,240,255,0.3)');
        ctx.strokeStyle = seamGrad;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }

      // ── Octave labels (holographic) ──
      ctx.font = 'bold 6px monospace';
      ctx.textAlign = 'left';
      OCTAVES.forEach((oct, oi) => {
        ctx.fillStyle = 'rgba(0,240,255,0.35)';
        ctx.fillText(`C${oct}`, oi * WK_PER_OCT * wkw + 1.5, H - 2);
      });
    };

    drawFrame();
    return () => { cancelAnimationFrame(animId); unsub(); };
  }, []);

  return (
    <div
      className="absolute top-6 right-6 z-40 flex flex-col overflow-hidden pointer-events-none"
      style={{
        width: 240,
        background: 'rgba(4,5,12,0.9)',
        borderRadius: 10,
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        boxShadow: '0 0 0 1px rgba(0,240,255,0.25), 0 0 24px rgba(0,240,255,0.08), 0 8px 40px rgba(0,0,0,0.7)',
        outline: '1px solid rgba(157,78,221,0.12)',
        outlineOffset: 3,
      }}
    >
      {/* Wakandan corner accents */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: 10, height: 10,
        borderTop: '2px solid rgba(0,240,255,0.7)', borderLeft: '2px solid rgba(0,240,255,0.7)',
        borderRadius: '4px 0 0 0', zIndex: 10 }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10,
        borderTop: '2px solid rgba(0,240,255,0.7)', borderRight: '2px solid rgba(0,240,255,0.7)',
        borderRadius: '0 4px 0 0', zIndex: 10 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: 10, height: 10,
        borderBottom: '2px solid rgba(157,78,221,0.7)', borderLeft: '2px solid rgba(157,78,221,0.7)',
        borderRadius: '0 0 0 4px', zIndex: 10 }} />
      <div style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
        borderBottom: '2px solid rgba(157,78,221,0.7)', borderRight: '2px solid rgba(157,78,221,0.7)',
        borderRadius: '0 0 4px 0', zIndex: 10 }} />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5"
           style={{ borderBottom: '1px solid rgba(0,240,255,0.12)', background: 'rgba(0,240,255,0.03)' }}>
        <div className="flex items-center gap-2">
          {/* Wakandan triangle accent */}
          <div style={{ width: 0, height: 0,
            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderBottom: '6px solid rgba(0,240,255,0.6)' }} />
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.4em',
            color: 'rgba(0,240,255,0.7)', textTransform: 'uppercase', fontFamily: 'monospace' }}>
            Telemetry
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: 7, color: 'rgba(0,240,255,0.3)', letterSpacing: '0.2em', fontFamily: 'monospace' }}>LIVE</span>
          <div ref={dotRef} style={{ width: 6, height: 6, borderRadius: '50%',
            background: '#1e2535', transition: 'background 0.1s, box-shadow 0.1s' }} />
        </div>
      </div>

      {/* Vibranium Piano Canvas */}
      <div style={{ position: 'relative', height: 68 }}>
        <canvas ref={canvasRef} width={240} height={68}
          style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>

      {/* Bottom energy line */}
      <div style={{
        height: 2,
        background: 'linear-gradient(90deg, transparent, rgba(0,240,255,0.5) 20%, rgba(157,78,221,0.5) 50%, rgba(0,240,255,0.5) 80%, transparent)',
      }} />
    </div>
  );
}
