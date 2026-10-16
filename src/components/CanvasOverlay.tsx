import { useEffect, useRef } from 'react';
import { useHandStore, type HandData } from '../store/handState';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { landmarkToScreen } from '../tracking/coordUtils';

const HAND_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // Thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // Index
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12], // Middle
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16], // Ring
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20], // Pinky
  [0, 17], // Palm base
];

const FINGERTIPS = [
  { idx: 4,  color: '#ffffff', radius: 5 },
  { idx: 8,  color: '#a56bff', radius: 8 }, // index — primary pointer (violet)
  { idx: 12, color: '#2fd9c4', radius: 5 },
  { idx: 16, color: '#2fd9c4', radius: 5 },
  { idx: 20, color: '#2fd9c4', radius: 5 },
];

export function CanvasOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // alpha:true — this canvas is an overlay on top of the video feed; it must be transparent
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationId: number;
    let frameCount = 0;
    let lastHands: HandData[] | null = null;
    let lastDrawKey = '';
    // Cache the video element once — avoids document.querySelector('video') at 60 fps
    let cachedVideoEl: HTMLVideoElement | null = null;

    const getVideo = (): HTMLVideoElement | null => {
      if (!cachedVideoEl || !cachedVideoEl.isConnected) {
        cachedVideoEl = document.querySelector('video');
      }
      return cachedVideoEl;
    };

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      frameCount++;
      if (document.body.classList.contains('low-perf-mode') && frameCount % 3 !== 0) return;

      const { clientWidth, clientHeight } = canvas.parentElement || document.body;
      const resized = canvas.width !== clientWidth || canvas.height !== clientHeight;
      if (resized) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
        // Invalidate video cache on resize (dimensions may have changed)
        cachedVideoEl = null;
      }

      const { smoothedHands, isTracking } = useHandStore.getState();
      const { mirrorCamera, showHandOverlay } = useTrackingSettingsStore.getState();
      const videoEl = getVideo();
      const drawKey = `${isTracking}/${mirrorCamera}/${showHandOverlay}/${videoEl?.videoWidth}/${videoEl?.videoHeight}`;
      // There is no time-based animation in this canvas. Redrawing the same
      // detection at display FPS only competes with inference for CPU/GPU time.
      if (!resized && lastHands === smoothedHands && lastDrawKey === drawKey) return;
      lastHands = smoothedHands;
      lastDrawKey = drawKey;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!showHandOverlay) return;

      if (isTracking && smoothedHands) {
        smoothedHands.forEach((hand) => {
          // Reuse projected coordinates across skeleton connections and fingertip effects.
          const screenLandmarks = hand.landmarks.map(point => videoEl
            ? landmarkToScreen(point.x, point.y, videoEl, mirrorCamera)
            : { x: mirrorCamera ? 1 - point.x : point.x, y: point.y });
          // ── Skeleton ──────────────────────────────────────────────
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(58, 63, 75, 0.7)';
          ctx.lineWidth = 2;
          ctx.lineCap = 'butt';
          ctx.lineJoin = 'miter';

          // Batch all connection segments into a single path for one GPU draw call
          ctx.beginPath();
          HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
            const start = hand.landmarks[startIdx];
            const end = hand.landmarks[endIdx];
            if (!start || !end) return;

            const sc = screenLandmarks[startIdx];
            const ec = screenLandmarks[endIdx];

            ctx.moveTo(sc.x * canvas.width, sc.y * canvas.height);
            ctx.lineTo(ec.x * canvas.width, ec.y * canvas.height);
          });
          ctx.stroke();

          // ── Fingertip dots & Point-In Shockwave ───────────────────
          FINGERTIPS.forEach(({ idx, color, radius }) => {
            const tip = hand.landmarks[idx];
            if (!tip) return;
            const sc = screenLandmarks[idx];
            const tx = sc.x * canvas.width;
            const ty = sc.y * canvas.height;

            const isIndexActive = idx === 8 && (hand.isPointPressed || hand.isPinching);
            const dotRadius = isIndexActive ? radius * 1.35 : radius;
            const dotColor = idx === 8 && hand.isPointPressed ? '#00f0ff' : color;

            // Holographic depth reticle and shockwave ring on point-in
            if (idx === 8) {
              const depth = hand.pointDepth ?? 0;
              if (hand.isPointPressed) {
                // Active strike shockwave
                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 2.5;
                ctx.globalAlpha = 0.95;
                ctx.beginPath();
                ctx.arc(tx, ty, radius * 2.4, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = 'rgba(157, 78, 221, 0.7)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(tx, ty, radius * 3.6, 0, Math.PI * 2);
                ctx.stroke();
              } else if (depth > 0.1) {
                // Pre-strike proximity indicator (shows forward motion approaching threshold)
                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 1.2;
                ctx.globalAlpha = Math.min(0.7, depth * 0.8);
                ctx.beginPath();
                ctx.arc(tx, ty, radius * (1.2 + depth * 0.8), 0, Math.PI * 2);
                ctx.stroke();
              }
            }

            // Colored outer dot
            ctx.fillStyle = dotColor;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(tx, ty, dotRadius, 0, Math.PI * 2);
            ctx.fill();

            // White core
            ctx.fillStyle = 'white';
            ctx.globalAlpha = 0.95;
            ctx.beginPath();
            ctx.arc(tx, ty, dotRadius * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          });

          // ── Pinch arc (thumb ↔ index) ──────────────────────────────
          if (hand.landmarks[4] && hand.landmarks[8]) {
            const sc4 = screenLandmarks[4];
            const sc8 = screenLandmarks[8];

            ctx.strokeStyle = hand.isPinching ? '#ffe44d' : '#a56bff';
            ctx.lineWidth = hand.isPinching ? 3 : 1.5;
            ctx.globalAlpha = 0.5 + hand.pinchStrength * 0.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(sc4.x * canvas.width, sc4.y * canvas.height);
            ctx.lineTo(sc8.x * canvas.width, sc8.y * canvas.height);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1.0;
          }
        });
      }

    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-20 w-full h-full pointer-events-none"
    />
  );
}
