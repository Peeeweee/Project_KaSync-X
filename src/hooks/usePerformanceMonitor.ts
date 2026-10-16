import { useEffect } from 'react';
import { useTrackingSettingsStore } from '../store/trackingSettings';

export function usePerformanceMonitor(
  thresholdFps: number = 18,
  durationMs: number = 10000,
  recoveryDurationMs: number = 2500,
) {
  void thresholdFps;
  void durationMs;
  void recoveryDurationMs;
  useEffect(() => {
    // Ensure optimal performance: maintain full frame rate and clear any throttles
    useTrackingSettingsStore.getState().setLowPerformance(false);
    if (typeof document !== 'undefined') {
      document.body.classList.remove('low-perf-mode');
    }
  }, []);

  return false;
}
