import { create } from 'zustand';
import type { HandData } from '../store/handState';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useMusicStore } from '../store/musicState';

export type ExpectedGesture = 'unlabelled' | 'no-hands' | 'open' | 'pinch' | 'point';
export interface CaptureFrame {
  elapsedMs: number;
  inferenceMs: number;
  pipelineMs: number;
  captureMs: number;
  hands: number;
  pinching: boolean;
  pointing: boolean;
  matchesExpected: boolean | null;
  backend: string | null;
  fallbackReason: string | null;
  inferenceWidth: number | null;
  inferenceHeight: number | null;
  quality: string;
  trackingEngine: string;
  smoothingAlpha: number;
  pinchThreshold: number;
  pinchReleaseThreshold: number;
  pinchMetricVersion?: number;
  targetFps: number;
  mirrorCamera: boolean;
  keyStates?: { hand: string; pinching: boolean; down: boolean; pressId: number; reason: string | null;
    pinchDistance: number; point: boolean; role: string | null }[];
  selectedRoot?: string | null;
  selectedQuality?: string | null;
  playingNotes?: string[];
}
export interface CaptureReport {
  schemaVersion: 1;
  startedAt: string;
  durationMs: number;
  expectedGesture: ExpectedGesture;
  settings: { quality: string; smoothingAlpha: number; pinchThreshold: number; pinchReleaseThreshold: number; targetFps: number; pinchMetricVersion?: number };
  summary: {
    frames: number; completedFps: number;
    inferenceAvgMs: number | null; pipelineAvgMs: number | null; pipelineP95Ms: number | null;
    captureAvgMs: number | null; labelledAgreementPercent: number | null;
  };
  notes: string;
  frames: CaptureFrame[];
}
interface CaptureState {
  status: 'idle' | 'countdown' | 'recording';
  report: CaptureReport | null;
}
export const useTrackingCaptureStore = create<CaptureState>(() => ({ status: 'idle', report: null }));
let session: { start: number; startedAt: string; expected: ExpectedGesture; settings: CaptureReport['settings']; frames: CaptureFrame[] } | null = null;
let startTimer: ReturnType<typeof setTimeout> | undefined;
let stopTimer: ReturnType<typeof setTimeout> | undefined;

export function matchesExpectedGesture(expected: ExpectedGesture, hands: HandData[]): boolean | null {
  if (expected === 'unlabelled') return null;
  if (expected === 'no-hands') return hands.length === 0;
  if (hands.length !== 1) return false;
  if (expected === 'pinch') return hands[0].isPinching;
  if (expected === 'point') return !!hands[0].isPointPressed && !hands[0].isPinching;
  return !hands[0].isPinching && !hands[0].isPointPressed;
}

export function startTrackingCapture(expected: ExpectedGesture) {
  if (session) return;
  const settings = useTrackingSettingsStore.getState();
  session = {
    start: performance.now() + 3000,
    startedAt: new Date(Date.now() + 3000).toISOString(), expected,
    settings: { quality: settings.quality, smoothingAlpha: settings.smoothingAlpha,
      pinchThreshold: settings.pinchThreshold, pinchReleaseThreshold: settings.pinchReleaseThreshold,
      pinchMetricVersion: settings.pinchMetricVersion, targetFps: settings.targetFps },
    frames: [],
  };
  useTrackingCaptureStore.setState({ status: 'countdown', report: null });
  startTimer = setTimeout(() => useTrackingCaptureStore.setState({ status: 'recording' }), 3000);
  stopTimer = setTimeout(() => stopTrackingCapture(), 33000);
}

export function stopTrackingCapture(now = performance.now()) {
  clearTimeout(startTimer);
  clearTimeout(stopTimer);
  const current = session;
  session = null;
  if (!current) return;
  const durationMs = Math.max(0, Math.min(30000, now - current.start));
  const frames = current.frames;
  const avg = (key: 'inferenceMs' | 'pipelineMs' | 'captureMs') => frames.length
    ? frames.reduce((sum, frame) => sum + frame[key], 0) / frames.length : null;
  const sorted = frames.map(frame => frame.pipelineMs).sort((a, b) => a - b);
  const labelled = frames.filter(frame => frame.matchesExpected !== null);
  const report: CaptureReport = {
    schemaVersion: 1, startedAt: current.startedAt, durationMs, expectedGesture: current.expected,
    settings: current.settings,
    summary: {
      frames: frames.length, completedFps: durationMs > 0 ? frames.length * 1000 / durationMs : 0,
      inferenceAvgMs: avg('inferenceMs'), pipelineAvgMs: avg('pipelineMs'), captureAvgMs: avg('captureMs'),
      pipelineP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
      labelledAgreementPercent: labelled.length ? labelled.filter(frame => frame.matchesExpected).length * 100 / labelled.length : null,
    },
    notes: 'Local numeric capture only; no video, images, or landmarks. Agreement compares completed frames with the user-selected expected pose; it is not model accuracy. Unprocessed camera frames are not scored. Pipeline excludes camera exposure, presentation, and audio output.',
    frames,
  };
  useTrackingCaptureStore.setState({ status: 'idle', report });
}

/** Called only for completed detections, including empty results. No UI updates per sample. */
export function recordTrackingCapture(now: number, inferenceMs: number, pipelineMs: number, captureMs: number, hands: HandData[]) {
  if (!session || now < session.start) return;
  if (now >= session.start + 30000) { stopTrackingCapture(now); return; }
  if (session.frames.length >= 3600) { stopTrackingCapture(now); return; }
  const settings = useTrackingSettingsStore.getState();
  session.frames.push({
    elapsedMs: now - session.start, inferenceMs, pipelineMs, captureMs,
    hands: hands.length, pinching: hands.some(hand => hand.isPinching),
    pointing: hands.some(hand => !!hand.isPointPressed),
    keyStates: hands.map(hand => ({ hand: hand.handedness, pinching: hand.isPinching,
      down: hand.isKeyDown ?? (hand.isPinching || !!hand.isPointPressed), pressId: hand.pressId ?? 0,
      reason: hand.articulationReason ?? null, pinchDistance: hand.pinchDistance,
      point: !!hand.isPointPressed, role: hand.screenRole ?? null })),
    selectedRoot: useMusicStore.getState().hoveredRoot,
    selectedQuality: useMusicStore.getState().hoveredQuality,
    playingNotes: [...useMusicStore.getState().playingNotes],
    matchesExpected: matchesExpectedGesture(session.expected, hands),
    backend: settings.backend, quality: settings.quality, trackingEngine: settings.trackingEngine,
    fallbackReason: settings.fallbackReason, inferenceWidth: settings.inferenceWidth, inferenceHeight: settings.inferenceHeight,
    smoothingAlpha: settings.smoothingAlpha, pinchThreshold: settings.pinchThreshold,
    pinchReleaseThreshold: settings.pinchReleaseThreshold, targetFps: settings.targetFps,
    pinchMetricVersion: settings.pinchMetricVersion,
    mirrorCamera: settings.mirrorCamera,
  });
}

export function downloadTrackingCapture() {
  const report = useTrackingCaptureStore.getState().report;
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kasync-tracking-${report.startedAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
