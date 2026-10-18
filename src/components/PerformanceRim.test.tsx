import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PerformanceRim } from './PerformanceRim';
import { useMusicStore } from '../store/musicState';

const cancel = vi.fn();
const animate = vi.fn(() => ({ cancel }) as unknown as Animation);
let reduced = false;
let preferenceChanged: (() => void) | undefined;
const request = (playingNotes: string[]) => act(() => useMusicStore.getState().setMusicState({ playingNotes }));

beforeEach(() => {
  reduced = false;
  preferenceChanged = undefined;
  cancel.mockClear(); animate.mockClear();
  useMusicStore.getState().setMusicState({ playingNotes: [] });
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: (_event: string, callback: () => void) => { preferenceChanged = callback; },
    removeEventListener: () => { preferenceChanged = undefined; },
  }));
  Object.defineProperty(SVGElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => {
  cleanup();
  delete (SVGElement.prototype as Partial<SVGElement>).animate;
  vi.unstubAllGlobals();
});

it('pulses once for each note request, including repeated notes, and cancels on a cut', () => {
  render(<svg><PerformanceRim /></svg>);
  request(['C4']);
  expect(animate).toHaveBeenCalledTimes(1);
  act(() => useMusicStore.getState().setMusicState({ hoveredRoot: 'D' }));
  expect(animate).toHaveBeenCalledTimes(1);
  request(['C4']);
  expect(animate).toHaveBeenCalledTimes(2);
  expect(cancel).toHaveBeenCalledTimes(1);
  request([]);
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(animate).toHaveBeenCalledTimes(2);
});

it('stops animation when reduced motion is enabled and releases its subscription on unmount', () => {
  const view = render(<svg><PerformanceRim /></svg>);
  request(['C4']);
  reduced = true;
  preferenceChanged?.();
  expect(cancel).toHaveBeenCalledTimes(1);
  request(['D4']);
  expect(animate).toHaveBeenCalledTimes(1);
  reduced = false;
  request(['E4']);
  expect(animate).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(preferenceChanged).toBeUndefined();
  request(['F4']);
  expect(animate).toHaveBeenCalledTimes(2);
});
