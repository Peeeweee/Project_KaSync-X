import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTargetInferenceFps } from './trackingSettings';

describe('getTargetInferenceFps', () => {
  it('maps quality modes to predictable inference budgets', () => {
    expect(getTargetInferenceFps('audio', false)).toBe(36);
    expect(getTargetInferenceFps('performance', false)).toBe(24);
    expect(getTargetInferenceFps('balanced', false)).toBe(30);
    expect(getTargetInferenceFps('auto', false)).toBe(30);
    expect(getTargetInferenceFps('quality', false)).toBe(30);
  });

  it('protects audio by reducing every mode during sustained low FPS', () => {
    expect(getTargetInferenceFps('quality', true)).toBe(18);
  });
});

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('stored pinch calibration', () => {
  it('migrates old calibration while preserving the other camera preferences', async () => {
    localStorage.setItem('kasync-tracking-v1', JSON.stringify({
      pinchThreshold: 0.55, pinchReleaseThreshold: 0.75,
      smoothingAlpha: 0.63, quality: 'balanced', mirrorCamera: false,
    }));
    const { useTrackingSettingsStore } = await import('./trackingSettings');
    expect(useTrackingSettingsStore.getState()).toMatchObject({
      pinchThreshold: 0.32, pinchReleaseThreshold: 0.36, pinchMetricVersion: 2,
      smoothingAlpha: 0.63, quality: 'balanced', mirrorCamera: false,
    });
  });
  it('round-trips a new calibration and its metric version', async () => {
    const { useTrackingSettingsStore } = await import('./trackingSettings');
    useTrackingSettingsStore.getState().setPreferences({ pinchThreshold: 0.18, pinchReleaseThreshold: 0.23 });
    expect(JSON.parse(localStorage.getItem('kasync-tracking-v1')!)).toMatchObject({
      pinchThreshold: 0.18, pinchReleaseThreshold: 0.23, pinchMetricVersion: 2,
    });
    vi.resetModules();
    const restored = await import('./trackingSettings');
    expect(restored.useTrackingSettingsStore.getState().pinchReleaseThreshold).toBe(0.23);
  });
  it('does not accept string thresholds from storage or live preference changes', async () => {
    localStorage.setItem('kasync-tracking-v1', JSON.stringify({
      pinchMetricVersion: 2, pinchThreshold: '0.32', pinchReleaseThreshold: 'invalid',
    }));
    const { useTrackingSettingsStore } = await import('./trackingSettings');
    expect(useTrackingSettingsStore.getState().pinchThreshold).toBe(0.32);
    expect(useTrackingSettingsStore.getState().pinchReleaseThreshold).toBe(0.36);
    useTrackingSettingsStore.getState().setPreference('pinchThreshold', Number.NaN);
    expect(useTrackingSettingsStore.getState().pinchThreshold).toBe(0.32);
  });
});
