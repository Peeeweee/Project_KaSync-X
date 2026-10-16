import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Category, Landmark } from '@mediapipe/tasks-vision';
import { useHandTracking } from './useHandTracking';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useHandStore } from '../store/handState';

const { mainDetect, mainClose } = vi.hoisted(() => ({
  mainDetect: vi.fn<(input: unknown, timestamp: number) => { landmarks: Landmark[][]; handednesses: Category[][] }>().mockReturnValue({ landmarks: [], handednesses: [] }), mainClose: vi.fn(),
}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
  HandLandmarker: { createFromOptions: vi.fn().mockResolvedValue({ detectForVideo: mainDetect, close: mainClose }) },
}));

class TrackingWorkerMock {
  static instance: TrackingWorkerMock;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  static options: WorkerOptions | undefined;
  constructor(_url: URL, options?: WorkerOptions) {
    TrackingWorkerMock.instance = this;
    TrackingWorkerMock.options = options;
  }
  receive(data: object) { this.onmessage?.({ data } as MessageEvent); }
}

beforeEach(() => {
  useTrackingSettingsStore.getState().setPreference('trackingEngine', 'worker');
});

afterEach(() => {
  mainDetect.mockReturnValue({ landmarks: [], handednesses: [] });
  useTrackingSettingsStore.getState().setPreference('trackingEngine', 'compatible');
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('camera frame scheduling', () => {
  it('avoids repeated inference on unchanged video frames in the rAF fallback', async () => {
    vi.stubGlobal('Worker', TrackingWorkerMock);
    const image = { close: vi.fn(), width: 460, height: 345 };
    const capture = vi.fn().mockResolvedValue(image);
    vi.stubGlobal('createImageBitmap', capture);
    const stop = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
    } });
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 640 }, videoHeight: { value: 480 },
      readyState: { value: 4 }, paused: { value: false },
      requestVideoFrameCallback: { value: undefined },
    });
    video.play = vi.fn().mockResolvedValue(undefined);
    let nextFrame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const videoRef = { current: video };
    const hook = renderHook(() => useHandTracking(videoRef));
    try {
      await waitFor(() => expect(TrackingWorkerMock.instance).toBeDefined());
      await act(async () => {
        TrackingWorkerMock.instance.receive({ type: 'INIT_DONE', backend: 'worker-gpu' });
      });
      await act(async () => { nextFrame(100); });
      expect(capture).toHaveBeenCalledTimes(1);
      expect(TrackingWorkerMock.options?.type).not.toBe('module');
      expect(useTrackingSettingsStore.getState().inferenceWidth).toBe(460);
      const request = TrackingWorkerMock.instance.postMessage.mock.calls.find(([message]) => message.type === 'PROCESS')![0];
      await act(async () => {
        TrackingWorkerMock.instance.receive({
          type: 'RESULTS', requestId: request.requestId, landmarks: [], handednesses: [], inferenceMs: 5,
        });
      });
      await act(async () => { nextFrame(150); });
      expect(capture).toHaveBeenCalledTimes(1);
      video.currentTime = 1 / 30;
      await act(async () => { nextFrame(200); });
      expect(capture).toHaveBeenCalledTimes(2);
      expect(useTrackingSettingsStore.getState().pipelineLatencyMs).not.toBeNull();
    } finally {
      hook.unmount();
    }
    expect(stop).toHaveBeenCalledTimes(1);
    expect(TrackingWorkerMock.instance.terminate).toHaveBeenCalledTimes(1);
    expect(useTrackingSettingsStore.getState().actualTrackingFps).toBeNull();
    expect(useHandStore.getState().smoothedHands).toEqual([]);
  });
});

describe('worker failure recovery', () => {
  it('records the fallback reason and downscales main-thread inference', async () => {
    vi.stubGlobal('Worker', TrackingWorkerMock);
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.stubGlobal('navigator', { mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    } });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 1280 }, videoHeight: { value: 720 },
      readyState: { value: 4 }, paused: { value: false },
      requestVideoFrameCallback: { value: undefined },
    });
    video.play = vi.fn().mockResolvedValue(undefined);
    let nextFrame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const videoRef = { current: video };
    const hook = renderHook(() => useHandTracking(videoRef));
    try {
      await waitFor(() => expect(TrackingWorkerMock.instance.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'INIT' })));
      await act(async () => { TrackingWorkerMock.instance.receive({ type: 'INIT_ERROR', error: 'GPU context unavailable' }); });
      await waitFor(() => expect(hook.result.current.isReady).toBe(true));
      expect(useTrackingSettingsStore.getState().backend).toBe('main-gpu');
      expect(useTrackingSettingsStore.getState().fallbackReason).toBe('GPU context unavailable');
      await act(async () => { nextFrame(100); });
      await waitFor(() => expect(mainDetect).toHaveBeenCalledTimes(1));
      expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 460, 259);
      expect(mainDetect.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement);
      expect(useTrackingSettingsStore.getState().inferenceWidth).toBe(460);
      expect(useTrackingSettingsStore.getState().inferenceHeight).toBe(259);
    } finally { hook.unmount(); }
    expect(mainClose).toHaveBeenCalledTimes(1);
  });
});

describe('compatible live tracking recovery', () => {
  it('detects directly from video and publishes hands without starting a worker', async () => {
    useTrackingSettingsStore.getState().setPreference('trackingEngine', 'compatible');
    const originalAlpha = useTrackingSettingsStore.getState().smoothingAlpha;
    useTrackingSettingsStore.getState().setPreference('smoothingAlpha', 0.05);
    const workerConstructor = vi.fn();
    vi.stubGlobal('Worker', workerConstructor);
    const capture = vi.fn();
    vi.stubGlobal('createImageBitmap', capture);
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const video = document.createElement('video');
    Object.defineProperties(video, {
      videoWidth: { value: 1280 }, videoHeight: { value: 720 }, readyState: { value: 4 },
      paused: { value: false }, requestVideoFrameCallback: { value: undefined },
    });
    video.play = vi.fn().mockResolvedValue(undefined);
    let nextFrame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { nextFrame = callback; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    mainDetect.mockReturnValue({ landmarks: [Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))], handednesses: [] });
    const videoRef = { current: video };
    const hook = renderHook(() => useHandTracking(videoRef));
    try {
      await waitFor(() => expect(hook.result.current.isReady).toBe(true));
      await act(async () => { nextFrame(100); });
      await waitFor(() => expect(mainDetect).toHaveBeenCalledTimes(1));
      expect(mainDetect.mock.calls[0][0]).toBe(video);
      expect(workerConstructor).not.toHaveBeenCalled();
      expect(capture).not.toHaveBeenCalled();
      expect(useHandStore.getState().isTracking).toBe(true);
      expect(useHandStore.getState().smoothedHands).toHaveLength(1);
      expect(useHandStore.getState().smoothedHands[0].isTriggerActive).toBe(true);
      const pose = (tipY: number) => {
        const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
        landmarks[0] = { x: 0.5, y: 0.7, z: 0 };
        landmarks[4] = { x: 0.8, y: 0.7, z: 0 };
        landmarks[5] = { x: 0.4, y: 0.5, z: 0 };
        landmarks[6] = { x: 0.4, y: 0.4, z: 0 };
        landmarks[8] = { x: 0.4, y: tipY, z: -0.12 };
        landmarks[17] = { x: 0.6, y: 0.5, z: 0 };
        return landmarks;
      };
      // Raw motion must drive taps even with position smoothing; static forward depth
      // cannot keep the vertical tap held after the finger lifts.
      for (const [time, tipY, expected] of [[200, 0.3, false], [300, 0.3, false],
        [400, 0.45, true], [500, 0.3, false]] as const) {
        mainDetect.mockReturnValue({ landmarks: [pose(tipY)], handednesses: [] });
        video.currentTime = time / 1000;
        await act(async () => { nextFrame(time); });
        await waitFor(() => expect(mainDetect).toHaveBeenLastCalledWith(video, time));
        expect(useHandStore.getState().smoothedHands[0].isPointPressed).toBe(expected);
        expect(useHandStore.getState().rawHands[0].isPointPressed).toBe(expected);
        if (time === 200) expect(useHandStore.getState().smoothedHands[0].isPinching).toBe(false);
      }
      // Keep thumb/index closed while moving the whole pinch back and forward.
      // Camera approach and retreat must never manufacture key-up or re-strikes.
      let firstPressId = 0;
      for (const [time, scale, expected] of [[600, 1, null], [700, 1, null],
        [800, 1, true], [900, 1.06, true], [1000, 1, true], [1100, 1.06, true]] as const) {
        const landmarks = pose(0.3);
        landmarks[4] = { ...landmarks[8] };
        const transformed = landmarks.map(p => ({ x: 0.5 + (p.x - 0.5) * scale,
          y: 0.5 + (p.y - 0.5) * scale, z: p.z * scale }));
        mainDetect.mockReturnValue({ landmarks: [transformed], handednesses: [] });
        video.currentTime = time / 1000;
        await act(async () => { nextFrame(time); });
        await waitFor(() => expect(mainDetect).toHaveBeenLastCalledWith(video, time));
        const hand = useHandStore.getState().smoothedHands[0];
        if (expected !== null) {
          expect(hand.isPinching).toBe(true);
          expect(hand.isKeyDown).toBe(expected);
        }
        if (time === 800) firstPressId = hand.pressId!;
        if (time >= 900) expect(hand.pressId).toBe(firstPressId);
      }
      act(() => useTrackingSettingsStore.getState().restartTracking());
      await waitFor(() => expect(mainClose).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(hook.result.current.isReady).toBe(true));
      expect(getUserMedia).toHaveBeenCalledTimes(1);
    } finally {
      hook.unmount();
      useTrackingSettingsStore.getState().setPreference('smoothingAlpha', originalAlpha);
    }
  });
});
