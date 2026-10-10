import { useState } from 'react';
import { useHandStore } from '../store/handState';
import {
  useTrackingSettingsStore,
  type TrackingQuality,
} from '../store/trackingSettings';
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

export function TrackingSettingsPanel() {
  const settings = useTrackingSettingsStore();
  const livePinchDistance = useHandStore((state) => state.smoothedHands[0]?.pinchDistance ?? null);
  const [openDistance, setOpenDistance] = useState<number | null>(null);
  const [calibrationMessage, setCalibrationMessage] = useState('Show one open hand, then capture.');

  if (!settings.isPanelOpen) return null;

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
      aria-label="Hand tracking settings"
      className="absolute bottom-14 right-6 z-50 w-[min(22rem,calc(100vw-3rem))] border border-[var(--color-secondary)]/40 bg-[#070912]/95 p-4 text-white shadow-[0_0_28px_rgba(47,217,196,0.22)] backdrop-blur-xl"
      style={{ clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)' }}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--color-secondary)]">Tracking Core</div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/45">
            {settings.backend ? backendLabels[settings.backend] : 'Starting'} · {settings.targetFps} FPS target
            {settings.inferenceLatencyMs !== null ? ` · ${settings.inferenceLatencyMs.toFixed(0)} ms` : ''}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close tracking settings"
          onClick={() => settings.setPanelOpen(false)}
          className="px-2 text-lg leading-none text-white/50 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">
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
