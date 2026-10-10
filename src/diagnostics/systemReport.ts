import * as Tone from 'tone';
import { useLooperStore } from '../store/looperState';
import { useMidiStore } from '../midi/midiManager';
import { useTrackingSettingsStore } from '../store/trackingSettings';

export function createSystemReport() {
  const rawContext = Tone.getContext().rawContext as AudioContext;
  const looper = useLooperStore.getState();
  const midi = useMidiStore.getState();
  const tracking = useTrackingSettingsStore.getState();
  return {
    generatedAt: new Date().toISOString(),
    app: 'Kasync.x',
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio: window.devicePixelRatio,
      logicalProcessors: navigator.hardwareConcurrency ?? null,
      memoryGb: 'deviceMemory' in navigator ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null : null,
    },
    audio: {
      state: Tone.context.state,
      sampleRate: rawContext.sampleRate,
      baseLatencyMs: 'baseLatency' in rawContext ? Math.round(rawContext.baseLatency * 100_000) / 100 : null,
      outputLatencyMs: 'outputLatency' in rawContext ? Math.round(rawContext.outputLatency * 100_000) / 100 : null,
      toneLookAheadMs: Math.round(Tone.getContext().lookAhead * 1000),
      bpm: looper.bpm,
      meter: `${looper.beatsPerBar}/4`,
      loopBars: looper.loopBars,
    },
    tracking: {
      backend: tracking.backend,
      quality: tracking.quality,
      targetFps: tracking.targetFps,
      inferenceLatencyMs: tracking.inferenceLatencyMs,
      lowPerformanceMode: tracking.isLowPerformance,
    },
    midi: {
      supported: midi.isSupported,
      accessConnected: midi.isConnected,
      inputCount: midi.inputPorts.length,
      outputCount: midi.outputPorts.length,
      clockSyncEnabled: midi.clockSyncEnabled,
      detectedBpm: midi.detectedBpm,
    },
    project: {
      tracksWithEvents: looper.tracks.filter(track => track.events.length > 0).length,
      eventCount: looper.tracks.reduce((total, track) => total + track.events.length, 0),
    },
  };
}

export function downloadSystemReport() {
  const report = createSystemReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `kasync-system-report-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
