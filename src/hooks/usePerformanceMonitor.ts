import { useEffect } from 'react';
import { useTrackingSettingsStore } from '../store/trackingSettings';

export function usePerformanceMonitor(
  _thresholdFps: number = 18,
  _durationMs: number = 10000,
  _recoveryDurationMs: number = 2500,
) {
  useEffect(() => {
    // Ensure optimal performance: maintain full frame rate and clear any throttles
    useTrackingSettingsStore.getState().setLowPerformance(false);
    if (typeof document !== 'undefined') {
      document.body.classList.remove('low-perf-mode');
    }
  }, []);

  return false;
}
