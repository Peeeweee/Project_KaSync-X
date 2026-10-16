import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BackendBenchmarkPanel } from './BackendBenchmarkPanel';
import { useBackendBenchmarkStore, type BackendBenchmarkReport } from '../diagnostics/backendBenchmark';
import { summarizeBenchmark } from '../tracking/backendBenchmarkProtocol';

it('does not recommend a faster backend when every detection was empty', () => {
  const samples = Array.from({ length: 24 }, (_, index) => ({ frame: index % 12, pass: Math.floor(index / 12), hands: 0, inferenceMs: 10 }));
  const report: BackendBenchmarkReport = {
    schemaVersion: 1, createdAt: '', modelAssetPath: '/hand_landmarker.task', width: 460, height: 259,
    quality: 'balanced', order: ['GPU', 'CPU'], clipFrames: 12, warmupFramesPerBackend: 12, timedPassesPerBackend: 2,
    results: [summarizeBenchmark('GPU', 100, samples), summarizeBenchmark('CPU', 100, samples.map(sample => ({ ...sample, inferenceMs: 20 })))],
    handCountAgreementPercent: 100, notes: '',
  };
  useBackendBenchmarkStore.setState({ status: 'done', report, message: '' });
  const view = render(<BackendBenchmarkPanel />);
  try {
    expect(screen.getByText(/No hands detected in this replay/)).toBeDefined();
    expect(screen.queryByText(/inference was .*faster/)).toBeNull();
    expect(screen.getByText(/Both detectors returned empty results/)).toBeDefined();
  } finally {
    view.unmount();
    useBackendBenchmarkStore.setState({ status: 'idle', report: null, message: '' });
  }
});
