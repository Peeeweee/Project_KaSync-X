import * as Tone from 'tone';

interface RampParameter {
  rampTo(value: number, duration: number, startTime: number): unknown;
}

// These parameters are owned by their effect/track; skip repeated targets so
// unrelated store updates cannot keep postponing a transition's endpoint.
const targets = new WeakMap<RampParameter, number>();
export function rampLiveParameter(parameter: RampParameter, value: number, duration = 0.1) {
  if (targets.get(parameter) === value) return;
  parameter.rampTo(value, duration, Tone.immediate());
  targets.set(parameter, value);
}

/** Fade in linear gain, including exact silence, without an abrupt mute toggle. */
export function applyMasterVolume(volume: number) {
  const gain = Math.max(0, Math.min(1, volume));
  Tone.getDestination().volume.linearRampTo(gain === 0 ? -Infinity : 20 * Math.log10(gain), 0.06, Tone.immediate());
}
