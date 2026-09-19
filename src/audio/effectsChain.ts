import * as Tone from 'tone';
import type { EffectsState } from '../store/musicState';

export class EffectsRack {
  public reverb: Tone.Reverb;
  public delay: Tone.FeedbackDelay;
  public chorus: Tone.Chorus;
  public bitcrusher: Tone.BitCrusher;
  
  public input: Tone.Gain;
  public output: Tone.Limiter;

  constructor() {
    this.input = new Tone.Gain(1);

    this.chorus = new Tone.Chorus(4, 2.5, 0.4).start();
    this.bitcrusher = new Tone.BitCrusher(16); // 16-bit = transparent; toggled via wet
    this.delay = new Tone.FeedbackDelay('8n', 0.35);
    this.reverb = new Tone.Reverb(2.0);
    this.output = new Tone.Limiter(-6);

    // Initial states: all bypassed
    this.chorus.wet.value = 0;
    this.bitcrusher.wet.value = 0;
    this.delay.wet.value = 0;
    this.reverb.wet.value = 0; // NOT always on — only enabled by user toggle

    // Chain: Input -> Chorus -> BitCrusher -> Delay -> Reverb -> Limiter -> Destination
    this.input.chain(this.chorus, this.bitcrusher, this.delay, this.reverb, this.output, Tone.Destination);
  }

  public updateEffects(state: EffectsState) {
    // Crossfade wet amounts slightly to avoid clicks
    const rampTime = 0.1;
    
    this.reverb.wet.rampTo(state.reverb ? 0.3 : 0, rampTime);
    this.delay.wet.rampTo(state.delay ? 0.3 : 0, rampTime);
    this.chorus.wet.rampTo(state.chorus ? 0.5 : 0, rampTime);
    this.bitcrusher.wet.rampTo(state.bitcrusher ? 0.8 : 0, rampTime);
  }
}
