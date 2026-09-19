import { useEffect, useState } from 'react';

export function usePerformanceMonitor(thresholdFps: number = 20, durationMs: number = 8000) {
  const [isLowPerfMode, setIsLowPerfMode] = useState(false);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let lowFpsStartTime: number | null = null;
    let animationFrameId: number;

    const checkPerformance = (time: number) => {
      frameCount++;
      const elapsed = time - lastTime;

      // Check every 500ms
      if (elapsed >= 500) {
        const currentFps = (frameCount * 1000) / elapsed;
        
        if (currentFps < thresholdFps) {
          if (lowFpsStartTime === null) {
            lowFpsStartTime = time;
          } else if (time - lowFpsStartTime >= durationMs) {
            // Sustained low FPS
            setIsLowPerfMode(true);
            document.body.classList.add('low-perf-mode');
          }
        } else {
          // Recovered
          lowFpsStartTime = null;
        }

        frameCount = 0;
        lastTime = time;
      }

      animationFrameId = requestAnimationFrame(checkPerformance);
    };

    animationFrameId = requestAnimationFrame(checkPerformance);

    return () => cancelAnimationFrame(animationFrameId);
  }, [thresholdFps, durationMs]);

  return isLowPerfMode;
}
