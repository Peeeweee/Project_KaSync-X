import * as Tone from 'tone';
import { effectDialSettings, useEffectDialStore } from '../store/effectDial';
import { queueReverbDecay } from './effectDial';
import { useMusicStore } from '../store/musicState';
import type { InstrumentType, EffectsState } from '../store/musicState';

// Live voices use immediate attack/release, with a watchdog for lost release events.
// A gate after the effects provides a click-free choke that stays closed until a new attack.

const FALLBACK_RELEASE_MS = 8000;

export class InstrumentService {
  private synth: Tone.PolySynth;
  private limiter: Tone.Limiter;
  private outputGate: Tone.Gain;
  private voiceRelease = 0.22;
  private currentEffectsState: EffectsState | null = null;
  private currentNotes: string[] = [];
  private isPlaying: boolean = false;
  private sustainEnabled = false;
  private pendingSustainRelease = false;
  private attackCount = 0;
  private dryMeter: Tone.Meter | null = null;
  private outputMeter: Tone.Meter | null = null;
  
  // Failsafe watchdog to prevent hanging notes if release is missed
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private chorus: Tone.Chorus;
  private bitcrusher: Tone.BitCrusher;
  private delay: Tone.FeedbackDelay;
  private reverb: Tone.Reverb | null = null;

  // AudioContext watchdog — resumes if browser auto-suspends it
  private unsubscribeMusicStore: () => void;
  private unsubscribeEffectDial: () => void;

  constructor() {
    this.limiter = new Tone.Limiter(-3).toDestination();
    this.outputGate = new Tone.Gain(1).connect(this.limiter); // -3dBFS ceiling keeps peaks pristine without clipping

    // Initialize Effects (reverb is lazy to avoid blocking on startup)
    this.chorus     = new Tone.Chorus(4, 2.5, 0.4).start();
    this.bitcrusher = new Tone.BitCrusher(16); // 16-bit = transparent; toggled via wet
    this.delay      = new Tone.FeedbackDelay('8n', 0.35);

    // Initial state: all bypassed
    this.chorus.wet.value     = 0;
    this.bitcrusher.wet.value = 0;
    this.delay.wet.value      = 0;

    // Build the direct effect chain
    this.chorus.chain(this.bitcrusher, this.delay, this.outputGate);

    this.synth = this.buildSynth(useMusicStore.getState().currentInstrument);

    // AudioContext watchdog — auto-resumes if the browser suspends it
    this.unsubscribeMusicStore = useMusicStore.subscribe((state, prevState) => {
      if (state.currentInstrument !== prevState.currentInstrument) {
        this.switchInstrument(state.currentInstrument);
      }
    });
    this.unsubscribeEffectDial = useEffectDialStore.subscribe(() => {
      const fx = this.currentEffectsState;
      if (fx && (fx.reverb || fx.delay || fx.chorus || fx.bitcrusher)) this.setEffects(fx);
    });
  }

  private buildSynth(type: InstrumentType): Tone.PolySynth {
    // Dispose old synth if switching
    if (this.synth) {
      this.synth.releaseAll(Tone.immediate());
      this.synth.disconnect();
      this.synth.dispose();
    }

    this.voiceRelease = { Subtractive: 0.22, FM: 0.28, 'Electric Piano': 0.35, Pad: 0.55 }[type];
    let synth: Tone.PolySynth;

    switch (type) {
      case 'FM':
        // Warm FM bell — gentle modulation, clear attack
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fmsine2', modulationIndex: 3, harmonicity: 1.5 },
          envelope: { attack: 0.008, decay: 0.3, sustain: 0.5, release: 0.28 },
        });
        break;
      case 'Electric Piano':
        // Rhodes-style: fast attack, long decay, low sustain
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'fmsine4', modulationIndex: 8, harmonicity: 3.5 },
          envelope: { attack: 0.005, decay: 0.8, sustain: 0.1, release: 0.35 },
        });
        break;
      case 'Pad':
        // Lush pad — slow attack, long release
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'amsine4', harmonicity: 2 },
          envelope: { attack: 0.12, decay: 0.25, sustain: 0.82, release: 0.55 },
        });
        break;
      case 'Subtractive':
      default:
        // Classic analog-style sawtooth — warm and musical
        synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.006, decay: 0.15, sustain: 0.6, release: 0.22 },
        });
        break;
    }
    synth.maxPolyphony = 32;
    synth.volume.value = -8; // Loud, clear, punchy volume with headroom for chords
    synth.connect(this.chorus);
    return synth;
  }

  private resetWatchdog() {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      this.releaseVoices();
    }, FALLBACK_RELEASE_MS);
  }

  public keepAlive() {
    if (this.isPlaying) this.resetWatchdog();
  }

  public getAudioStatus() {
    return { attacks: this.attackCount, activeVoices: this.synth.activeVoices,
      gate: this.outputGate.gain.value, playing: this.isPlaying,
      dryDb: this.meterDb(this.dryMeter), outputDb: this.meterDb(this.outputMeter) };
  }

  private meterDb(meter: Tone.Meter | null) {
    if (!meter) return null;
    const value = meter.getValue();
    return Array.isArray(value) ? Math.max(...value) : value;
  }

  public startAudioMonitor() {
    if (this.dryMeter) return;
    this.dryMeter = new Tone.Meter({ smoothing: 0 });
    this.outputMeter = new Tone.Meter({ smoothing: 0 });
    this.synth.connect(this.dryMeter);
    this.limiter.connect(this.outputMeter);
  }

  public stopAudioMonitor() {
    if (this.dryMeter) this.synth.disconnect(this.dryMeter);
    if (this.outputMeter) this.limiter.disconnect(this.outputMeter);
    this.dryMeter?.dispose();
    this.outputMeter?.dispose();
    this.dryMeter = null;
    this.outputMeter = null;
  }

  private switchInstrument(newInstrument: InstrumentType) {
    const monitored = this.dryMeter !== null;
    this.stopAudioMonitor();
    const wasPlaying = this.isPlaying;
    const notes = [...this.currentNotes];
    this.releaseVoices();
    this.synth = this.buildSynth(newInstrument);
    if (monitored) this.startAudioMonitor();
    if (wasPlaying && notes.length > 0) {
      this.triggerChord(notes, 0.7);
    }
  }

  public triggerChord(notes: string[], velocity: number) {
    // Auto-resume AudioContext if browser suspended it — safe to call repeatedly
    if (Tone.context.state !== 'running') {
      Tone.context.resume().catch(() => {});
    }



    // Musically audible velocity (0.6 to 1.0)
    const safeVelocity = Math.max(0.6, Math.min(1.0, 0.4 + velocity * 0.6));

    // Sort both arrays so comparison is order-independent
    const sortedNew     = [...notes].sort();
    const sortedCurrent = [...this.currentNotes].sort();
    const notesChanged  =
      sortedNew.length !== sortedCurrent.length ||
      !sortedNew.every((v, i) => v === sortedCurrent[i]);

    // Same chord already playing — do nothing
    if (!notesChanged && this.isPlaying) {
      this.pendingSustainRelease = false;
      this.resetWatchdog();
      return;
    }

    if (this.currentEffectsState) {
      this.setEffects(this.currentEffectsState);
    }

    const eventTime = Tone.immediate();
    this.outputGate.gain.cancelScheduledValues(eventTime);
    this.outputGate.gain.rampTo(1, 0.006, eventTime);
    const notesToRelease = this.currentNotes.filter(note => !notes.includes(note));
    const notesToAttack = notes.filter(note => !this.currentNotes.includes(note));
    if (notesToRelease.length > 0) this.synth.triggerRelease(notesToRelease, eventTime);

    this.currentNotes = [...notes];
    this.isPlaying    = true;
    this.pendingSustainRelease = false;

    // Live input should bypass Tone's scheduler look-ahead.
    if (notesToAttack.length > 0) {
      this.synth.triggerAttack(notesToAttack, eventTime, safeVelocity);
      this.attackCount++;
    }
    this.resetWatchdog();
  }

  public releaseChord(gradual: boolean = false, choke: boolean = false) {
    void gradual;
    if (this.sustainEnabled && this.isPlaying && !choke) {
      this.pendingSustainRelease = true;
      return;
    }
    this.releaseVoices(choke);
  }

  private releaseVoices(choke: boolean = false) {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    
    const eventTime = Tone.immediate();
    if (choke) {
      // Gate the entire live signal, including delay/reverb tails. Never reopen on a timer.
      this.outputGate.gain.cancelScheduledValues(eventTime);
      this.outputGate.gain.rampTo(0, 0.006, eventTime);
    }
    if (this.isPlaying) {
      // Shorten release before scheduling note-offs so old pad voices cannot return on retrigger.
      if (choke) this.synth.set({ envelope: { release: 0.006 } });
      if (this.currentNotes.length > 0) this.synth.triggerRelease(this.currentNotes, eventTime);
      this.synth.releaseAll(eventTime);
      if (choke) this.synth.set({ envelope: { release: this.voiceRelease } });
    }

    this.isPlaying    = false;
    this.currentNotes = [];
    this.pendingSustainRelease = false;
  }

  /** Emergency voice panic — rebuilds the synth entirely to clear all stuck voices. */
  public panic() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.synth.releaseAll(Tone.immediate());
    this.isPlaying    = false;
    this.currentNotes = [];
    this.pendingSustainRelease = false;
  }

  private getOrCreateReverb(): Tone.Reverb {
    if (!this.reverb) {
      this.reverb = new Tone.Reverb({ decay: effectDialSettings().decay, preDelay: 0.05 });
      this.reverb.wet.value = 0;
      this.delay.disconnect();
      this.delay.chain(this.reverb, this.outputGate);
    }
    return this.reverb;
  }

  public setEffects(state: EffectsState) {
    this.currentEffectsState = state;
    const wasSustaining = this.sustainEnabled;
    this.sustainEnabled = state.sustain;
    const rampTime = 0.1;
    const dial = effectDialSettings();
    this.chorus.wet.rampTo(state.chorus ? Math.min(1, 0.5 * dial.amount) : 0, rampTime);
    this.bitcrusher.wet.rampTo(state.bitcrusher ? Math.min(1, 0.7 * dial.amount) : 0, rampTime);
    this.delay.wet.rampTo(state.delay ? Math.min(1, 0.4 * dial.amount) : 0, rampTime);
    this.delay.feedback.rampTo(dial.feedback, rampTime);
    if (state.reverb) {
      const rev = this.getOrCreateReverb();
      rev.wet.rampTo(Math.min(1, 0.6 * dial.amount), rampTime);
      queueReverbDecay(rev, dial.decay);
    } else if (this.reverb) {
      this.reverb.wet.rampTo(0, rampTime);
    }
    if (wasSustaining && !this.sustainEnabled && this.pendingSustainRelease) {
      this.releaseVoices();
    }
  }

  public triggerNote(note: string, velocity: number) {
    this.triggerChord([note], velocity);
  }

  public releaseNote(gradual: boolean = false, choke: boolean = false) {
    this.releaseChord(gradual, choke);
  }

  public connectRecorder(recorder: Tone.Recorder) {
    this.limiter.connect(recorder);
  }

  public dispose() {
    this.stopAudioMonitor();
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.unsubscribeMusicStore();
    this.unsubscribeEffectDial();
    this.synth.releaseAll();
    this.synth.dispose();
    this.chorus.dispose();
    this.bitcrusher.dispose();
    this.delay.dispose();
    this.reverb?.dispose();
    this.outputGate.dispose();
    this.limiter.dispose();
  }
}
