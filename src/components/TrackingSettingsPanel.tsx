import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useHandStore } from '../store/handState';
import {
  useTrackingSettingsStore,
  type TrackingQuality,
} from '../store/trackingSettings';
import { cancelBackendBenchmark } from '../diagnostics/backendBenchmark';
import { BackendBenchmarkPanel } from './BackendBenchmarkPanel';
import { TrackingCapturePanel } from './TrackingCapturePanel';
import { WakandanSelect } from './WakandanSelect';

const qualityLabels: Record<TrackingQuality, string> = {
  auto: 'Auto',
  audio: 'Audio priority',
  performance: 'Performance',
  balanced: 'Balanced',
  quality: 'High quality',
};

const backendLabels = {
  'worker-gpu': 'Worker / GPU',
  'worker-cpu': 'Worker / CPU',
  'main-gpu': 'Main / GPU',
  'main-cpu': 'Main / CPU',
} as const;

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.16em] text-white/70">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--color-secondary)]"
      />
    </label>
  );
}

function LiveGestureStatus() {
  const pose = useHandStore(state => state.smoothedHands.map(hand =>
    `${hand.screenRole ?? hand.handedness}: ${hand.articulationReason === 'navigation' ? 'NAVIGATING' : hand.isKeyDown ? 'PRESSED' : hand.isPinching ? 'LIFTED / PINCHED' : 'RELAXED'}`,
  ).join(' · ') || 'No hands');
  const [tapCount, setTapCount] = useState(0);
  useEffect(() => {
    let previous = new Map<string, { down: boolean; id: number }>();
    return useHandStore.subscribe(state => {
      const current = new Map(state.smoothedHands.map(h => [h.handedness, {
        down: h.isKeyDown ?? (h.isPinching || !!h.isPointPressed), id: h.pressId ?? 0,
      }]));
      const fresh = [...current].filter(([key, press]) => press.down &&
        (!previous.get(key)?.down || previous.get(key)?.id !== press.id)).length;
      previous = current;
      if (fresh > 0) setTapCount(count => count + fresh);
    });
  }, []);
  return <div className="space-y-1 rounded border border-white/15 p-3 text-[10px] text-white/70" aria-label="Live gesture recognition">
    <p className="font-mono text-[var(--color-secondary)]">{pose}</p>
    <p>Detected presses: {tapCount}</p>
    <p className="text-white/45">Close your pinch to play, keep it closed to move between notes, and open it to release. Close and open quickly for staccato; hold for longer notes. Moving toward or away from the camera does not cut the sound.</p>
  </div>;
}

export function TrackingSettingsPanel() {
  const isPanelOpen = useTrackingSettingsStore((state) => state.isPanelOpen);
  if (!isPanelOpen) return null;
  return createPortal(<TrackingSettingsContent />, document.body);
}

function TrackingSettingsContent() {
  const settings = useTrackingSettingsStore();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') useTrackingSettingsStore.getState().setPanelOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const livePinchDistance = useHandStore((state) => state.smoothedHands[0]?.pinchDistance ?? null);
  const [openDistance, setOpenDistance] = useState<number | null>(null);
  const [calibrationMessage, setCalibrationMessage] = useState('Show one open hand, then capture.');

  const captureOpen = () => {
    if (livePinchDistance === null) {
      setCalibrationMessage('No hand detected. Hold one hand inside the camera view.');
      return;
    }
    setOpenDistance(livePinchDistance);
    setCalibrationMessage('Now touch thumb to index finger and capture pinch.');
  };

  const capturePinch = () => {
    if (livePinchDistance === null || openDistance === null) {
      setCalibrationMessage(openDistance === null ? 'Capture an open hand first.' : 'No hand detected.');
      return;
    }
    if (livePinchDistance >= openDistance - 0.08) {
      setCalibrationMessage('Pinch more tightly, then try again.');
      return;
    }

    const range = openDistance - livePinchDistance;
    const attack = Math.min(0.55, Math.max(0.18, livePinchDistance + range * 0.28));
    const release = Math.min(0.75, Math.max(attack + 0.06, livePinchDistance + range * 0.43));
    settings.setPreferences({ pinchThreshold: attack, pinchReleaseThreshold: release });
    setOpenDistance(null);
    setCalibrationMessage('Calibrated. Pinch transitions now match your hand and camera.');
  };

  const reset = () => {
    settings.resetPreferences();
    setOpenDistance(null);
    setCalibrationMessage('Defaults restored. Show one open hand to recalibrate.');
  };

  return (
    <section
      id="kasync-tracking-settings"
      role="dialog"
      aria-label="Hand tracking settings"
      className="kasync-tracking-panel"
    >
      <div className="kasync-tracking-header flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-secondary)]">Tracking Core</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/45">
            {settings.backend ? backendLabels[settings.backend] : 'Starting'} · {settings.targetFps} FPS target
            {settings.inferenceLatencyMs !== null ? ` · ${settings.inferenceLatencyMs.toFixed(0)} ms` : ''}
          </div>
        </div>
        <button
          type="button"
          ref={closeButtonRef}
          aria-label="Close tracking settings"
          onClick={() => settings.setPanelOpen(false)}
          className="shrink-0 rounded border border-white/15 px-2 py-1 text-lg leading-none text-white/70 hover:text-white focus-visible:outline-2 focus-visible:outline-[var(--color-secondary)]"
        >
          ×
        </button>
      </div>

      <div className="shrink-0 px-4 py-2"><LiveGestureStatus /></div>
      <div className="kasync-tracking-content space-y-4">
        <dl className="grid grid-cols-2 gap-2 border-y border-white/10 py-3 font-mono text-[9px] text-white/60" aria-label="Live tracking performance">
          <div><dt>Actual tracking</dt><dd className="text-white">{settings.actualTrackingFps?.toFixed(1) ?? '—'} FPS</dd></div>
          <div><dt>Frame capture · avg</dt><dd className="text-white">{settings.captureLatencyMs?.toFixed(1) ?? '—'} ms</dd></div>
          <div><dt>Pipeline · avg</dt><dd className="text-white">{settings.pipelineLatencyMs?.toFixed(1) ?? '—'} ms</dd></div>
          <div><dt>Pipeline · p95</dt><dd className="text-white">{settings.pipelineP95Ms?.toFixed(1) ?? '—'} ms</dd></div>
        </dl>
        <p className="text-[9px] leading-relaxed text-white/45">Pipeline timings cover frame capture through gesture processing. They exclude camera exposure, display, and audio output delays.</p>
        <p className="font-mono text-[9px] text-white/60">Inference input: {settings.inferenceWidth && settings.inferenceHeight ? `${settings.inferenceWidth} × ${settings.inferenceHeight}` : 'Waiting for frames'}</p>
        {settings.fallbackReason && <p className="break-words text-[9px] leading-relaxed text-amber-300/80">Fallback reason: {settings.fallbackReason}</p>}
        <div className="space-y-2 border-y border-white/10 py-3">
          <label className="block text-[10px] uppercase tracking-wider text-white/70">
            Live tracking path
            <WakandanSelect aria-label="Live tracking path" value={settings.trackingEngine}
              onChange={event => { cancelBackendBenchmark(); settings.setPreference('trackingEngine', event.target.value as 'compatible' | 'worker'); }} className="mt-2 w-full">
              <option value="compatible">Compatible camera · recommended</option>
              <option value="worker">Worker · experimental</option>
            </WakandanSelect>
          </label>
          <button type="button" className="w-full rounded border border-[var(--color-secondary)]/40 px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--color-secondary)] hover:bg-white/5"
            onClick={() => {
              cancelBackendBenchmark();
              settings.setPreference('trackingEngine', 'compatible');
              settings.restartTracking();
            }}>Restore live tracking</button>
          <p className="text-[9px] leading-relaxed text-white/50">Compatible camera uses the original direct-video input. Use Restore if hands stop responding; the camera stays connected and your music settings are retained.</p>
        </div>
        <BackendBenchmarkPanel />
        <TrackingCapturePanel />
        <label className="block text-[10px] uppercase tracking-[0.16em] text-white/70">
          <span className="mb-1.5 block">Tracking quality</span>
          <WakandanSelect
            aria-label="Tracking quality"
            value={settings.quality}
            onChange={(event) => settings.setPreference('quality', event.target.value as TrackingQuality)}
            className="w-full text-[10px]"
          >
            {(Object.keys(qualityLabels) as TrackingQuality[]).map((quality) => (
              <option key={quality} value={quality} className="bg-[#070912] normal-case">
                {qualityLabels[quality]}
              </option>
            ))}
          </WakandanSelect>
        </label>

        <label className="block text-[10px] uppercase tracking-[0.16em] text-white/70">
          <span className="mb-1.5 flex justify-between"><span>Motion smoothing</span><span>{Math.round(settings.smoothingAlpha * 100)}%</span></span>
          <input
            aria-label="Motion smoothing"
            type="range"
            min="0.2"
            max="0.85"
            step="0.05"
            value={settings.smoothingAlpha}
            onChange={(event) => settings.setPreference('smoothingAlpha', Number(event.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-y border-white/10 py-3">
          <Toggle checked={settings.mirrorCamera} onChange={(value) => settings.setPreference('mirrorCamera', value)} label="Mirror" />
          <Toggle checked={settings.showHandOverlay} onChange={(value) => settings.setPreference('showHandOverlay', value)} label="Hand guide" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary-glow)]">Pinch calibration</span>
            <span className="font-mono text-[9px] text-white/50">Live {livePinchDistance?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="h-1.5 overflow-hidden bg-white/10">
            <div
              className="h-full bg-gradient-to-r from-[var(--color-secondary)] to-[var(--color-primary)] transition-[width] duration-100"
              style={{ width: `${Math.min(100, Math.max(0, (livePinchDistance ?? 0) / 1.5 * 100))}%` }}
            />
          </div>
          <p className="min-h-7 text-[9px] leading-relaxed tracking-wide text-white/50">{calibrationMessage}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={captureOpen} className="border border-white/15 px-2 py-2 text-[9px] uppercase tracking-wider text-white/70 hover:border-[var(--color-secondary)] hover:text-white">
              1 · Open hand
            </button>
            <button type="button" onClick={capturePinch} className="border border-[var(--color-primary)]/50 px-2 py-2 text-[9px] uppercase tracking-wider text-[var(--color-primary-glow)] hover:bg-[var(--color-primary)]/15">
              2 · Pinch
            </button>
          </div>
        </div>

        <button type="button" onClick={reset} className="text-[9px] uppercase tracking-[0.16em] text-white/35 hover:text-white/70">
          Reset tracking defaults
        </button>
      </div>
    </section>
  );
}
