import * as Tone from 'tone';
import { useMusicStore } from '../store/musicState';
import type { InstrumentType, EffectsState } from '../store/musicState';

// ─────────────────────────────────────────────────────────────
//  InstrumentService — voice-exhaustion-proof audio engine
//
//  Design principle: triggerAttackRelease (TAR) with HOLD_DURATION.
//  Voices are ALWAYS automatically freed after HOLD_DURATION seconds.
//  While a chord is held by the user, we re-fire TAR every RENEW_INTERVAL
//  so the sound is continuous. On release we stop renewing — the current
//  TAR burst fades out on its own.
//
//  This is bulletproof vs. hand-tracking dropout, MediaPipe
//  setTimeout violations, and any other reason releaseChord might
//  fail to fire cleanly. No orphaned voices. Ever.
// ─────────────────────────────────────────────────────────────

const HOLD_DURATION    = 0.6;   // seconds each TAR burst is held
const RENEW_INTERVAL_MS = 400;  // ms between renewals (must be < HOLD_DURATION * 1000)

export class InstrumentService {
  private synth: Tone.PolySynth;
  private limiter: Tone.Limiter;
  private activeInstrument: InstrumentType = 'Subtractive';
  private currentEffectsState: EffectsState | null = null;
  private currentNotes: string[] = [];
  private isPlaying: boolean = false;
  private holdDuration: number = HOLD_DURATION;
  private renewTimer: ReturnType<typeof setInterval> | null = null;

  private chorus: Tone.Chorus;
  private bitcrusher: Tone.BitCrusher;
  private delay: Tone.FeedbackDelay;
  private reverb: Tone.Reverb;

  // AudioContext watchdog — resumes if browser auto-suspends it
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.limiter = new Tone.Limiter(-6).toDestination();

    // Initialize Effects
    this.chorus     = new Tone.Chorus(4, 2.5, 0.4).start();
    this.bitcrusher = new Tone.BitCrusher(16); // 16-bit = transparent; toggled via wet
    this.delay      = new Tone.FeedbackDelay('8n', 0.35);
    this.reverb     = new Tone.Reverb({ decay: 2.0, preDelay: 0.05 });

    // Initial state: all bypassed
    this.chorus.wet.value     = 0;
    this.bitcrusher.wet.value = 0;
    this.delay.wet.value      = 0;
    this.reverb.wet.value     = 0;

    // Build the effect chain
    this.chorus.chain(this.bitcrusher, this.delay, this.reverb, this.limiter);

    this.synth = this.buildSynth('Subtractive');

    // AudioContext watchdog — auto-resumes if the browser suspends it
    this.watchdogInterval = setInterval(() => {
      if (Tone.context.state === 'suspended') {
        Tone.context.resume().catch(() => {});
      }
    }, 2000);

    useMusicStore.subscribe((state, prevState) => {
      if (state.currentInstrument !== prevState.currentInstrument) {
        this.switchInstrument(state.currentInstrument);
      }
    });
  }

  private buildSynth(type: InstrumentType): Tone.PolySynth {
    // Dispose old synth if switching
    if (this.synth) {
      this.stopRenewLoop();
      this.synth.releaseAll();
      this.synth.disconnect();
      this.synth.dispose();
    }

    let synth: Tone.PolySynth;
    let holdDuration = HOLD_DURATION;

    switch (type) {
      case 'FM':
        // Warm FM bell — gentle modulation, clear attack
        holdDuration = 0.8;
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          oscillator: { type: 'fmsine2', modulationIndex: 3, harmonicity: 1.5 } as any,
          envelope: { attack: 0.03, decay: 0.3, sustain: 0.5, release: 0.4 },
        });
        break;
      case 'Electric Piano':
        // Rhodes-style: fast attack, long decay, low sustain
        holdDuration = 1.0;
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          oscillator: { type: 'fmsine4', modulationIndex: 8, harmonicity: 3.5 } as any,
          envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.5 },
        });
        break;
      case 'Pad':
        // Lush pad — slow attack, long release
        holdDuration = 1.5;
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 6,
          oscillator: { type: 'amsine4', harmonicity: 2 } as any,
          envelope: { attack: 0.6, decay: 0.2, sustain: 0.9, release: 1.0 },
        });
        break;
      case 'Subtractive':
      default:
        // Classic analog-style sawtooth — warm and musical
        holdDuration = 0.6;
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 8,
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.3 },
        });
        break;
    }
    this.holdDuration = holdDuration;
    synth.volume.value = -10;
    synth.connect(this.chorus);
    return synth;
  }

  /** Fire a single TAR burst for the given notes. */
  private fireTAR(notes: string[], velocity: number) {
    if (Tone.context.state !== 'running') {
      Tone.context.resume().catch(() => {});
      return;
    }
    this.synth.triggerAttackRelease(notes, this.holdDuration, Tone.now(), velocity);
  }

  /** Start renewal loop so the chord sounds continuous while held. */
  private startRenewLoop(notes: string[], velocity: number) {
    this.stopRenewLoop();
    this.renewTimer = setInterval(() => {
      if (this.isPlaying && this.currentNotes.length > 0) {
        this.fireTAR(this.currentNotes, velocity);
      }
    }, RENEW_INTERVAL_MS);
  }

  private stopRenewLoop() {
    if (this.renewTimer !== null) {
      clearInterval(this.renewTimer);
      this.renewTimer = null;
    }
  }

  public async startAudioContext() {
    await Tone.start();
    if (Tone.context.state !== 'running') {
      await Tone.context.resume();
    }
  }

  private switchInstrument(newInstrument: InstrumentType) {
    const wasPlaying = this.isPlaying;
    const notes = [...this.currentNotes];
    this.releaseChord();
    this.activeInstrument = newInstrument;
    this.synth = this.buildSynth(newInstrument);
    if (wasPlaying && notes.length > 0) {
      this.triggerChord(notes, 0.7);
    }
  }

  public triggerChord(notes: string[], velocity: number) {
    const safeVelocity = Math.max(0.1, Math.min(0.85, velocity));

    // Sort both arrays so comparison is order-independent
    const sortedNew     = [...notes].sort();
    const sortedCurrent = [...this.currentNotes].sort();
    const notesChanged  =
      sortedNew.length !== sortedCurrent.length ||
      !sortedNew.every((v, i) => v === sortedCurrent[i]);

    // Same chord already playing — do nothing
    if (!notesChanged && this.isPlaying) return;

    if (this.currentEffectsState) {
      this.setEffects(this.currentEffectsState);
    }

    this.currentNotes = [...notes];
    this.isPlaying    = true;

    // Immediately fire a TAR burst + start renewal so sound is continuous
    this.fireTAR(notes, safeVelocity);
    this.startRenewLoop(notes, safeVelocity);
  }

  public releaseChord(_gradual: boolean = false) {
    // Stop renewal — current TAR burst finishes its own release naturally.
    // No need to call releaseAll; voices self-expire after holdDuration.
    this.stopRenewLoop();
    this.isPlaying    = false;
    this.currentNotes = [];
  }

  /** Emergency voice panic — rebuilds the synth entirely to clear all stuck voices. */
  public panic() {
    this.stopRenewLoop();
    this.synth.releaseAll(Tone.now());
    this.isPlaying    = false;
    this.currentNotes = [];
  }

  public setEffects(state: EffectsState) {
    this.currentEffectsState = state;
    const rampTime = 0.1;
    this.chorus.wet.rampTo(state.chorus      ? 0.5 : 0, rampTime);
    this.bitcrusher.wet.rampTo(state.bitcrusher ? 0.7 : 0, rampTime);
    this.delay.wet.rampTo(state.delay       ? 0.4 : 0, rampTime);
    this.reverb.wet.rampTo(state.reverb      ? 0.6 : 0, rampTime);
  }

  public triggerNote(note: string, velocity: number) {
    this.triggerChord([note], velocity);
  }

  public releaseNote(gradual: boolean = false) {
    this.releaseChord(gradual);
  }
}

export const instrument = new InstrumentService();
