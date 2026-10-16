import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstrumentService } from './synth';

const { nodes } = vi.hoisted(() => ({ nodes: [] as Array<{
  kind: string;
  gain: { cancelScheduledValues: ReturnType<typeof vi.fn>; rampTo: ReturnType<typeof vi.fn> };
  chain: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  triggerRelease: ReturnType<typeof vi.fn>;
  triggerAttack: ReturnType<typeof vi.fn>;
}> }));

vi.mock('tone', () => {
  const constructor = (kind: string) => function () {
    const node = {
      kind, gain: { cancelScheduledValues: vi.fn(), rampTo: vi.fn() },
      wet: { value: 0, rampTo: vi.fn() }, volume: { value: 0 },
      connect: vi.fn().mockReturnThis(), chain: vi.fn().mockReturnThis(),
      toDestination: vi.fn().mockReturnThis(), start: vi.fn().mockReturnThis(),
      set: vi.fn(), dispose: vi.fn(), disconnect: vi.fn(), releaseAll: vi.fn(),
      triggerRelease: vi.fn(), triggerAttack: vi.fn(),
    };
    nodes.push(node);
    return node;
  };
  return Object.fromEntries([
    ...['Gain', 'Limiter', 'Chorus', 'BitCrusher', 'FeedbackDelay', 'Reverb', 'PolySynth', 'Synth']
      .map(kind => [kind, constructor(kind)]),
    ['immediate', () => 10], ['context', { state: 'running' }],
  ]);
});

afterEach(() => { nodes.length = 0; vi.useRealTimers(); });

describe('live instrument choke', () => {
  it('keeps a tracked long hold alive while retaining the lost-input watchdog', () => {
    vi.useFakeTimers();
    const instrument = new InstrumentService();
    const synth = nodes.find(n => n.kind === 'PolySynth')!;
    instrument.triggerNote('C4', 0.8);
    vi.advanceTimersByTime(7000);
    instrument.keepAlive();
    vi.advanceTimersByTime(7000);
    expect(synth.triggerRelease).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(synth.triggerRelease).toHaveBeenCalled();
    instrument.dispose();
  });
  it('gates effects and stays silent until an explicit fresh attack', () => {
    vi.useFakeTimers();
    const instrument = new InstrumentService();
    const gate = nodes.find(n => n.kind === 'Gain')!;
    const synth = nodes.find(n => n.kind === 'PolySynth')!;
    const chorus = nodes.find(n => n.kind === 'Chorus')!;
    expect(chorus.chain).toHaveBeenCalledWith(expect.anything(), expect.anything(), gate);
    instrument.setEffects({ sustain: true, reverb: true, delay: true, chorus: false, bitcrusher: false });
    const delay = nodes.find(n => n.kind === 'FeedbackDelay')!;
    expect(delay.chain).toHaveBeenLastCalledWith(nodes.find(n => n.kind === 'Reverb'), gate);
    instrument.triggerNote('C4', 0.8);
    instrument.releaseChord();
    expect(synth.triggerRelease).not.toHaveBeenCalled(); // Sustain is still respected normally.
    instrument.releaseChord(false, true);
    expect(gate.gain.rampTo).toHaveBeenLastCalledWith(0, 0.006, 10);
    expect(synth.set).toHaveBeenCalledWith({ envelope: { release: 0.006 } });
    expect(synth.triggerRelease).toHaveBeenCalledWith(['C4'], 10);
    vi.advanceTimersByTime(500);
    expect(gate.gain.rampTo).toHaveBeenLastCalledWith(0, 0.006, 10);
    instrument.triggerNote('C4', 0.8);
    expect(gate.gain.rampTo).toHaveBeenLastCalledWith(1, 0.006, 10);
    expect(synth.triggerAttack).toHaveBeenCalledTimes(2);
    instrument.dispose();
  });
});
