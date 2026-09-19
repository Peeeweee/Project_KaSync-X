import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { useHandStore } from '../store/handState';
import { HandEmaFilter } from '../tracking/emaFilter';
import { computeGestures } from '../tracking/gestureRecognizer';
import type { HandData } from '../store/handState';

// Target inference FPS — higher = more responsive, but more CPU/GPU load
const TARGET_INFERENCE_FPS = 20;
const INFERENCE_INTERVAL_MS = 1000 / TARGET_INFERENCE_FPS;

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>, deviceId?: string) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const emaFilterRef = useRef(new HandEmaFilter(0.5));
  const requestRef = useRef<number>(0);
  const lastInferenceTimeRef = useRef(0);
  const inferenceScheduledRef = useRef(false); // prevents queuing multiple inferences

  // ── Init MediaPipe on the main thread ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          self.location.origin + '/wasm'
        );

        // Try GPU first — cuts inference from ~80 ms → ~15 ms on supported hardware.
        // Fall back to CPU automatically if GPU delegate init throws.
        let landmarker: HandLandmarker | null = null;
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/hand_landmarker.task',
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.6,
            minHandPresenceConfidence: 0.6,
            minTrackingConfidence: 0.5,
          });
        } catch {
          console.warn('GPU delegate unavailable, falling back to CPU.');
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: '/hand_landmarker.task',
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.6,
            minHandPresenceConfidence: 0.6,
            minTrackingConfidence: 0.5,
          });
        }

        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to initialize HandLandmarker:', err);
          setError('Tracking init failed. Try refreshing.');
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []); // Runs only once — no reactive deps

  // ── Camera stream + throttled inference loop ───────────────────────────────
  useEffect(() => {
    if (!isReady || !videoRef.current) return;

    const video = videoRef.current;
    let active = true;
    let stream: MediaStream | null = null;
    // Cache video element reference — avoids document.querySelector('video') on every inference
    const cachedVideo = video;

    // External cameras (BT/DJI/wireless) get lower resolution to cut decode latency
    const videoConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width:     { ideal: 640 },
          height:    { ideal: 480 },
          frameRate: { ideal: 24  },
        }
      : { width: 1280, height: 720, frameRate: { ideal: 30 } };

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        if (active) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = requestAnimationFrame(rafLoop);
        }
      } catch (err: any) {
        if (!active) return;
        // Retry with safe fallback constraints
        if (err.name === 'NotReadableError' || err.name === 'AbortError' || err.name === 'OverconstrainedError') {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
            video.srcObject = stream;
            await video.play();
            if (active) requestRef.current = requestAnimationFrame(rafLoop);
          } catch {
            setError('Camera unavailable.');
          }
        } else if (err.name === 'NotAllowedError') {
          setError('Camera permission denied.');
        } else {
          setError('Camera unavailable.');
        }
      }
    }

    // Inference is deferred via setTimeout so it runs OUTSIDE of the rAF callback.
    // This prevents the rAF handler from being measured as "long" by the browser —
    // the heavy MediaPipe work shows up on the setTimeout task instead.
    function scheduleInference(timestamp: number) {
      if (inferenceScheduledRef.current) return;
      inferenceScheduledRef.current = true;

      setTimeout(() => {
        if (!active || !landmarkerRef.current) {
          inferenceScheduledRef.current = false;
          return;
        }

        try {
          if (
            cachedVideo.readyState >= 2 &&
            cachedVideo.videoWidth > 0 &&
            !cachedVideo.paused
          ) {
            const results = landmarkerRef.current.detectForVideo(cachedVideo, timestamp);

            const rawLandmarks = results.landmarks;
            const handsCategories = results.handednesses;

            // Adaptive EMA: on slow cameras (high lag), increase alpha for snappier response.
            // Mutate alpha in-place instead of allocating a new HandEmaFilter each time.
            const frameDelta = timestamp - lastInferenceTimeRef.current;
            if (frameDelta > 0) {
              const lagRatio = Math.min(frameDelta / INFERENCE_INTERVAL_MS, 3);
              emaFilterRef.current.setAlpha(
                Math.min(0.3 + lagRatio * 0.15, 0.85)
              );
            }
            lastInferenceTimeRef.current = timestamp;

            const smoothedLandmarks = emaFilterRef.current.filter(rawLandmarks);

            const rawHands: HandData[] = rawLandmarks.map((l, i) => ({
              landmarks: l,
              handedness: handsCategories[i]?.[0]?.categoryName ?? 'Unknown',
              ...computeGestures(l, cachedVideo),
            }));

            const smoothedHands: HandData[] = smoothedLandmarks.map((l, i) => ({
              landmarks: l,
              handedness: handsCategories[i]?.[0]?.categoryName ?? 'Unknown',
              ...computeGestures(l, cachedVideo),
            }));

            // Use getState() to avoid React hook dependency loop
            const store = useHandStore.getState();
            store.setHands(rawHands, smoothedHands);
            store.setIsTracking(rawHands.length > 0);
          }
        } catch (err) {
          console.error('Hand tracking inference error:', err);
        }

        inferenceScheduledRef.current = false;
      }, 0); // defer to next macrotask — keeps rAF fast
    }

    function rafLoop(timestamp: number) {
      if (!active) return;

      // Throttle: only kick off inference at our target rate
      if (timestamp - lastInferenceTimeRef.current >= INFERENCE_INTERVAL_MS) {
        scheduleInference(timestamp);
      }

      requestRef.current = requestAnimationFrame(rafLoop);
    }

    video.addEventListener('loadeddata', () => {
      if (active) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = requestAnimationFrame(rafLoop);
      }
    });

    startCamera();

    return () => {
      active = false;
      cancelAnimationFrame(requestRef.current);
      inferenceScheduledRef.current = false;
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (video.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
    };
  }, [isReady, deviceId]); // Only re-run if ready state or device changes

  return { isReady, error };
}
