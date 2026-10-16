import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesExpectedGesture, recordTrackingCapture, startTrackingCapture, stopTrackingCapture, useTrackingCaptureStore } from './trackingCapture';
import type { HandData } from '../store/handState';

const open: HandData = {
  landmarks: [], handedness: 'Left', isPinching: false, pinchStrength: 0,
  pinchDistance: 1, palmPosition: { x: 0.5, y: 0.5 },
  indexTipPosition: { x: 0.5, y: 0.5 }, handRotation: 0,
};
let now = 0;
beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  useTrackingCaptureStore.setState({ status: 'idle', report: null });
});
afterEach(() => {
  stopTrackingCapture();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('tracking capture', () => {
  it('excludes preparation frames and exports timings with labelled disagreements', () => {
    startTrackingCapture('open');
    recordTrackingCapture(1000, 10, 20, 2, [open]);
    now = 3000;
    vi.advanceTimersByTime(3000);
    expect(useTrackingCaptureStore.getState().status).toBe('recording');
    recordTrackingCapture(3000, 10, 20, 2, [open]);
    recordTrackingCapture(3500, 20, 40, 4, []);
    now = 4000;
    stopTrackingCapture();
    const report = useTrackingCaptureStore.getState().report!;
    expect(report.summary.frames).toBe(2);
    expect(report.summary.completedFps).toBe(2);
    expect(report.summary.pipelineAvgMs).toBe(30);
    expect(report.summary.pipelineP95Ms).toBe(40);
    expect(report.summary.labelledAgreementPercent).toBe(50);
    expect(report.frames[0]).not.toHaveProperty('landmarks');
    expect(report.frames[0].matchesExpected).toBe(true);
    expect(report.frames[0].keyStates).toEqual([{ hand: 'Left', pinching: false,
      down: false, pressId: 0, reason: null }]);
    expect(report.frames[1].matchesExpected).toBe(false);
    expect(useTrackingCaptureStore.getState().status).toBe('idle');
  });
  it('automatically stops and reports zero FPS when no results arrive', () => {
    startTrackingCapture('unlabelled');
    now = 33000;
    vi.advanceTimersByTime(33000);
    const report = useTrackingCaptureStore.getState().report!;
    expect(report.durationMs).toBe(30000);
    expect(report.summary.completedFps).toBe(0);
    expect(report.summary.pipelineP95Ms).toBeNull();
    expect(report.summary.labelledAgreementPercent).toBeNull();
  });
  it('can cancel preparation without leaving recording timers active', () => {
    startTrackingCapture('pinch');
    now = 500;
    stopTrackingCapture();
    vi.advanceTimersByTime(33000);
    expect(useTrackingCaptureStore.getState().status).toBe('idle');
    expect(useTrackingCaptureStore.getState().report!.durationMs).toBe(0);
  });
  it('scores exact single-hand poses and no-hands separately', () => {
    expect(matchesExpectedGesture('no-hands', [])).toBe(true);
    expect(matchesExpectedGesture('open', [])).toBe(false);
    expect(matchesExpectedGesture('open', [open, open])).toBe(false);
    expect(matchesExpectedGesture('pinch', [{ ...open, isPinching: true }])).toBe(true);
    expect(matchesExpectedGesture('point', [{ ...open, isPointPressed: true }])).toBe(true);
    expect(matchesExpectedGesture('point', [{ ...open, isPointPressed: true, isPinching: true }])).toBe(false);
    expect(matchesExpectedGesture('unlabelled', [open])).toBeNull();
  });
});
