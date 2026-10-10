import * as Tone from 'tone';
import { useLooperStore } from '../store/looperState';
import { TrackAudioLayer } from '../audio/trackAudioLayer';
import { InstrumentService } from '../audio/synth';
import { midiManager } from '../midi/midiManager';
import { toast } from '../store/toastStore';
import type { TrackEvent } from './trackModel';
import {
  durationBetweenTicks,
  loopTicks,
  quantizeAbsoluteTick,
  wrapLoopTick,
} from './timing';

interface HeldRecording {
  trackId: number;
  notes: string[];
  startAbsoluteTick: number;
  velocity: number;
}

export class LooperService {
  private trackLayers: Partial<Record<number, TrackAudioLayer>> = {};
  private trackParts: Partial<Record<number, Tone.Part<[string, TrackEvent]>>> = {};
  private directInstrument: InstrumentService | null = null;
  private metronomeSynth: Tone.Synth | null = null;
  private performanceRecorder: Tone.Recorder | null = null;
  private metronomeEventId: number | null = null;
  private countInEventId: number | null = null;
  private audioStartPromise: Promise<void> | null = null;
  private audioInitialized = false;
  private lifecycleListenersAttached = false;
  private unsubscribeLooperStore: () => void;
  private loopCycle = 0;

  private liveHeldNotes: HeldRecording | null = null;
  private liveCurrentNotes: string[] = [];
  private liveVelocity = 0.8;

  constructor() {
    const { loopBars, beatsPerBar } = useLooperStore.getState();
    Tone.Transport.loop = true;
    Tone.Transport.timeSignature = beatsPerBar;
    Tone.Transport.loopEnd = `${loopBars}m`;
    Tone.Transport.on('loop', this.handleTransportLoop);

    this.unsubscribeLooperStore = useLooperStore.subscribe((state, prevState) => {
      if (state.bpm !== prevState.bpm) {
        Tone.Transport.bpm.rampTo(state.bpm, 0.05);
      }

      if (state.loopBars !== prevState.loopBars || state.beatsPerBar !== prevState.beatsPerBar) {
        Tone.Transport.timeSignature = state.beatsPerBar;
        Tone.Transport.loopEnd = `${state.loopBars}m`;
        Tone.Transport.position = 0;
        this.loopCycle = 0;
        Object.values(this.trackParts).forEach(part => {
          if (part) part.loopEnd = `${state.loopBars}m`;
        });
      }

      const previousArmedId = prevState.tracks.find(track => track.isArmed)?.id ?? null;
      const armedId = state.tracks.find(track => track.isArmed)?.id ?? null;

      if (state.isGlobalRecording !== prevState.isGlobalRecording) {
        if (state.isGlobalRecording && armedId !== null) {
          state.beginRecordingTake(armedId, !state.overdubEnabled);
          this.beginHeldRecordingIfNeeded(armedId);
        } else {
          this.finalizeHeldRecording();
          state.finishRecordingTake();
        }
      } else if (state.isGlobalRecording && previousArmedId !== armedId) {
        this.finalizeHeldRecording();
        state.finishRecordingTake();
        if (armedId !== null) {
          state.beginRecordingTake(armedId, !state.overdubEnabled);
          this.beginHeldRecordingIfNeeded(armedId);
        }
      }

      if (state.isPlaying !== prevState.isPlaying) {
        if (state.isPlaying) {
          Tone.Transport.start();
        } else {
          this.cancelCountIn(false);
          this.finalizeHeldRecording();
          state.finishRecordingTake();
          Tone.Transport.stop();
          Tone.Transport.loop = true;
          this.loopCycle = 0;
          this.releaseAllLiveNotes();
          if (state.isGlobalRecording || state.isCountingIn) {
            state.setTransportState({ isGlobalRecording: false, isCountingIn: false });
          }
        }
      }

      const anySolo = state.tracks.some(track => track.isSoloed);
      state.tracks.forEach(track => {
        const layer = this.trackLayers[track.id];
        if (!layer) return;
        layer.setInstrument(track.instrument);
        layer.setEffects(track.effects);
        layer.setVolume(track.volume);
        layer.setMuteSolo(track.isMuted, track.isSoloed, anySolo);

        if (track.isArmed) this.directInstrument?.setEffects(track.effects);

        const previousTrack = prevState.tracks.find(candidate => candidate.id === track.id);
        if (previousTrack && previousTrack.events !== track.events) {
          this.rebuildTrackPart(track.id, track.events);
        }
      });
    });
  }

  private handleTransportLoop = () => {
    this.loopCycle++;
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Tone.context.state === 'suspended') {
      Tone.context.resume().catch(() => {});
    }
  };

  private handleUserGesture = () => {
    if (Tone.context.state === 'suspended') Tone.context.resume().catch(() => {});
  };

  private attachLifecycleListeners() {
    if (this.lifecycleListenersAttached) return;
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerdown', this.handleUserGesture, { passive: true });
    document.addEventListener('keydown', this.handleUserGesture, { passive: true });
    this.lifecycleListenersAttached = true;
  }

  private async initializeAudioContext() {
    await Tone.start();
    if (Tone.context.state !== 'running') await Tone.context.resume();
    // Gesture notes are immediate input; keep only a small scheduling buffer.
    Tone.getContext().lookAhead = 0.015;
    Tone.Transport.bpm.value = useLooperStore.getState().bpm;
    this.ensureAudioGraph();
    this.attachLifecycleListeners();
    this.audioInitialized = true;
  }

  public startAudioContext(): Promise<void> {
    if (this.audioInitialized) {
      return Tone.context.state === 'running' ? Promise.resolve() : Tone.context.resume();
    }
    if (!this.audioStartPromise) {
      this.audioStartPromise = this.initializeAudioContext().catch((error: unknown) => {
        this.audioStartPromise = null;
        throw error;
      });
    }
    return this.audioStartPromise;
  }

  private ensureAudioGraph() {
    if (this.directInstrument) return;

    this.directInstrument = new InstrumentService();
    this.metronomeSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
    }).toDestination();
    this.metronomeSynth.volume.value = -14;

    const state = useLooperStore.getState();
    const anySolo = state.tracks.some(track => track.isSoloed);

    state.tracks.forEach(track => {
      const layer = new TrackAudioLayer(track.id);
      const part = new Tone.Part<[string, TrackEvent]>((time, event) => {
        layer.triggerAttackRelease(event.notes, `${event.durationTicks}i`, time, event.velocity);
      }).start(0);

      part.loop = true;
      part.loopEnd = `${state.loopBars}m`;
      layer.setInstrument(track.instrument);
      layer.setEffects(track.effects);
      layer.setVolume(track.volume);
      layer.setMuteSolo(track.isMuted, track.isSoloed, anySolo);

      this.trackLayers[track.id] = layer;
      this.trackParts[track.id] = part;
      this.rebuildTrackPart(track.id, track.events);

      if (track.isArmed) this.directInstrument?.setEffects(track.effects);
    });

    this.metronomeEventId = Tone.Transport.scheduleRepeat(time => {
      const transportState = useLooperStore.getState();
      if (!transportState.metronomeEnabled && !transportState.isCountingIn) return;
      const beat = Math.floor(Tone.Transport.ticks / Tone.Transport.PPQ) % transportState.beatsPerBar;
      this.metronomeSynth?.triggerAttackRelease(beat === 0 ? 'C6' : 'G5', '32n', time, beat === 0 ? 0.8 : 0.5);
    }, '4n');
  }

  private rebuildTrackPart(trackId: number, events: TrackEvent[]) {
    const part = this.trackParts[trackId];
    if (!part) return;
    part.clear();
    events.forEach(event => part.add(`${event.tick}i`, event));
  }

  private getArmedTrackId(): number | null {
    return useLooperStore.getState().tracks.find(track => track.isArmed)?.id ?? null;
  }

  private getAbsoluteTick(): number {
    const ppq = Tone.Transport.PPQ;
    const { loopBars, beatsPerBar } = useLooperStore.getState();
    return this.loopCycle * loopTicks(ppq, loopBars, beatsPerBar) +
      wrapLoopTick(Tone.Transport.ticks, ppq, loopBars, beatsPerBar);
  }

  private beginHeldRecordingIfNeeded(trackId: number) {
    if (this.liveCurrentNotes.length === 0 || this.liveHeldNotes) return;
    const state = useLooperStore.getState();
    this.liveHeldNotes = {
      trackId,
      notes: [...this.liveCurrentNotes],
      startAbsoluteTick: quantizeAbsoluteTick(this.getAbsoluteTick(), state.quantize, Tone.Transport.PPQ),
      velocity: this.liveVelocity,
    };
  }

  private finalizeHeldRecording() {
    const held = this.liveHeldNotes;
    if (!held) return;
    const state = useLooperStore.getState();
    const ppq = Tone.Transport.PPQ;
    const loopLength = loopTicks(ppq, state.loopBars, state.beatsPerBar);
    const endTick = quantizeAbsoluteTick(this.getAbsoluteTick(), state.quantize, ppq);
    const durationTicks = Math.min(
      loopLength,
      durationBetweenTicks(held.startAbsoluteTick, endTick, state.quantize, ppq),
    );
    state.addTrackEvent(held.trackId, {
      notes: held.notes,
      velocity: held.velocity,
      tick: wrapLoopTick(held.startAbsoluteTick, ppq, state.loopBars, state.beatsPerBar),
      durationTicks,
    });
    this.liveHeldNotes = null;
  }

  private setTrackPartsMuted(muted: boolean) {
    Object.values(this.trackParts).forEach(part => {
      if (part) part.mute = muted;
    });
  }

  private cancelCountIn(updateState: boolean = true) {
    if (this.countInEventId !== null) {
      Tone.Transport.clear(this.countInEventId);
      this.countInEventId = null;
    }
    this.setTrackPartsMuted(false);
    Tone.Transport.loop = true;
    if (updateState && useLooperStore.getState().isCountingIn) {
      useLooperStore.getState().setTransportState({ isCountingIn: false, isPlaying: false });
    }
  }

  private startCountIn(bars: 1 | 2) {
    this.ensureAudioGraph();
    this.cancelCountIn(false);
    this.loopCycle = 0;
    Tone.Transport.stop();
    Tone.Transport.position = 0;
    Tone.Transport.loop = false;
    this.setTrackPartsMuted(true);

    this.countInEventId = Tone.Transport.scheduleOnce(time => {
      this.countInEventId = null;
      this.setTrackPartsMuted(false);
      Tone.Transport.stop(time);
      Tone.Transport.loop = true;
      Tone.Transport.start(time, 0);
      this.loopCycle = 0;
      useLooperStore.getState().setTransportState({
        isCountingIn: false,
        isGlobalRecording: true,
        isPlaying: true,
      });
    }, `${bars}m`);

    useLooperStore.getState().setTransportState({
      isCountingIn: true,
      isGlobalRecording: false,
      isPlaying: true,
    });
  }

  public toggleRecording() {
    const state = useLooperStore.getState();
    if (state.isCountingIn) {
      this.cancelCountIn(true);
      return;
    }
    if (state.isGlobalRecording) {
      state.setTransportState({ isGlobalRecording: false });
      return;
    }
    if (!state.isPlaying && state.countInBars > 0) {
      this.startCountIn(state.countInBars as 1 | 2);
      return;
    }
    state.setTransportState({ isGlobalRecording: true, isPlaying: true });
  }

  public triggerChord(notes: string[], velocity: number) {
    this.ensureAudioGraph();
    if (Tone.context.state !== 'running') Tone.context.resume().catch(() => {});

    const notesChanged = notes.length !== this.liveCurrentNotes.length ||
      !notes.every((note, index) => note === this.liveCurrentNotes[index]);

    this.directInstrument?.triggerChord(notes, velocity);
    if (!notesChanged && this.liveCurrentNotes.length > 0) return;

    if (this.liveCurrentNotes.length > 0) {
      const notesToRelease = this.liveCurrentNotes.filter(note => !notes.includes(note));
      if (notesToRelease.length > 0) midiManager.sendNoteOff(notesToRelease);
      this.finalizeHeldRecording();
    }

    const notesToAttack = notes.filter(note => !this.liveCurrentNotes.includes(note));
    const attackTarget = this.liveCurrentNotes.length === 0 ? notes : notesToAttack;
    if (attackTarget.length > 0) midiManager.sendNoteOn(attackTarget, velocity);

    this.liveCurrentNotes = [...notes];
    this.liveVelocity = velocity;
    const state = useLooperStore.getState();
    const armedId = this.getArmedTrackId();
    if (state.isGlobalRecording && state.isPlaying && armedId !== null) {
      this.beginHeldRecordingIfNeeded(armedId);
    }
  }

  public releaseChord(gradual: boolean = false) {
    this.directInstrument?.releaseChord(gradual);
    if (this.liveCurrentNotes.length > 0) midiManager.sendNoteOff(this.liveCurrentNotes);
    this.finalizeHeldRecording();
    this.liveCurrentNotes = [];
  }

  public triggerNote(note: string, velocity: number) {
    this.triggerChord([note], velocity);
  }

  public releaseNote(gradual: boolean = false) {
    this.releaseChord(gradual);
  }

  public setMasterVolume(db: number, rampTime: number = 0) {
    Tone.Destination.volume.rampTo(db, rampTime);
  }

  public async startPerformanceRecording(): Promise<boolean> {
    try {
      await this.startAudioContext();
      if (!Tone.Recorder.supported) {
        toast.warning('Performance recording is not supported by this browser. WAV loop export is still available.');
        return false;
      }
      if (!this.performanceRecorder) {
        this.performanceRecorder = new Tone.Recorder();
        this.directInstrument?.connectRecorder(this.performanceRecorder);
        Object.values(this.trackLayers).forEach(layer => layer?.connectRecorder(this.performanceRecorder!));
      }
      if (this.performanceRecorder.state === 'started') return true;
      await this.performanceRecorder.start();
      useLooperStore.getState().setTransportState({ isPerformanceRecording: true });
      toast.success('Performance capture started. Live playing and the loop mix are being recorded.');
      return true;
    } catch (error) {
      console.error('Performance capture failed to start:', error);
      useLooperStore.getState().setTransportState({ isPerformanceRecording: false });
      toast.error('Could not start performance capture.');
      return false;
    }
  }

  public async stopPerformanceRecording(): Promise<Blob | null> {
    if (!this.performanceRecorder || this.performanceRecorder.state !== 'started') {
      useLooperStore.getState().setTransportState({ isPerformanceRecording: false });
      return null;
    }
    try {
      const blob = await this.performanceRecorder.stop();
      useLooperStore.getState().setTransportState({ isPerformanceRecording: false });
      const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `kasync-performance-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('Performance capture saved.');
      return blob;
    } catch (error) {
      console.error('Performance capture failed to stop:', error);
      useLooperStore.getState().setTransportState({ isPerformanceRecording: false });
      toast.error('Could not finish performance capture.');
      return null;
    }
  }

  private releaseAllLiveNotes() {
    this.directInstrument?.panic();
    if (this.liveCurrentNotes.length > 0) midiManager.sendNoteOff(this.liveCurrentNotes);
    Object.values(this.trackLayers).forEach(layer => layer?.releaseAll());
    this.liveCurrentNotes = [];
    this.liveHeldNotes = null;
  }

  public dispose() {
    this.cancelCountIn(false);
    this.releaseAllLiveNotes();
    this.unsubscribeLooperStore();
    Tone.Transport.off('loop', this.handleTransportLoop);
    if (this.metronomeEventId !== null) Tone.Transport.clear(this.metronomeEventId);
    Object.values(this.trackParts).forEach(part => part?.dispose());
    Object.values(this.trackLayers).forEach(layer => layer?.dispose());
    this.metronomeSynth?.dispose();
    this.performanceRecorder?.dispose();
    this.directInstrument?.dispose();
    this.directInstrument = null;
    this.metronomeSynth = null;
    this.performanceRecorder = null;
    this.audioInitialized = false;
    this.audioStartPromise = null;
    this.trackLayers = {};
    this.trackParts = {};
    if (this.lifecycleListenersAttached) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      document.removeEventListener('pointerdown', this.handleUserGesture);
      document.removeEventListener('keydown', this.handleUserGesture);
      this.lifecycleListenersAttached = false;
    }
  }
}

export const looperService = new LooperService();

if (import.meta.hot) {
  import.meta.hot.dispose(() => looperService.dispose());
}
