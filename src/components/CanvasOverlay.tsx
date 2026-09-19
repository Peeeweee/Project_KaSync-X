import { useEffect, useRef } from 'react';
import { useHandStore } from '../store/handState';
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
    // Cache the video element once — avoids document.querySelector('video') at 60 fps
    let cachedVideoEl: HTMLVideoElement | null = null;

    const getVideo = (): HTMLVideoElement | null => {
      if (!cachedVideoEl || !cachedVideoEl.isConnected) {
        cachedVideoEl = document.querySelector('video');
      }
      return cachedVideoEl;
    };

    const draw = () => {
      const { clientWidth, clientHeight } = canvas.parentElement || document.body;
      if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
        canvas.width = clientWidth;
        canvas.height = clientHeight;
        // Invalidate video cache on resize (dimensions may have changed)
        cachedVideoEl = null;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { smoothedHands, isTracking } = useHandStore.getState();
      const videoEl = getVideo();

      if (isTracking && smoothedHands) {
        smoothedHands.forEach((hand) => {
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

            const sc = videoEl
              ? landmarkToScreen(start.x, start.y, videoEl)
              : { x: 1 - start.x, y: start.y };
            const ec = videoEl
              ? landmarkToScreen(end.x, end.y, videoEl)
              : { x: 1 - end.x, y: end.y };

            ctx.moveTo(sc.x * canvas.width, sc.y * canvas.height);
            ctx.lineTo(ec.x * canvas.width, ec.y * canvas.height);
          });
          ctx.stroke();

          // ── Fingertip dots ─────────────────────────────────────────
          FINGERTIPS.forEach(({ idx, color, radius }) => {
            const tip = hand.landmarks[idx];
            if (!tip) return;
            const sc = videoEl
              ? landmarkToScreen(tip.x, tip.y, videoEl)
              : { x: 1 - tip.x, y: tip.y };
            const tx = sc.x * canvas.width;
            const ty = sc.y * canvas.height;

            // Colored outer dot
            ctx.fillStyle = color;
            ctx.globalAlpha = 1.0;
            ctx.beginPath();
            ctx.arc(tx, ty, radius, 0, Math.PI * 2);
            ctx.fill();

            // White core
            ctx.fillStyle = 'white';
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(tx, ty, radius * 0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
          });

          // ── Pinch arc (thumb ↔ index) ──────────────────────────────
          if (hand.landmarks[4] && hand.landmarks[8]) {
            const thumbTip = hand.landmarks[4];
            const indexTip = hand.landmarks[8];
            const sc4 = videoEl
              ? landmarkToScreen(thumbTip.x, thumbTip.y, videoEl)
              : { x: 1 - thumbTip.x, y: thumbTip.y };
            const sc8 = videoEl
              ? landmarkToScreen(indexTip.x, indexTip.y, videoEl)
              : { x: 1 - indexTip.x, y: indexTip.y };

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

      animationId = requestAnimationFrame(draw);
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
