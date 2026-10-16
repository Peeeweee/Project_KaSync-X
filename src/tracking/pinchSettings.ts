/** Thresholds measured in image-width units after correcting Y for aspect ratio. */
export const PINCH_METRIC_VERSION = 2;
export const DEFAULT_PINCH_ATTACK = 0.32;
export const DEFAULT_PINCH_RELEASE = 0.36;

export function normalizePinchThresholds(attack: unknown, release: unknown) {
  const pinchThreshold = typeof attack === 'number' && Number.isFinite(attack)
    ? Math.min(0.8, Math.max(0.1, attack)) : DEFAULT_PINCH_ATTACK;
  const requestedRelease = typeof release === 'number' && Number.isFinite(release)
    ? release : DEFAULT_PINCH_RELEASE;
  return {
    pinchThreshold,
    pinchReleaseThreshold: Math.min(0.9, Math.max(pinchThreshold + 0.03, requestedRelease)),
  };
}

/** Old calibration used incompatible X/Y units; retain unrelated preferences. */
export function loadPinchThresholds(settings: Record<string, unknown>) {
  return settings.pinchMetricVersion === PINCH_METRIC_VERSION
    ? normalizePinchThresholds(settings.pinchThreshold, settings.pinchReleaseThreshold)
    : { pinchThreshold: DEFAULT_PINCH_ATTACK, pinchReleaseThreshold: DEFAULT_PINCH_RELEASE };
}

export function calibratePinchThresholds(open: number, closed: number) {
  if (!Number.isFinite(open) || !Number.isFinite(closed) || open - closed <= 0.08) return null;
  const range = open - closed;
  const attack = Math.min(0.55, Math.max(0.1, closed + Math.min(0.1, range * 0.2)));
  // Calibration should recognize contact, not require returning to a fully
  // spread hand between every note. Keep hysteresis narrow after learning it.
  const release = Math.min(0.75, attack + Math.min(0.05, Math.max(0.03, range * 0.1)));
  if (closed >= attack || release >= open) return null;
  return normalizePinchThresholds(attack, release);
}
