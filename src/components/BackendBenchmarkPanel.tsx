import { cancelBackendBenchmark, downloadBackendBenchmark, startBackendBenchmark, useBackendBenchmarkStore } from '../diagnostics/backendBenchmark';
import { useTrackingCaptureStore } from '../diagnostics/trackingCapture';
import { useTrackingSettingsStore } from '../store/trackingSettings';

const buttonClass = 'rounded border border-white/20 px-3 py-2 text-[9px] uppercase tracking-wide text-white/80 hover:border-[var(--color-secondary)] disabled:opacity-40 disabled:cursor-not-allowed';
export function BackendBenchmarkPanel() {
  const { status, message, report } = useBackendBenchmarkStore();
  const captureStatus = useTrackingCaptureStore(state => state.status);
  const backend = useTrackingSettingsStore(state => state.backend);
  const active = status === 'capturing' || status === 'running';
  const gpu = report?.results.find(result => result.delegate === 'GPU');
  const cpu = report?.results.find(result => result.delegate === 'CPU');
  const detectedAnyHands = report?.results.some(result => result.samples.some(sample => sample.hands > 0)) ?? false;
  const comparableDetections = report?.handCountAgreementPercent === 100 && report.results.every(result => result.samples.some(sample => sample.hands > 0));
  const ratio = gpu && cpu ? Math.max(gpu.averageMs, cpu.averageMs) / Math.max(0.001, Math.min(gpu.averageMs, cpu.averageMs)) : null;
  return <section aria-label="GPU versus CPU benchmark" className="space-y-3 border-t border-white/10 pt-4">
    <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-secondary)]">GPU vs CPU benchmark</h3>
    <p className="text-[9px] leading-relaxed text-white/55">Move your hands while 12 frames are collected. Both backends replay that same clip with the same model and resolution. Live tracking and gesture playing pause during comparison, then resume automatically.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={!active && (!backend || captureStatus !== 'idle')}
        onClick={() => active ? cancelBackendBenchmark() : void startBackendBenchmark()}>{active ? 'Cancel benchmark' : 'Compare GPU / CPU'}</button>
      <button type="button" className={buttonClass} disabled={active || !report} onClick={downloadBackendBenchmark}>Export comparison</button>
    </div>
    <p role="status" className="text-[9px] leading-relaxed text-white/60">{message || 'Ready · uses the current tracking quality preset.'}</p>
    {report && <>
      <p className="font-mono text-[9px] text-white/70">{report.width} × {report.height} · 24 timed frames per backend</p>
      <table className="w-full text-left font-mono text-[9px] text-white/70">
        <caption className="sr-only">Inference times, lower is faster</caption>
        <thead><tr><th>Backend</th><th>Avg ms</th><th>p95 ms</th></tr></thead>
        <tbody>{report.results.map(result => <tr key={result.delegate}><td>{result.delegate}</td><td>{result.averageMs.toFixed(1)}</td><td>{result.p95Ms.toFixed(1)}</td></tr>)}</tbody>
      </table>
      <p className="text-[9px] text-[var(--color-secondary)]">{!detectedAnyHands ? 'No hands detected in this replay. These timings do not validate hand tracking.' : !comparableDetections ? 'Detection results differ. Speed alone cannot select a reliable backend.' : ratio && gpu && cpu ? ratio < 1.1 ? 'Similar timings in this run.' : `${gpu.averageMs < cpu.averageMs ? 'GPU' : 'CPU'} inference was ${ratio.toFixed(2)}× faster in this replay.` : ''}</p>
      <p className="text-[9px] text-white/60">{detectedAnyHands ? `Hand-count agreement: ${report.handCountAgreementPercent.toFixed(1)}%` : 'Both detectors returned empty results; accuracy is unmeasured.'}</p>
    </>}
    <p className="text-[9px] leading-relaxed text-white/45">Images stay in memory and are discarded after the test. Exports contain timings and hand counts only. This measures inference speed, not live FPS or model accuracy. Your active backend is unchanged.</p>
  </section>;
}
