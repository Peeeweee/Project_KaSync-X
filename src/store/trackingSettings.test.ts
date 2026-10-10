import { describe, expect, it } from 'vitest';
import { getTargetInferenceFps } from './trackingSettings';

describe('getTargetInferenceFps', () => {
  it('maps quality modes to predictable inference budgets', () => {
    expect(getTargetInferenceFps('audio', false)).toBe(36);
    expect(getTargetInferenceFps('performance', false)).toBe(24);
    expect(getTargetInferenceFps('balanced', false)).toBe(30);
    expect(getTargetInferenceFps('auto', false)).toBe(30);
    expect(getTargetInferenceFps('quality', false)).toBe(30);
  });

  it('protects audio by reducing every mode during sustained low FPS', () => {
    expect(getTargetInferenceFps('quality', true)).toBe(18);
  });
});
