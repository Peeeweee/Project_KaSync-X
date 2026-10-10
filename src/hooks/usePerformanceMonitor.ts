import { useEffect, useState } from 'react';
import { useTrackingSettingsStore } from '../store/trackingSettings';

export function usePerformanceMonitor(
  thresholdFps: number = 20,
  durationMs: number = 8000,
  recoveryDurationMs: number = 3000,
) {
  const [isLowPerfMode, setIsLowPerfMode] = useState(false);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let lowFpsStartTime: number | null = null;
    let recoveryStartTime: number | null = null;
    let lowPerfActive = false;
    let animationFrameId: number;

    const checkPerformance = (time: number) => {
      frameCount++;
      const elapsed = time - lastTime;

      // Check every 500ms
      if (elapsed >= 500) {
        const currentFps = (frameCount * 1000) / elapsed;
        
        if (currentFps < thresholdFps) {
          recoveryStartTime = null;
          if (lowFpsStartTime === null) {
            lowFpsStartTime = time;
          } else if (!lowPerfActive && time - lowFpsStartTime >= durationMs) {
            // Sustained low FPS
            lowPerfActive = true;
            setIsLowPerfMode(true);
            useTrackingSettingsStore.getState().setLowPerformance(true);
            document.body.classList.add('low-perf-mode');
          }
        } else {
          lowFpsStartTime = null;
          if (lowPerfActive) {
            if (recoveryStartTime === null) {
              recoveryStartTime = time;
            } else if (time - recoveryStartTime >= recoveryDurationMs) {
              lowPerfActive = false;
              recoveryStartTime = null;
              setIsLowPerfMode(false);
              useTrackingSettingsStore.getState().setLowPerformance(false);
              document.body.classList.remove('low-perf-mode');
            }
          }
        }

        frameCount = 0;
        lastTime = time;
      }

      animationFrameId = requestAnimationFrame(checkPerformance);
    };

    animationFrameId = requestAnimationFrame(checkPerformance);

    return () => {
      cancelAnimationFrame(animationFrameId);
      useTrackingSettingsStore.getState().setLowPerformance(false);
      document.body.classList.remove('low-perf-mode');
    };
  }, [thresholdFps, durationMs, recoveryDurationMs]);

  return isLowPerfMode;
}
