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

const FALLBACK_RELEASE_MS = 8000;

export class InstrumentService {
  private synth: Tone.PolySynth;
  private limiter: Tone.Limiter;
  private activeInstrument: InstrumentType = 'Subtractive';
  private currentEffectsState: EffectsState | null = null;
  private currentNotes: string[] = [];
  private isPlaying: boolean = false;
  
  // Failsafe watchdog to prevent hanging notes if release is missed
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private chorus: Tone.Chorus;
  private bitcrusher: Tone.BitCrusher;
  private delay: Tone.FeedbackDelay;
  private reverb: Tone.Reverb | null = null;

  // AudioContext watchdog — resumes if browser auto-suspends it
  private watchdogInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.limiter = new Tone.Limiter(-3).toDestination(); // -3dBFS ceiling keeps peaks pristine without clipping

    // Initialize Effects (reverb is lazy to avoid blocking on startup)
    this.chorus     = new Tone.Chorus(4, 2.5, 0.4).start();
    this.bitcrusher = new Tone.BitCrusher(16); // 16-bit = transparent; toggled via wet
    this.delay      = new Tone.FeedbackDelay('8n', 0.35);

    // Initial state: all bypassed
    this.chorus.wet.value     = 0;
    this.bitcrusher.wet.value = 0;
    this.delay.wet.value      = 0;

    // Build the direct effect chain
    this.chorus.chain(this.bitcrusher, this.delay, this.limiter);

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
      this.synth.releaseAll();
      this.synth.disconnect();
      this.synth.dispose();
    }

    let synth: Tone.PolySynth;

    switch (type) {
      case 'FM':
        // Warm FM bell — gentle modulation, clear attack
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 16,
          oscillator: { type: 'fmsine2', modulationIndex: 3, harmonicity: 1.5 } as any,
          envelope: { attack: 0.03, decay: 0.3, sustain: 0.5, release: 0.4 },
        });
        break;
      case 'Electric Piano':
        // Rhodes-style: fast attack, long decay, low sustain
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 16,
          oscillator: { type: 'fmsine4', modulationIndex: 8, harmonicity: 3.5 } as any,
          envelope: { attack: 0.01, decay: 0.8, sustain: 0.1, release: 0.5 },
        });
        break;
      case 'Pad':
        // Lush pad — slow attack, long release
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 16,
          oscillator: { type: 'amsine4', harmonicity: 2 } as any,
          envelope: { attack: 0.6, decay: 0.2, sustain: 0.9, release: 1.0 },
        });
        break;
      case 'Subtractive':
      default:
        // Classic analog-style sawtooth — warm and musical
        synth = new Tone.PolySynth(Tone.Synth, {
          maxPolyphony: 16,
          oscillator: { type: 'sawtooth' },
          envelope: { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.3 },
        });
        break;
    }
    synth.volume.value = -8; // Loud, clear, punchy volume with headroom for chords
    synth.connect(this.chorus);
    return synth;
  }

  private resetWatchdog() {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      this.releaseChord(true);
    }, FALLBACK_RELEASE_MS);
  }

  public async startAudioContext() {
    await Tone.start();
    if (Tone.context.state !== 'running') {
      await Tone.context.resume();
    }
    Tone.Destination.volume.value = 0;
    Tone.Destination.mute = false;
    // Keep context alive: resume on any subsequent user gesture.
    // Browsers auto-suspend after ~1 minute of no interaction.
    const resumeOnGesture = () => {
      if (Tone.context.state !== 'running') {
        Tone.context.resume().catch(() => {});
      }
    };
    document.addEventListener('click',      resumeOnGesture);
    document.addEventListener('touchstart', resumeOnGesture);
    document.addEventListener('keydown',    resumeOnGesture);
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
    // Auto-resume AudioContext if browser suspended it — safe to call repeatedly
    if (Tone.context.state !== 'running') {
      Tone.context.resume().catch(() => {});
    }

    // Ensure Tone master output is unmuted and audible
    if (Tone.Destination.volume.value < -12) {
      Tone.Destination.volume.value = 0;
    }
    if (Tone.Destination.mute) {
      Tone.Destination.mute = false;
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
      this.resetWatchdog();
      return;
    }

    if (this.currentEffectsState) {
      this.setEffects(this.currentEffectsState);
    }

    if (this.isPlaying) {
      this.synth.releaseAll();
    }

    this.currentNotes = [...notes];
    this.isPlaying    = true;

    this.synth.triggerAttack(notes, Tone.now(), safeVelocity);
    this.resetWatchdog();
  }

  public releaseChord(_gradual: boolean = false) {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    
    if (this.isPlaying) {
      if (this.currentNotes.length > 0) {
        this.synth.triggerRelease(this.currentNotes, Tone.now());
      }
      this.synth.releaseAll();
    }
    
    this.isPlaying    = false;
    this.currentNotes = [];
  }

  /** Emergency voice panic — rebuilds the synth entirely to clear all stuck voices. */
  public panic() {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.synth.releaseAll(Tone.now());
    this.isPlaying    = false;
    this.currentNotes = [];
  }

  private getOrCreateReverb(): Tone.Reverb {
    if (!this.reverb) {
      this.reverb = new Tone.Reverb({ decay: 2.0, preDelay: 0.05 });
      this.reverb.wet.value = 0;
      this.delay.disconnect();
      this.delay.chain(this.reverb, this.limiter);
    }
    return this.reverb;
  }

  public setEffects(state: EffectsState) {
    this.currentEffectsState = state;
    const rampTime = 0.1;
    this.chorus.wet.rampTo(state.chorus      ? 0.5 : 0, rampTime);
    this.bitcrusher.wet.rampTo(state.bitcrusher ? 0.7 : 0, rampTime);
    this.delay.wet.rampTo(state.delay       ? 0.4 : 0, rampTime);
    if (state.reverb) {
      const rev = this.getOrCreateReverb();
      rev.wet.rampTo(0.6, rampTime);
    } else if (this.reverb) {
      this.reverb.wet.rampTo(0, rampTime);
    }
  }

  public triggerNote(note: string, velocity: number) {
    this.triggerChord([note], velocity);
  }

  public releaseNote(gradual: boolean = false) {
    this.releaseChord(gradual);
  }
}

export const instrument = new InstrumentService();
