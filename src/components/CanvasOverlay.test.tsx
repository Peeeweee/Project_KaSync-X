import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CanvasOverlay } from './CanvasOverlay';
import { useHandStore, type HandData } from '../store/handState';
import { useTrackingSettingsStore } from '../store/trackingSettings';

it('redraws on fresh detections and settings changes, not every display frame', () => {
  const clearRect = vi.fn();
  const context = { clearRect, beginPath: vi.fn(), stroke: vi.fn() };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  useHandStore.getState().setHands([], []);
  const originalOverlay = useTrackingSettingsStore.getState().showHandOverlay;
  useTrackingSettingsStore.getState().setPreference('showHandOverlay', true);
  const view = render(<CanvasOverlay />);
  try {
    expect(clearRect).toHaveBeenCalledTimes(1);
    act(() => { frame(16); frame(32); });
    expect(clearRect).toHaveBeenCalledTimes(1);
    const hand: HandData = { landmarks: [], handedness: 'Left', isPinching: false,
      pinchStrength: 0, pinchDistance: 1, palmPosition: { x: 0.5, y: 0.5 },
      indexTipPosition: { x: 0.5, y: 0.5 }, handRotation: 0 };
    useHandStore.getState().setHands([hand], [hand]);
    act(() => frame(48));
    expect(clearRect).toHaveBeenCalledTimes(2);
    act(() => frame(64));
    expect(clearRect).toHaveBeenCalledTimes(2);
    useTrackingSettingsStore.getState().setPreference('showHandOverlay', false);
    act(() => frame(80));
    expect(clearRect).toHaveBeenCalledTimes(3);
    act(() => frame(96));
    expect(clearRect).toHaveBeenCalledTimes(3);
  } finally {
    view.unmount();
    useHandStore.getState().setHands([], []);
    useTrackingSettingsStore.getState().setPreference('showHandOverlay', originalOverlay);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
