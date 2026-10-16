import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TrackingSettingsPanel } from './TrackingSettingsPanel';
import { useTrackingSettingsStore } from '../store/trackingSettings';

describe('tracking settings overlay', () => {
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
