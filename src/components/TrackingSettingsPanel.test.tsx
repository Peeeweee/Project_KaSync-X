import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrackingSettingsPanel } from './TrackingSettingsPanel';
import { useTrackingSettingsStore } from '../store/trackingSettings';
import { useHandStore, type HandData } from '../store/handState';

vi.mock('../looper/recorder', () => ({ looperService: {
  monitorLiveAudio: vi.fn(() => vi.fn()),
  getLiveAudioStatus: vi.fn(() => ({ context:'running', muted:false, masterVolume:.8,
    instrument:{ attacks:7, activeVoices:4, gate:1, playing:true, dryDb:-12.5, outputDb:-Infinity } })),
} }));

describe('tracking settings overlay', () => {
  it('calibrates from the same single hand and keeps the release close to contact', () => {
    const makeHand = (handedness: string, pinchDistance: number): HandData => ({
      handedness, pinchDistance, landmarks: [], isPinching: pinchDistance < 0.2, pinchStrength: 0.8,
      palmPosition: { x: 0.4, y: 0.4 }, indexTipPosition: { x: 0.4, y: 0.4 }, handRotation: 0,
    });
    const publish = (...hands: HandData[]) => act(() => useHandStore.getState().setHands(hands, hands));
    const original = useTrackingSettingsStore.getState();
    useTrackingSettingsStore.getState().setPanelOpen(true);
    const view = render(<TrackingSettingsPanel />);
    try {
      publish(makeHand('Left', 1.2), makeHand('Right', 0.08));
      fireEvent.click(screen.getByRole('button', { name: /1 · Open hand/i }));
      expect(screen.getByText('Show exactly one hand for calibration.')).toBeTruthy();
      publish(makeHand('Left', 1.2));
      fireEvent.click(screen.getByRole('button', { name: /1 · Open hand/i }));
      publish(makeHand('Right', 0.08));
      fireEvent.click(screen.getByRole('button', { name: /2 · Pinch/i }));
      expect(screen.getByText('Use the same single hand for both calibration steps.')).toBeTruthy();
      publish(makeHand('Left', 0.08));
      fireEvent.click(screen.getByRole('button', { name: /2 · Pinch/i }));
      expect(useTrackingSettingsStore.getState().pinchReleaseThreshold).toBeLessThan(0.3);
      expect(screen.getByText(/Audio request:/)).toBeTruthy();
      expect(screen.getByText('Engine: running · Master: 80%')).toBeTruthy();
      expect(screen.getByText('Synth attacks: 7 · Voices: 4 · Gate: 100%')).toBeTruthy();
      expect(screen.getByText('Signal: synth -12.5 dB · after FX silent')).toBeTruthy();
    } finally {
      view.unmount();
      useTrackingSettingsStore.getState().setPreferences({ pinchThreshold: original.pinchThreshold,
        pinchReleaseThreshold: original.pinchReleaseThreshold });
      useTrackingSettingsStore.getState().setPanelOpen(false);
      useHandStore.getState().setHands([], []);
    }
  });
  it('escapes camera containment and restores focus when dismissed', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    useTrackingSettingsStore.getState().setPanelOpen(true);
    const view = render(<div style={{ position: 'relative', zIndex: 0, overflow: 'hidden' }}><TrackingSettingsPanel /></div>);
    try {
      const panel = screen.getByRole('dialog', { name: 'Hand tracking settings' });
      const counter = screen.getByLabelText('Live gesture recognition');
      expect(counter.closest('.kasync-tracking-content')).toBeNull();
      expect(panel.parentElement).toBe(document.body);
      expect(view.container.contains(panel)).toBe(false);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close tracking settings' }));
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Hand tracking settings' })).toBeNull();
      expect(document.activeElement).toBe(trigger);
      act(() => useTrackingSettingsStore.getState().setPanelOpen(true));
      fireEvent.click(screen.getByRole('button', { name: 'Close tracking settings' }));
      expect(useTrackingSettingsStore.getState().isPanelOpen).toBe(false);
    } finally {
      view.unmount();
      trigger.remove();
      useTrackingSettingsStore.getState().setPanelOpen(false);
    }
  });
});

it('restores the compatible path and restarts tracking from the recovery button', () => {
  useTrackingSettingsStore.getState().setPreference('trackingEngine', 'worker');
  useTrackingSettingsStore.getState().setPanelOpen(true);
  const before = useTrackingSettingsStore.getState().restartGeneration;
  const view = render(<TrackingSettingsPanel />);
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Restore live tracking' }));
    expect(useTrackingSettingsStore.getState().trackingEngine).toBe('compatible');
    expect(useTrackingSettingsStore.getState().restartGeneration).toBeGreaterThan(before);
  } finally {
    view.unmount();
    useTrackingSettingsStore.getState().setPanelOpen(false);
  }
});
