import { expect, it, vi } from 'vitest';
import { applyMasterVolume, rampLiveParameter } from './transitions';

const { linearRampTo } = vi.hoisted(() => ({ linearRampTo: vi.fn() }));
vi.mock('tone', () => ({ immediate: () => 12, getDestination: () => ({ volume: { linearRampTo } }) }));

it('retargets immediately and skips duplicate targets without delaying later changes', () => {
  const parameter = { rampTo: vi.fn() };
  rampLiveParameter(parameter, .3);
  for (let i = 0; i < 20; i++) rampLiveParameter(parameter, .3);
  expect(parameter.rampTo).toHaveBeenCalledExactlyOnceWith(.3, .1, 12);
  rampLiveParameter(parameter, 0);
  rampLiveParameter(parameter, .3);
  expect(parameter.rampTo.mock.calls).toEqual([[.3, .1, 12], [0, .1, 12], [.3, .1, 12]]);
});

it('fades master volume through exact zero and back without toggling a mute switch', () => {
  linearRampTo.mockClear();
  applyMasterVolume(.8);
  applyMasterVolume(0);
  applyMasterVolume(.4);
  expect(linearRampTo.mock.calls).toEqual([
    [20 * Math.log10(.8), .06, 12], [-Infinity, .06, 12], [20 * Math.log10(.4), .06, 12],
  ]);
});
