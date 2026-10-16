import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { VolumeRing } from './VolumeRing';
import { useLooperStore } from '../store/looperState';
import { useHandStore, type HandData } from '../store/handState';
import { useVolumeGestureStore } from '../store/volumeGesture';
import { openHand } from '../tests/openHand';
import { useEffectDialStore } from '../store/effectDial';

afterEach(() => { cleanup(); vi.restoreAllMocks(); useHandStore.getState().setHands([], []); useLooperStore.getState().setMasterVolume(0.8); });

it('supports keyboard volume, including mute, through the same master control', () => {
  useLooperStore.getState().setMasterVolume(0.5);
  const parentShortcut = vi.fn();
  render(<div onKeyDown={parentShortcut}><VolumeRing /></div>);
  const dial = screen.getByRole('slider', { name: 'Master volume' });
  fireEvent.keyDown(dial, { key: 'ArrowUp' });
  expect(dial.getAttribute('aria-valuenow')).toBe('52');
  fireEvent.keyDown(dial, { key: 'Home' });
  expect(useLooperStore.getState().masterVolume).toBe(0);
  fireEvent.keyDown(dial, { key: 'End' });
  expect(useLooperStore.getState().masterVolume).toBe(1);
  expect(parentShortcut).not.toHaveBeenCalled();
});

it('uses the cached ring layout for camera grabs and clears ownership on unmount', () => {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0,
    width: 550, height: 550 } as DOMRect);
  useLooperStore.getState().setMasterVolume(0.5);
  const view = render(<VolumeRing />);
  const publish = (angle: number, isPinching = true) => {
    const hand: HandData = { handedness: 'Left', landmarks: openHand(-angle), isPinching: !isPinching, pinchStrength: 1,
      pinchDistance: 0.8, palmPosition: { x: 275 / window.innerWidth, y: 275 / window.innerHeight }, handRotation: 0,
      indexTipPosition: { x: (275 + 267 * Math.cos(angle)) / window.innerWidth,
        y: (275 + 267 * Math.sin(angle)) / window.innerHeight } };
    act(() => useHandStore.getState().setHands([hand], [hand]));
  };
  publish(0);
  expect(useVolumeGestureStore.getState().owner).toBe('Left');
  publish(Math.PI / 4);
  expect(useLooperStore.getState().masterVolume).toBe(0.75);
  publish(Math.PI / 4, false);
  expect(useVolumeGestureStore.getState().owner).toBeNull();
  expect(useLooperStore.getState().masterVolume).toBe(0.75);
  publish(0);
  view.unmount();
  expect(useVolumeGestureStore.getState().owner).toBeNull();
});

it('adjusts FX independently and commits duration on gesture release', () => {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 550, height: 550 } as DOMRect);
  useEffectDialStore.setState({ level: .5, settledLevel: .5 });
  const view = render(<VolumeRing kind="effects" />);
  const hand: HandData = { handedness: 'Right', landmarks: openHand(), isPinching: false, pinchStrength: 0,
    pinchDistance: 1, palmPosition: { x: 275/window.innerWidth, y: 275/window.innerHeight },
    indexTipPosition: { x: .5,y:.5 }, handRotation: 0 };
  act(() => useHandStore.getState().setHands([hand],[hand]));
  const turned = {...hand, landmarks: openHand(-Math.PI/4)};
  act(() => useHandStore.getState().setHands([turned],[turned]));
  expect(useEffectDialStore.getState()).toMatchObject({ level: .75, settledLevel: .5 });
  expect(useLooperStore.getState().masterVolume).toBe(.8);
  act(() => useHandStore.getState().setHands([],[]));
  expect(useEffectDialStore.getState().settledLevel).toBe(.75);
  expect(useVolumeGestureStore.getState().effectOwner).toBeNull();
  view.unmount(); useEffectDialStore.setState({ level:.5,settledLevel:.5 });
});
