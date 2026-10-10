import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Category, HandLandmarker, Landmark } from '@mediapipe/tasks-vision';
import { useHandStore } from '../store/handState';
import type { HandData } from '../store/handState';
import { useTrackingSettingsStore, getTargetInferenceFps } from '../store/trackingSettings';
import { HandEmaFilter } from '../tracking/emaFilter';
import { computeGestures } from '../tracking/gestureRecognizer';
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
  const inFlightRequestRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(0);
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
    if (!video) return;

    const detections = sortDetections(landmarks, handednesses);
    const rawLandmarks = detections.map(detection => detection.landmarks);
    const smoothedLandmarks = emaFilterRef.current.filter(rawLandmarks);
    const currentKeys = new Set<string>();
    const settings = settingsRef.current;

    const smoothedHands: HandData[] = smoothedLandmarks.map((handLandmarks, index) => {
      const handedness = detections[index]?.handedness ?? 'Unknown';
      const identityKey = handedness === 'Unknown' ? `hand-${index}` : handedness;
      currentKeys.add(identityKey);
      const gestures = computeGestures(handLandmarks, video, {
        previousPinching: previousPinchesRef.current.get(identityKey) ?? false,
        pinchThreshold: settings.pinchThreshold,
        pinchReleaseThreshold: settings.pinchReleaseThreshold,
        mirrored: settings.mirrorCamera,
      });
      previousPinchesRef.current.set(identityKey, gestures.isPinching);
      return { landmarks: handLandmarks, handedness, ...gestures };
    });

    for (const key of previousPinchesRef.current.keys()) {
      if (!currentKeys.has(key)) previousPinchesRef.current.delete(key);
    }

    const roleAssignedHands = roleTrackerRef.current.assign(smoothedHands);
    const rawHands: HandData[] = rawLandmarks.map((handLandmarks, index) => {
      const handedness = detections[index]?.handedness ?? 'Unknown';
      const gestures = computeGestures(handLandmarks, video, {
        previousPinching: roleAssignedHands[index]?.isPinching ?? false,
        pinchThreshold: settings.pinchThreshold,
        pinchReleaseThreshold: settings.pinchReleaseThreshold,
        mirrored: settings.mirrorCamera,
      });
      return {
        landmarks: handLandmarks,
        handedness,
        ...gestures,
        isPinching: roleAssignedHands[index]?.isPinching ?? gestures.isPinching,
        screenRole: roleAssignedHands[index]?.screenRole,
      };
    });

    const handStore = useHandStore.getState();
    handStore.setHands(rawHands, roleAssignedHands);
    handStore.setIsTracking(roleAssignedHands.length > 0);
    useTrackingSettingsStore.getState().setRuntime({ inferenceLatencyMs: inferenceMs });
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

    let active = true;
    let stream: MediaStream | null = null;
    setCameraReady(false);
    setError(null);

    const preferredConstraints: MediaTrackConstraints = deviceId
      ? {
          deviceId: { exact: deviceId },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24 },
        }
      : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };

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
      active = false;
      setCameraReady(false);
      stream?.getTracks().forEach(track => track.stop());
      if (video.srcObject === stream) video.srcObject = null;
      emaFilterRef.current.reset();
      roleTrackerRef.current.reset();
      previousPinchesRef.current.clear();
      inFlightRequestRef.current = null;
      lastInferenceTimeRef.current = 0;
      const handStore = useHandStore.getState();
      handStore.setHands([], []);
      handStore.setIsTracking(false);
    };
  }, [deviceId, videoRef]);

  // Initialize the worker after camera permission. If module workers are blocked,
  // dynamically import MediaPipe and retain a lower-performance main-thread fallback.
  useEffect(() => {
    if (!hasCameraPermission) return;
    let active = true;
    let fallbackStarting = false;
    let initializationTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveProcessFailures = 0;

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
            minHandDetectionConfidence: 0.6,
            minHandPresenceConfidence: 0.6,
            minTrackingConfidence: 0.5,
          });
          backend = 'main-gpu';
        } catch {
          landmarker = await HandLandmarkerClass.createFromOptions(vision, {
            baseOptions: { modelAssetPath: '/hand_landmarker.task', delegate: 'CPU' },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.6,
            minHandPresenceConfidence: 0.6,
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

    const switchToMainThreadFallback = () => {
      if (!active || fallbackStarting) return;
      if (initializationTimer !== null) {
        clearTimeout(initializationTimer);
        initializationTimer = null;
      }
      workerRef.current?.terminate();
      workerRef.current = null;
      backendRef.current = null;
      inFlightRequestRef.current = null;
      setIsReady(false);
      void initializeMainThreadFallback();
    };
    activateMainFallbackRef.current = switchToMainThreadFallback;

    try {
      if (typeof createImageBitmap !== 'function') {
        console.warn('ImageBitmap transfer unavailable; using main-thread tracking.');
        switchToMainThreadFallback();
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
        new URL('../tracking/handTracking.worker.ts', import.meta.url),
        { type: 'module', name: 'kasync-hand-tracking' },
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
          switchToMainThreadFallback();
        } else if (message.type === 'RESULTS') {
          if (message.requestId !== inFlightRequestRef.current) return;
          consecutiveProcessFailures = 0;
          frameTransferFailuresRef.current = 0;
          inFlightRequestRef.current = null;
          processResults(message.landmarks, message.handednesses, message.inferenceMs);
        } else if (message.type === 'PROCESS_ERROR') {
          if (message.requestId === inFlightRequestRef.current) {
            inFlightRequestRef.current = null;
          }
          console.warn('Worker hand inference failed:', message.error);
          consecutiveProcessFailures++;
          if (consecutiveProcessFailures >= 3) switchToMainThreadFallback();
        }
      };
      worker.onerror = event => {
        if (!active || backendRef.current === 'main') return;
        console.warn('Hand-tracking worker crashed; using main-thread fallback.', event.message);
        switchToMainThreadFallback();
      };
      const initMessage: HandTrackingWorkerRequest = {
        type: 'INIT',
        wasmRoot: `${window.location.origin}/wasm`,
        modelAssetPath: '/hand_landmarker.task',
      };
      worker.postMessage(initMessage);
      initializationTimer = setTimeout(() => {
        console.warn('Hand-tracking worker timed out; using main-thread fallback.');
        switchToMainThreadFallback();
      }, 12_000);
    } catch (cause) {
      console.warn('Module workers unavailable; using main-thread tracking.', cause);
      switchToMainThreadFallback();
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
  }, [hasCameraPermission, videoRef]);

  // Schedule inference from decoded video frames. Exactly one request can be in flight.
  useEffect(() => {
    if (!cameraReady || !isReady || !videoRef.current) return;
    const video = videoRef.current as VideoWithFrameCallback;
    let active = true;
    let frameHandle = 0;
    let usesVideoFrames = false;

    const runInference = (timestamp: number) => {
      if (!active || inFlightRequestRef.current !== null) return;
      const settings = settingsRef.current;
      const targetFps = getTargetInferenceFps(settings.quality, settings.isLowPerformance);
      const intervalMs = 1000 / targetFps;
      if (timestamp - lastInferenceTimeRef.current < intervalMs) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.paused) return;

      lastInferenceTimeRef.current = timestamp;
      const requestId = ++requestSequenceRef.current;
      inFlightRequestRef.current = requestId;
      if (useTrackingSettingsStore.getState().targetFps !== targetFps) {
        useTrackingSettingsStore.getState().setRuntime({ targetFps });
      }

      if (backendRef.current === 'worker' && workerRef.current) {
        void createImageBitmap(video)
          .then(image => {
            if (!active || !workerRef.current || inFlightRequestRef.current !== requestId) {
              image.close();
              return;
            }
            const message: HandTrackingWorkerRequest = { type: 'PROCESS', image, timestamp, requestId };
            workerRef.current.postMessage(message, [image]);
          })
          .catch(cause => {
            if (inFlightRequestRef.current === requestId) inFlightRequestRef.current = null;
            console.warn('Unable to transfer camera frame to tracking worker:', cause);
            frameTransferFailuresRef.current++;
            if (frameTransferFailuresRef.current >= 3) activateMainFallbackRef.current?.();
          });
        return;
      }

      setTimeout(() => {
        if (!active || inFlightRequestRef.current !== requestId || !landmarkerRef.current) return;
        const startedAt = performance.now();
        try {
          const results = landmarkerRef.current.detectForVideo(video, timestamp);
          processResults(results.landmarks, results.handednesses, performance.now() - startedAt);
        } catch (cause) {
          console.warn('Main-thread hand inference failed:', cause);
        } finally {
          if (inFlightRequestRef.current === requestId) inFlightRequestRef.current = null;
        }
      }, 0);
    };

    const scheduleNext = () => {
      if (!active) return;
      if (video.requestVideoFrameCallback) {
        usesVideoFrames = true;
        frameHandle = video.requestVideoFrameCallback((now) => {
          runInference(now);
          scheduleNext();
        });
      } else {
        frameHandle = requestAnimationFrame(now => {
          runInference(now);
          scheduleNext();
        });
      }
    };

    scheduleNext();
    return () => {
      active = false;
      if (usesVideoFrames) video.cancelVideoFrameCallback?.(frameHandle);
      else cancelAnimationFrame(frameHandle);
      inFlightRequestRef.current = null;
      lastInferenceTimeRef.current = 0;
    };
  }, [cameraReady, isReady, videoRef]);

  return { isReady, error };
}
