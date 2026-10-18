import { useMusicStore } from '../store/musicState';
import { useSelectedChord } from '../hooks/useSelectedChord';
import { PerformanceStatus } from './PerformanceStatus';

export function PerformanceSelection() {
  const selection = useSelectedChord();
  const mode = useMusicStore(s => s.mode);
  const instrument = useMusicStore(s => s.currentInstrument);
  return <div className="kasync-performance-strip">
    <div className="kasync-selection" aria-label={`Selected ${mode === 'Melody' ? 'note' : 'chord'}: ${selection ?? 'none'}`}>
      <span className="kasync-selection-label">{mode === 'Melody' ? 'Note' : 'Chord'}</span>
      <strong title={selection ?? undefined}>{selection ?? '—'}</strong>
    </div>
    <span className="kasync-selection-instrument" title={`Instrument: ${instrument}`}>
      {instrument === 'FM' ? 'FM Synth' : instrument}
    </span>
    <PerformanceStatus />
  </div>;
}
