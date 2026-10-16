import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstrumentService } from './synth';
import { useEffectDialStore } from '../store/effectDial';

const { nodes } = vi.hoisted(() => ({ nodes: [] as Array<{
  kind: string;
  wet: { rampTo: ReturnType<typeof vi.fn> };
  feedback: { rampTo: ReturnType<typeof vi.fn> };
  gain: { cancelScheduledValues: ReturnType<typeof vi.fn>; rampTo: ReturnType<typeof vi.fn> };
  chain: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  triggerRelease: ReturnType<typeof vi.fn>;
  triggerAttack: ReturnType<typeof vi.fn>;
  getValue: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}> }));

vi.mock('tone', () => {
  const constructor = (kind: string) => function () {
    const node = {
      kind, gain: { cancelScheduledValues: vi.fn(), rampTo: vi.fn() },
      wet: { value: 0, rampTo: vi.fn() }, feedback: { rampTo: vi.fn() }, volume: { value: 0 },
      connect: vi.fn().mockReturnThis(), chain: vi.fn().mockReturnThis(),
      toDestination: vi.fn().mockReturnThis(), start: vi.fn().mockReturnThis(),
      set: vi.fn(), dispose: vi.fn(), disconnect: vi.fn(), releaseAll: vi.fn(),
      triggerRelease: vi.fn(), triggerAttack: vi.fn(),
      getValue: vi.fn(() => -Infinity),
    };
    nodes.push(node);
    return node;
  };
  return Object.fromEntries([
    ...['Gain', 'Limiter', 'Chorus', 'BitCrusher', 'FeedbackDelay', 'Reverb', 'PolySynth', 'Synth', 'Meter']
      .map(kind => [kind, constructor(kind)]),
    ['immediate', () => 10], ['context', { state: 'running' }],
  ]);
});

afterEach(() => { nodes.length = 0; vi.useRealTimers(); });

describe('live instrument choke', () => {
  it('measures actual dry/output signals only while diagnostics are open and disconnects both meters', () => {
    const instrument = new InstrumentService();
    try {
      expect(nodes.filter(n => n.kind === 'Meter')).toHaveLength(0);
      expect(instrument.getAudioStatus()).toMatchObject({dryDb:null,outputDb:null});
      instrument.startAudioMonitor();
      instrument.startAudioMonitor();
      const meters = nodes.filter(n => n.kind === 'Meter');
      expect(meters).toHaveLength(2);
      meters[0].getValue.mockReturnValue(-12);
      meters[1].getValue.mockReturnValue(-Infinity);
      expect(instrument.getAudioStatus()).toMatchObject({dryDb:-12,outputDb:-Infinity});
      instrument.stopAudioMonitor();
      expect(nodes.find(n => n.kind === 'PolySynth')!.disconnect).toHaveBeenCalledWith(meters[0]);
      expect(nodes.find(n => n.kind === 'Limiter')!.disconnect).toHaveBeenCalledWith(meters[1]);
      for (const meter of meters) expect(meter.dispose).toHaveBeenCalledOnce();
      expect(instrument.getAudioStatus()).toMatchObject({dryDb:null,outputDb:null});
    } finally { instrument.dispose(); }
  });
  it('applies continuous FX strength and commits the delay tail without rebuilding a voice', () => {
    useEffectDialStore.setState({ level: .5, settledLevel: .5 });
    const instrument = new InstrumentService();
    try {
      instrument.setEffects({ sustain: false, reverb: false, delay: true, chorus: false, bitcrusher: false });
      const delay = nodes.find(n => n.kind === 'FeedbackDelay')!;
      useEffectDialStore.setState({ level: .75 });
      expect(delay.wet.rampTo.mock.lastCall?.[0]).toBeCloseTo(.6);
      expect(delay.feedback.rampTo).toHaveBeenLastCalledWith(.35, .1);
      useEffectDialStore.setState({ settledLevel: .75 });
      expect(delay.feedback.rampTo).toHaveBeenLastCalledWith(.475, .1);
      expect(nodes.filter(n => n.kind === 'PolySynth')).toHaveLength(1);
      expect(nodes.filter(n => n.kind === 'Reverb')).toHaveLength(0);
    } finally { instrument.dispose(); useEffectDialStore.setState({ level: .5, settledLevel: .5 }); }
  });
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
