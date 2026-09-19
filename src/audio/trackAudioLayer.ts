import * as Tone from 'tone';
import type { InstrumentType, EffectsState } from '../store/musicState';

// ─────────────────────────────────────────────────────────────
//  TrackAudioLayer — one per looper track
//  Uses the same simple PolySynth(Synth) approach as InstrumentService
//  to avoid voice leak / polyphony exhaustion
// ─────────────────────────────────────────────────────────────

export class TrackAudioLayer {
  public id: number;
  private synth: Tone.PolySynth;
  private volumeNode: Tone.Volume;
  private limiter: Tone.Limiter;
  private activeInstrument: InstrumentType = 'Subtractive';
  
  private chorus: Tone.Chorus;
  private bitcrusher: Tone.BitCrusher;
  private delay: Tone.FeedbackDelay;
  private reverb: Tone.Reverb | null = null; // lazy — IR generation is deferred to first use

  constructor(id: number) {
    this.id = id;
    this.limiter = new Tone.Limiter(-6).toDestination();
    this.volumeNode = new Tone.Volume(0).connect(this.limiter);
    
    // Initialize effects (reverb is lazy — see getOrCreateReverb)
    this.chorus = new Tone.Chorus(4, 2.5, 0.4).start();
    this.bitcrusher = new Tone.BitCrusher(16);
    this.delay = new Tone.FeedbackDelay('8n', 0.35);

    // Initial state: bypassed
    this.chorus.wet.value = 0;
    this.bitcrusher.wet.value = 0;
    this.delay.wet.value = 0;

    // Build the effect chain (reverb slot is wired in lazily)
    this.chorus.chain(this.bitcrusher, this.delay, this.volumeNode);

    this.synth = this.buildSynth('Subtractive');
  }

  /** Lazily create the reverb on first use — avoids blocking IR generation at construction time. */
  private getOrCreateReverb(): Tone.Reverb {
    if (!this.reverb) {
      this.reverb = new Tone.Reverb({ decay: 2.0, preDelay: 0.05 });
      this.reverb.wet.value = 0;
      // Re-wire chain to include reverb
      this.delay.disconnect();
      this.delay.chain(this.reverb, this.volumeNode);
    }
    return this.reverb;
  }

  private buildSynth(type: InstrumentType): Tone.PolySynth {
    // Only dispose the old synth if the audio context is already running —
    // disposing on a suspended context can cause WebAudio errors.
    if (this.synth && Tone.getContext().state === 'running') {
      this.synth.releaseAll();
      this.synth.disconnect();
      this.synth.dispose();
    }
    let synth: Tone.PolySynth;
    switch (type) {
      case 'FM':
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          oscillator: { type: 'fmsine2', modulationIndex: 3, harmonicity: 1.5 },
          envelope: { attack: 0.03, decay: 0.3, sustain: 0.5, release: 0.5 },
        });
        break;
      case 'Electric Piano':
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          oscillator: { type: 'fmsine4', modulationIndex: 8, harmonicity: 3.5 },
          envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.6 },
        });
        break;
      case 'Pad':
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 6,
          oscillator: { type: 'amsine4', harmonicity: 2 },
          envelope: { attack: 0.6, decay: 0.2, sustain: 0.9, release: 1.2 },
        });
        break;
      case 'Subtractive':
      default:
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.4 },
        });
        break;
    }
    synth.volume.value = -10;
    synth.connect(this.chorus);
    return synth;
  }

  public setInstrument(newInstrument: InstrumentType) {
    if (this.activeInstrument !== newInstrument) {
      this.activeInstrument = newInstrument;
      this.synth = this.buildSynth(newInstrument);
    }
  }

  public setEffects(state: EffectsState) {
    // Smoothly ramp wet values to avoid clicking
    const rampTime = 0.1;
    this.chorus.wet.rampTo(state.chorus ? 0.6 : 0, rampTime);
    this.bitcrusher.wet.rampTo(state.bitcrusher ? 0.8 : 0, rampTime);
    this.delay.wet.rampTo(state.delay ? 0.5 : 0, rampTime);
    // Reverb is lazy — only initialize it when actually enabled
    if (state.reverb) {
      this.getOrCreateReverb().wet.rampTo(0.7, rampTime);
    } else if (this.reverb) {
      this.reverb.wet.rampTo(0, rampTime);
    }
  }

  public setVolume(vol: number) {
    const db = Tone.gainToDb(Math.max(0.001, vol));
    this.volumeNode.volume.rampTo(db, 0.1);
  }

  public setMuteSolo(isMuted: boolean, isSoloed: boolean, anySoloActive: boolean) {
    this.volumeNode.mute = isMuted || (anySoloActive && !isSoloed);
  }

  public triggerAttack(notes: string[], velocity: number, time?: number | string) {
    const safeVelocity = Math.max(0.1, Math.min(0.85, velocity));
    this.synth.triggerAttack(notes, time ?? Tone.now(), safeVelocity);
  }

  public triggerRelease(notes: string[], time?: number | string) {
    this.synth.triggerRelease(notes, time ?? Tone.now());
  }

  public triggerAttackRelease(notes: string[], duration: number, time: number, velocity: number) {
    const safeVelocity = Math.max(0.1, Math.min(0.85, velocity));
    this.synth.triggerAttackRelease(notes, duration, time, safeVelocity);
  }

  public releaseAll() {
    this.synth.releaseAll(Tone.now());
  }
}
