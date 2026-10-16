import { expect, it, vi } from 'vitest';
import type * as Tone from 'tone';
import { queueReverbDecay } from './effectDial';

it('coalesces queued tail changes until the current impulse response is ready', async () => {
  let finish: () => void = () => {};
  const ready = new Promise<void>(r => { finish = r; });
  const setDecay = vi.fn();
  let decay = 2;
  const reverb = { ready, disposed: false, get decay() { return decay; },
    set decay(value: number) { decay = value; setDecay(value); } };
  queueReverbDecay(reverb as unknown as Tone.Reverb, 2.5);
  queueReverbDecay(reverb as unknown as Tone.Reverb, 3);
  queueReverbDecay(reverb as unknown as Tone.Reverb, 3.5);
  expect(setDecay).not.toHaveBeenCalled();
  finish(); await ready; await Promise.resolve();
  expect(setDecay).toHaveBeenCalledTimes(1);
  expect(setDecay).toHaveBeenLastCalledWith(3.5);
});
