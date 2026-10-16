import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Category, HandLandmarker, Landmark } from '@mediapipe/tasks-vision';
import { useHandStore } from '../store/handState';
import type { HandData } from '../store/handState';
import { useTrackingSettingsStore, getTargetInferenceFps } from '../store/trackingSettings';
import { attachBenchmarkVideo, isBenchmarkActive } from '../diagnostics/backendBenchmark';
import { recordTrackingCapture } from '../diagnostics/trackingCapture';
import { MainInferenceFrame, captureInferenceBitmap } from '../tracking/inferenceFrame';
import { HandEmaFilter } from '../tracking/emaFilter';
import { computeGestures } from '../tracking/gestureRecognizer';
import { PointTapTracker } from '../tracking/pointTapTracker';
import { PinchPressTracker } from '../tracking/pinchPressTracker';
import { TrackingMetrics, EMPTY_TRACKING_METRICS } from '../tracking/trackingMetrics';
import { HandRoleTracker } from '../tracking/handRoleTracker';
import type {
  HandTrackingWorkerRequest,
  HandTrackingWorkerResponse,
  TrackingBackend,
} from '../tracking/workerProtocol';

type InferenceBackend = 'worker' | 'main' | null;

interface VideoFrameMetadataLike {
  mediaTime: number;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: VideoFrameMetadataLike) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function sortDetections(landmarks: Landmark[][], handednesses: Category[][]) {
  return landmarks
    .map((handLandmarks, index) => ({
      landmarks: handLandmarks,
      categories: handednesses[index] ?? [],
      handedness: handednesses[index]?.[0]?.categoryName ?? 'Unknown',
    }))
    .sort((a, b) => {
      if (a.handedness !== 'Unknown' && b.handedness !== 'Unknown' && a.handedness !== b.handedness) {
        return a.handedness.localeCompare(b.handedness);
      }
      return a.landmarks[8].x - b.landmarks[8].x;
    });
}

export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>, deviceId?: string) {
  const trackingEngine = useTrackingSettingsStore(state => state.trackingEngine);
  const restartGeneration = useTrackingSettingsStore(state => state.restartGeneration);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const backendRef = useRef<InferenceBackend>(null);
  const emaFilterRef = useRef(new HandEmaFilter(useTrackingSettingsStore.getState().smoothingAlpha));
  const roleTrackerRef = useRef(new HandRoleTracker());
  const previousPinchesRef = useRef(new Map<string, boolean>());
  const previousPointsRef = useRef(new Map<string, PointTapTracker>());
  const pinchPressesRef = useRef(new Map<string, PinchPressTracker>());
  const inFlightRequestRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(0);
  const requestStartedAtRef = useRef(0);
  const captureLatencyRef = useRef(0);
  const metricsRef = useRef(new TrackingMetrics());
  const inferenceFrameRef = useRef(new MainInferenceFrame());
  const frameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFrameTimeout = () => {
    if (frameTimeoutRef.current !== null) {
      clearTimeout(frameTimeoutRef.current);
      frameTimeoutRef.current = null;
    }
  };
  const lastInferenceTimeRef = useRef(0);
  const frameTransferFailuresRef = useRef(0);
  const activateMainFallbackRef = useRef<(() => void) | null>(null);
  const settingsRef = useRef(useTrackingSettingsStore.getState());

  const processResults = (
    landmarks: Landmark[][],
    handednesses: Category[][],
    inferenceMs: number,
  ) => {
    const video = videoRef.current;
    if (!video || isBenchmarkActive()) return;

    const detections = sortDetections(landmarks, handednesses);
    const rawLandmarks = detections.map(detection => detection.landmarks);
    const smoothedLandmarks = emaFilterRef.current.filter(
      rawLandmarks, detections.map(detection => detection.handedness),
    );
    const currentKeys = new Set<string>();
    const settings = settingsRef.current;
    const rawGestures: ReturnType<typeof computeGestures>[] = [];

    const smoothedHands: HandData[] = smoothedLandmarks.map((handLandmarks, index) => {
      const handedness = detections[index]?.handedness ?? 'Unknown';
      const identityKey = handedness === 'Unknown' ? `hand-${index}` : handedness;
      currentKeys.add(identityKey);
      // Gesture edges use fresh landmarks; smoothing is only for wheel/overlay position.
      const rawGesture = computeGestures(rawLandmarks[index], video, {
        previousPinching: previousPinchesRef.current.get(identityKey) ?? false,
        pinchThreshold: settings.pinchThreshold,
        pinchReleaseThreshold: settings.pinchReleaseThreshold,
        mirrored: settings.mirrorCamera,
      });
      const gestures = computeGestures(handLandmarks, video, {
        previousPinching: rawGesture.isPinching,
        pinchThreshold: settings.pinchThreshold,
        pinchReleaseThreshold: settings.pinchReleaseThreshold,
        mirrored: settings.mirrorCamera,
      });
      gestures.isPinching = rawGesture.isPinching;
      gestures.pinchStrength = rawGesture.pinchStrength;
      gestures.pinchDistance = rawGesture.pinchDistance;
      previousPinchesRef.current.set(identityKey, rawGesture.isPinching);
      let tapTracker = previousPointsRef.current.get(identityKey);
      if (!tapTracker) {
        tapTracker = new PointTapTracker();
        previousPointsRef.current.set(identityKey, tapTracker);
      }
      rawGestures.push(rawGesture);
      gestures.isPointPressed = tapTracker.update({ ...rawGesture, isPinching: gestures.isPinching });
      let pressTracker = pinchPressesRef.current.get(identityKey);
      if (!pressTracker) {
        pressTracker = new PinchPressTracker();
        pinchPressesRef.current.set(identityKey, pressTracker);
      }
      const press = pressTracker.update({ ...rawGesture, isPinching: gestures.isPinching });
      gestures.isTriggerActive = press.isKeyDown || gestures.isPointPressed;
      gestures.triggerVelocity = gestures.isPointPressed ? rawGesture.pointVelocity : gestures.pinchStrength;
      return { landmarks: handLandmarks, handedness, ...gestures, ...press,
        isKeyDown: press.isKeyDown || gestures.isPointPressed };
    });

    for (const key of previousPinchesRef.current.keys()) {
      if (!currentKeys.has(key)) previousPinchesRef.current.delete(key);
    }
    for (const key of previousPointsRef.current.keys()) {
      if (!currentKeys.has(key)) previousPointsRef.current.delete(key);
    }

    for (const key of pinchPressesRef.current.keys()) {
      if (!currentKeys.has(key)) pinchPressesRef.current.delete(key);
    }

    const roleAssignedHands = roleTrackerRef.current.assign(smoothedHands);
    const rawHands: HandData[] = rawLandmarks.map((handLandmarks, index) => {
      const handedness = detections[index]?.handedness ?? 'Unknown';
      const gestures = rawGestures[index];
      return {
        landmarks: handLandmarks,
        handedness,
        ...gestures,
        isPinching: roleAssignedHands[index]?.isPinching ?? gestures.isPinching,
        isPointPressed: roleAssignedHands[index]?.isPointPressed ?? gestures.isPointPressed,
        isTriggerActive: roleAssignedHands[index]?.isTriggerActive ?? gestures.isTriggerActive,
        isKeyDown: roleAssignedHands[index]?.isKeyDown,
        pressId: roleAssignedHands[index]?.pressId,
        pressVelocity: roleAssignedHands[index]?.pressVelocity,
        articulationReason: roleAssignedHands[index]?.articulationReason,
        screenRole: roleAssignedHands[index]?.screenRole,
      };
    });

    const handStore = useHandStore.getState();
    handStore.setHands(rawHands, roleAssignedHands);
    const completedAt = performance.now();
    recordTrackingCapture(completedAt, inferenceMs,
      completedAt - requestStartedAtRef.current, captureLatencyRef.current, roleAssignedHands);
    const metrics = metricsRef.current.record(
      completedAt, completedAt - requestStartedAtRef.current, captureLatencyRef.current,
    );
    useTrackingSettingsStore.getState().setRuntime({ inferenceLatencyMs: inferenceMs, ...metrics });
  };

  useEffect(() => {
    return useTrackingSettingsStore.subscribe(state => {
      settingsRef.current = state;
      emaFilterRef.current.setAlpha(state.smoothingAlpha);
    });
  }, []);

  // Camera permission is requested before MediaPipe is loaded, keeping the heavy
  // model and WASM out of the startup path when permission is denied.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const detachBenchmarkVideo = attachBenchmarkVideo(video, () => inFlightRequestRef.current === null);

    let active = true;
    let stream: MediaStream | null = null;
    setCameraReady(false);
    setError(null);

    const preferredConstraints: MediaTrackConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, min: 30 },
        }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, min: 30 } };

    const attachStream = async (nextStream: MediaStream) => {
      if (!active) {
        nextStream.getTracks().forEach(track => track.stop());
        return;
      }
      stream = nextStream;
      video.srcObject = nextStream;
      await video.play();
      if (!active) return;
      setHasCameraPermission(true);
      setCameraReady(true);
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera API unavailable. Use a secure HTTPS connection.');
        return;
      }
      try {
        await attachStream(await navigator.mediaDevices.getUserMedia({ video: preferredConstraints }));
      } catch (cause) {
        if (!active) return;
        const errorName = cause instanceof Error ? cause.name : '';
        if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
          setError('Camera permission denied. Allow camera access, then reload.');
          return;
        }
        try {
          await attachStream(await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
          }));
        } catch {
          if (active) setError('Camera unavailable or already in use.');
        }
      }
    };

    void startCamera();

    return () => {
      detachBenchmarkVideo();
      active = false;
      setCameraReady(false);
      stream?.getTracks().forEach(track => track.stop());
      if (video.srcObject === stream) video.srcObject = null;
      emaFilterRef.current.reset();
      roleTrackerRef.current.reset();
      previousPinchesRef.current.clear();
      previousPointsRef.current.clear();
      pinchPressesRef.current.clear();
      inFlightRequestRef.current = null;
      lastInferenceTimeRef.current = 0;
      const handStore = useHandStore.getState();
      handStore.setHands([], []);
      handStore.setIsTracking(false);
    };
  }, [deviceId, videoRef]);

  // Initialize the classic worker after camera permission. If workers are blocked,
  // dynamically import MediaPipe and retain a lower-performance main-thread fallback.
  useEffect(() => {
    if (!hasCameraPermission) return;
    setIsReady(false);
    setError(null);
    clearFrameTimeout();
    inFlightRequestRef.current = null;
    emaFilterRef.current.reset();
    roleTrackerRef.current.reset();
    previousPinchesRef.current.clear();
    previousPointsRef.current.clear();
      pinchPressesRef.current.clear();
    useHandStore.getState().setHands([], []);
    useHandStore.getState().setIsTracking(false);
    let active = true;
    let fallbackStarting = false;
    let initializationTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveProcessFailures = 0;
    useTrackingSettingsStore.getState().setRuntime({ fallbackReason: null, inferenceWidth: null, inferenceHeight: null });

    const initializeMainThreadFallback = async () => {
      if (fallbackStarting || !active) return;
      fallbackStarting = true;
      try {
        const { FilesetResolver, HandLandmarker: HandLandmarkerClass } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks(`${window.location.origin}/wasm`);
        let landmarker: HandLandmarker;
        let backend: TrackingBackend;
        try {
          landmarker = await HandLandmarkerClass.createFromOptions(vision, {
            baseOptions: { modelAssetPath: '/hand_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          backend = 'main-gpu';
        } catch {
          landmarker = await HandLandmarkerClass.createFromOptions(vision, {
            baseOptions: { modelAssetPath: '/hand_landmarker.task', delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          backend = 'main-cpu';
        }
        if (!active) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        backendRef.current = 'main';
        useTrackingSettingsStore.getState().setRuntime({ backend });
        setIsReady(true);
      } catch (cause) {
        if (active) {
          console.error('Failed to initialize hand tracking:', cause);
          setError('Tracking initialization failed. Reload to try again.');
        }
      }
    };

    const switchToMainThreadFallback = (reason: string) => {
      if (!active || fallbackStarting) return;
      useTrackingSettingsStore.getState().setRuntime({ fallbackReason: reason });
      if (initializationTimer !== null) {
        clearTimeout(initializationTimer);
        initializationTimer = null;
      }
      clearFrameTimeout();
      workerRef.current?.terminate();
      workerRef.current = null;
      backendRef.current = null;
      inFlightRequestRef.current = null;
      setIsReady(false);
      void initializeMainThreadFallback();
    };
    activateMainFallbackRef.current = () => switchToMainThreadFallback('Camera frame transfer failed three times.');

    try {
      if (trackingEngine === 'compatible' || typeof createImageBitmap !== 'function') {
        if (trackingEngine === 'compatible') {
          void initializeMainThreadFallback();
        } else {
          console.warn('ImageBitmap transfer unavailable; using main-thread tracking.');
          switchToMainThreadFallback('ImageBitmap transfer is unavailable.');
        }
        return () => {
          active = false;
          setIsReady(false);
          activateMainFallbackRef.current = null;
          landmarkerRef.current?.close();
          landmarkerRef.current = null;
          backendRef.current = null;
          useTrackingSettingsStore.getState().setRuntime({ backend: null, inferenceLatencyMs: null });
        };
      }
      const worker = new Worker(
        new URL('/hand-tracking.worker.js', window.location.origin),
        { name: 'kasync-hand-tracking' },
      );
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<HandTrackingWorkerResponse>) => {
        if (!active) return;
        const message = event.data;
        if (message.type === 'INIT_DONE') {
          if (initializationTimer !== null) {
            clearTimeout(initializationTimer);
            initializationTimer = null;
          }
          backendRef.current = 'worker';
          useTrackingSettingsStore.getState().setRuntime({ backend: message.backend });
          setIsReady(true);
        } else if (message.type === 'INIT_ERROR') {
          console.warn('Worker tracking unavailable; using main-thread fallback.', message.error);
          switchToMainThreadFallback(message.error);
        } else if (message.type === 'RESULTS') {
          if (message.requestId !== inFlightRequestRef.current) return;
          clearFrameTimeout();
          consecutiveProcessFailures = 0;
          frameTransferFailuresRef.current = 0;
          inFlightRequestRef.current = null;
          processResults(message.landmarks, message.handednesses, message.inferenceMs);
        } else if (message.type === 'PROCESS_ERROR') {
          if (message.requestId === inFlightRequestRef.current) {
            clearFrameTimeout();
            inFlightRequestRef.current = null;
          }
          console.warn('Worker hand inference failed:', message.error);
          consecutiveProcessFailures++;
          if (consecutiveProcessFailures >= 3) switchToMainThreadFallback(`Worker inference failed: ${message.error}`);
        }
      };
      worker.onerror = event => {
        if (!active || backendRef.current === 'main') return;
        console.warn('Hand-tracking worker crashed; using main-thread fallback.', event.message);
        switchToMainThreadFallback(`Worker crashed: ${event.message}`);
      };
      const initMessage: HandTrackingWorkerRequest = {
        type: 'INIT',
        wasmRoot: `${window.location.origin}/wasm`,
        modelAssetPath: '/hand_landmarker.task',
      };
      worker.postMessage(initMessage);
      initializationTimer = setTimeout(() => {
        console.warn('Hand-tracking worker timed out; using main-thread fallback.');
        switchToMainThreadFallback('Worker initialization timed out after 12 seconds.');
      }, 12_000);
    } catch (cause) {
      console.warn('Tracking worker unavailable; using main-thread tracking.', cause);
      switchToMainThreadFallback(String(cause));
    }

    return () => {
      active = false;
      if (initializationTimer !== null) clearTimeout(initializationTimer);
      activateMainFallbackRef.current = null;
      setIsReady(false);
      if (workerRef.current) {
        const disposeMessage: HandTrackingWorkerRequest = { type: 'DISPOSE' };
        workerRef.current.postMessage(disposeMessage);
        workerRef.current.terminate();
        workerRef.current = null;
      }
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      backendRef.current = null;
      useTrackingSettingsStore.getState().setRuntime({ backend: null, inferenceLatencyMs: null });
    };
  }, [hasCameraPermission, videoRef, trackingEngine, restartGeneration]);

  // Schedule inference from decoded video frames. Exactly one request can be in flight.
  useEffect(() => {
    if (!cameraReady || !isReady || !videoRef.current) return;
    const video = videoRef.current as VideoWithFrameCallback;
    let active = true;
    let frameHandle = 0;
    let usesVideoFrames = false;
    let lastMediaTime = -1;
    metricsRef.current.reset();
    useTrackingSettingsStore.getState().setRuntime(EMPTY_TRACKING_METRICS);

    const runInference = (timestamp: number, mediaTime: number) => {
      if (!active || isBenchmarkActive() || inFlightRequestRef.current !== null) return;
      const settings = settingsRef.current;
      const targetFps = getTargetInferenceFps(settings.quality, settings.isLowPerformance);
      const intervalMs = 1000 / targetFps;
      // Allow 14% timing tolerance for rVFC / rAF clock jitter to avoid dropping frames
      const jitterTolerance = Math.min(6, intervalMs * 0.14);
      if (timestamp - lastInferenceTimeRef.current < intervalMs - jitterTolerance) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.paused) return;

      // rAF may run faster than the camera. Never infer twice on the same decoded frame.
      if (mediaTime === lastMediaTime) return;
      lastMediaTime = mediaTime;
      requestStartedAtRef.current = performance.now();
      captureLatencyRef.current = 0;
      lastInferenceTimeRef.current = timestamp;
      const requestId = ++requestSequenceRef.current;
      inFlightRequestRef.current = requestId;
      if (useTrackingSettingsStore.getState().targetFps !== targetFps) {
        useTrackingSettingsStore.getState().setRuntime({ targetFps });
      }

      // Safety timeout: prevent tracking pipeline from ever permanently hanging if a worker frame stalls
      clearFrameTimeout();
      frameTimeoutRef.current = setTimeout(() => {
        frameTimeoutRef.current = null;
        if (inFlightRequestRef.current === requestId) {
          inFlightRequestRef.current = null;
        }
      }, 2500);

      if (backendRef.current === 'worker' && workerRef.current) {
        void captureInferenceBitmap(video, settings.quality, settings.isLowPerformance)
          .then(image => {
            if (!active || isBenchmarkActive() || !workerRef.current || inFlightRequestRef.current !== requestId) {
              if (inFlightRequestRef.current === requestId) {
                clearFrameTimeout();
                inFlightRequestRef.current = null;
              }
              image.close();
              return;
            }
            captureLatencyRef.current = performance.now() - requestStartedAtRef.current;
            const runtime = useTrackingSettingsStore.getState();
            if (runtime.inferenceWidth !== image.width || runtime.inferenceHeight !== image.height) {
              runtime.setRuntime({ inferenceWidth: image.width, inferenceHeight: image.height });
            }
            const message: HandTrackingWorkerRequest = { type: 'PROCESS', image, timestamp, requestId };
            workerRef.current.postMessage(message, [image]);
          })
          .catch(cause => {
            if (inFlightRequestRef.current === requestId) {
              clearFrameTimeout();
              inFlightRequestRef.current = null;
            }
            console.warn('Unable to transfer camera frame to tracking worker:', cause);
            frameTransferFailuresRef.current++;
            if (frameTransferFailuresRef.current >= 3) activateMainFallbackRef.current?.();
          });
        return;
      }

      {
        if (!active || inFlightRequestRef.current !== requestId || !landmarkerRef.current) return;
        if (isBenchmarkActive()) {
          clearFrameTimeout();
          inFlightRequestRef.current = null;
          return;
        }
        try {
          // Compatibility mode preserves the original direct-video path, bypassing bitmap/canvas capture.
          const input = settings.trackingEngine === 'compatible'
            ? video
            : inferenceFrameRef.current.capture(video, settings.quality, settings.isLowPerformance);
          captureLatencyRef.current = performance.now() - requestStartedAtRef.current;
          const width = input instanceof HTMLVideoElement ? input.videoWidth : input.width;
          const height = input instanceof HTMLVideoElement ? input.videoHeight : input.height;
          const runtime = useTrackingSettingsStore.getState();
          if (runtime.inferenceWidth !== width || runtime.inferenceHeight !== height) {
            runtime.setRuntime({ inferenceWidth: width, inferenceHeight: height });
          }
          const startedAt = performance.now();
          const results = landmarkerRef.current.detectForVideo(input, timestamp);
          processResults(results.landmarks, results.handednesses, performance.now() - startedAt);
        } catch (cause) {
          console.warn('Main-thread hand inference failed:', cause);
        } finally {
          if (inFlightRequestRef.current === requestId) {
            clearFrameTimeout();
            inFlightRequestRef.current = null;
          }
        }
      }
    };

    const scheduleNext = () => {
      if (!active) return;
      if (video.requestVideoFrameCallback) {
        usesVideoFrames = true;
        frameHandle = video.requestVideoFrameCallback((now, metadata) => {
          scheduleNext();
          runInference(now, metadata.mediaTime);
        });
      } else {
        frameHandle = requestAnimationFrame(now => {
          scheduleNext();
          runInference(now, video.currentTime);
        });
      }
    };

    scheduleNext();
    return () => {
      active = false;
      clearFrameTimeout();
      metricsRef.current.reset();
      useTrackingSettingsStore.getState().setRuntime(EMPTY_TRACKING_METRICS);
      if (usesVideoFrames) video.cancelVideoFrameCallback?.(frameHandle);
      else cancelAnimationFrame(frameHandle);
      inFlightRequestRef.current = null;
      lastInferenceTimeRef.current = 0;
    };
  }, [cameraReady, isReady, videoRef]);

  return { isReady, error };
}
