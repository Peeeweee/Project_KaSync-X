import { useBackendBenchmarkStore } from '../diagnostics/backendBenchmark';
import { useState } from 'react';
import { downloadTrackingCapture, startTrackingCapture, stopTrackingCapture, useTrackingCaptureStore, type ExpectedGesture } from '../diagnostics/trackingCapture';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { WakandanSelect } from './WakandanSelect';

const buttonClass = 'rounded border border-white/20 px-3 py-2 text-[9px] uppercase tracking-wide text-white/80 hover:border-[var(--color-secondary)] disabled:opacity-40 disabled:cursor-not-allowed';
export function TrackingCapturePanel() {
  const { status, report } = useTrackingCaptureStore();
  const backend = useTrackingSettingsStore(state => state.backend);
  const [expected, setExpected] = useState<ExpectedGesture>('unlabelled');
  const benchmarking = useBackendBenchmarkStore(state => state.status === 'capturing' || state.status === 'running');
  const active = status !== 'idle';
  return (
    <section aria-label="Tracking data capture" className="space-y-3 border-t border-white/10 pt-4">
      <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-secondary)]">Speed & gesture capture</h3>
      <p className="text-[9px] leading-relaxed text-white/55">Capture 30 seconds of timings and gesture results. A 3-second preparation period lets you position your hand. For a labelled check, hold the selected pose with one hand throughout; for taps, start relaxed and repeat tap / lift motions.</p>
      <label className="block text-[9px] text-white/70">
        Expected pose
        <WakandanSelect aria-label="Expected pose" value={expected} disabled={active}
          onChange={event => setExpected(event.target.value as ExpectedGesture)} className="mt-1 w-full text-[10px]">
          <option value="unlabelled">Speed only · move freely</option>
          <option value="no-hands">No hands visible</option>
          <option value="open">One open hand · no trigger</option>
          <option value="pinch">One hand · hold pinch</option>
          <option value="point">One hand · repeat point / air taps</option>
        </WakandanSelect>
      </label>
      {expected === 'point' && <p className="text-[9px] leading-relaxed text-white/55">Tap recognition requires movement and a return to rest. Pose agreement counts active tap frames, not successful taps; a low percentage alone does not mean missed taps.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={!active && (!backend || benchmarking)}
          onClick={() => active ? stopTrackingCapture() : startTrackingCapture(expected)}>
          {active ? 'Stop capture' : 'Start 30s capture'}
        </button>
        <button type="button" className={buttonClass} disabled={!report || active} onClick={downloadTrackingCapture}>Export JSON</button>
      </div>
      <p role="status" className="text-[9px] text-white/60">{status === 'countdown' ? 'Get ready · capture begins in 3 seconds…' : status === 'recording' ? 'Recording · stops automatically after 30 seconds. You can close this panel.' : !backend ? 'Waiting for tracking to initialize.' : report ? `Capture complete · ${report.summary.frames} completed frames` : 'Ready to capture'}</p>
      {report && <dl className="grid grid-cols-2 gap-2 font-mono text-[9px] text-white/70">
        <div><dt>Capture FPS</dt><dd>{report.summary.completedFps.toFixed(1)}</dd></div>
        <div><dt>Pipeline p95</dt><dd>{report.summary.pipelineP95Ms?.toFixed(1) ?? '—'} ms</dd></div>
        <div><dt>Pose agreement</dt><dd>{report.summary.labelledAgreementPercent?.toFixed(1) ?? '—'}{report.summary.labelledAgreementPercent !== null ? '%' : ''}</dd></div>
        <div><dt>Duration</dt><dd>{(report.durationMs / 1000).toFixed(1)} s</dd></div>
      </dl>}
      <p className="text-[9px] leading-relaxed text-white/45">Saved locally in memory until reload; export to keep it. Includes numeric timings, gesture flags, and settings. No camera images or landmarks. Pose agreement measures your labelled hold test, not overall model accuracy.</p>
    </section>
  );
}
