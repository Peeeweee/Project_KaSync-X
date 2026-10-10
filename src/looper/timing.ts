export const DEFAULT_LOOP_BARS = 4;
export const DEFAULT_BEATS_PER_BAR = 4;
/** Kept as aliases for older integrations. */
export const LOOP_BARS = DEFAULT_LOOP_BARS;
export const BEATS_PER_BAR = DEFAULT_BEATS_PER_BAR;
export const LOOP_BEATS = LOOP_BARS * BEATS_PER_BAR;
export const DEFAULT_PPQ = 192;
export const LOOP_BAR_OPTIONS = [1, 2, 4, 8] as const;
export const METER_OPTIONS = [3, 4, 5, 6, 7] as const;

export type LoopBars = (typeof LOOP_BAR_OPTIONS)[number];
export type BeatsPerBar = (typeof METER_OPTIONS)[number];

export function loopTicks(
  ppq: number = DEFAULT_PPQ,
  bars: number = DEFAULT_LOOP_BARS,
  beatsPerBar: number = DEFAULT_BEATS_PER_BAR,
): number {
  return Math.max(1, Math.round(bars * beatsPerBar * ppq));
}

export function sixteenthTicks(ppq: number = DEFAULT_PPQ): number {
  return Math.max(1, Math.round(ppq / 4));
}

export function quantizeAbsoluteTick(tick: number, enabled: boolean, ppq: number = DEFAULT_PPQ): number {
  if (!enabled) return Math.max(0, Math.round(tick));
  const grid = sixteenthTicks(ppq);
  return Math.max(0, Math.round(tick / grid) * grid);
}

export function wrapLoopTick(
  tick: number,
  ppq: number = DEFAULT_PPQ,
  bars: number = DEFAULT_LOOP_BARS,
  beatsPerBar: number = DEFAULT_BEATS_PER_BAR,
): number {
  const length = loopTicks(ppq, bars, beatsPerBar);
  return ((Math.round(tick) % length) + length) % length;
}

export function durationBetweenTicks(
  startAbsoluteTick: number,
  endAbsoluteTick: number,
  quantized: boolean,
  ppq: number = DEFAULT_PPQ,
): number {
  const minimum = quantized ? sixteenthTicks(ppq) : Math.max(1, Math.round(ppq / 16));
  return Math.max(minimum, Math.round(endAbsoluteTick - startAbsoluteTick));
}

export function ticksToSeconds(ticks: number, bpm: number, ppq: number = DEFAULT_PPQ): number {
  return (ticks / ppq) * (60 / bpm);
}
