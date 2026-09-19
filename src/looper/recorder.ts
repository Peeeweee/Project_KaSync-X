import * as Tone from 'tone';
import { useLooperStore } from '../store/looperState';
import { TrackAudioLayer } from '../audio/trackAudioLayer';
import { InstrumentService } from '../audio/synth';

export class LooperService {
  private trackLayers: Record<number, TrackAudioLayer> = {};
  private trackParts: Record<number, Tone.Part> = {};
  private directInstrument: InstrumentService;
  
  // Real-time tracking of held notes during recording
  private liveHeldNotes: { notes: string[], startTime: number, velocity: number } | null = null;
  private liveCurrentNotes: string[] = [];
  
  constructor() {
    this.directInstrument = new InstrumentService();
    
    // We instantiate lazily or upfront. Upfront is better for hot-swapping.
    for (let i = 0; i < 6; i++) {
      this.trackLayers[i] = new TrackAudioLayer(i);
      this.trackParts[i] = new Tone.Part((time, event: any) => {
        this.trackLayers[i].triggerAttackRelease(event.notes, event.duration, time, event.velocity);
      }, []).start(0);
      this.trackParts[i].loop = true;
      this.trackParts[i].loopEnd = '4m'; // Fixed 4-bar loop length
    }

    // Set Transport defaults
    Tone.Transport.loop = true;
    Tone.Transport.loopEnd = '4m';

    // Subscribe to state changes to update layers
    useLooperStore.subscribe((state, prevState) => {
      // Handle Transport state
      if (state.isPlaying !== prevState.isPlaying) {
        if (state.isPlaying) {
          Tone.Transport.start();
        } else {
          Tone.Transport.stop();
          this.releaseAllLiveNotes();
        }
      }
      
      if (state.bpm !== prevState.bpm) {
        Tone.Transport.bpm.value = state.bpm;
      }

      // Handle Track updates (volume, mute, solo, instruments, effects)
      const anySolo = state.tracks.some(t => t.isSoloed);
      state.tracks.forEach(track => {
        const layer = this.trackLayers[track.id];
        layer.setInstrument(track.instrument);
        layer.setEffects(track.effects);
        layer.setVolume(track.volume);
        layer.setMuteSolo(track.isMuted, track.isSoloed, anySolo);
        
        // Sync live instrument effects to the currently armed track
        if (track.isArmed) {
          this.directInstrument.setEffects(track.effects);
        }
        
        // Handle recorded events rebuilding if changed (e.g., deleted or added)
        const prevTrack = prevState.tracks.find(t => t.id === track.id);
        if (prevTrack && prevTrack.events !== track.events) {
          this.rebuildTrackPart(track.id, track.events);
        }
      });
    });
  }

  public async startAudioContext() {
    await Tone.start();
    if (Tone.context.state !== 'running') {
      await Tone.context.resume();
    }
    // Auto-resume AudioContext when tab becomes visible again (prevents "suspended" warning)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Tone.context.state === 'suspended') {
        Tone.context.resume().catch(() => {});
      }
    });
  }

  private rebuildTrackPart(trackId: number, events: any[]) {
    this.trackParts[trackId].clear();
    events.forEach(e => {
      this.trackParts[trackId].add(e.time, e);
    });
  }

  // Gets the currently armed track from store
  private getArmedTrackId(): number | null {
    const tracks = useLooperStore.getState().tracks;
    const armed = tracks.find(t => t.isArmed);
    return armed ? armed.id : null;
  }

  // Intercepts live gesture plays
  public triggerChord(notes: string[], velocity: number) {
    const armedId = this.getArmedTrackId();
    
    // Always play through direct instrument for immediate feedback
    this.directInstrument.triggerChord(notes, velocity);

    // Also record to armed track if one exists
    if (armedId === null) return;
    const layer = this.trackLayers[armedId];
    
    // Check if notes changed
    const notesChanged = notes.length !== this.liveCurrentNotes.length || !notes.every((v, i) => v === this.liveCurrentNotes[i]);

    if (notesChanged || this.liveCurrentNotes.length === 0) {
      if (this.liveCurrentNotes.length > 0) {
        // Smart diffing for the looper track
        const notesToRelease = this.liveCurrentNotes.filter(n => !notes.includes(n));
        if (notesToRelease.length > 0) {
          layer.triggerRelease(notesToRelease);
        }
        
        // Finish recording the old held notes segment
        if (this.liveHeldNotes) {
          let duration = Tone.Transport.seconds - this.liveHeldNotes.startTime;
          if (duration < 0) duration += Tone.Time('4m').toSeconds();
          duration = Math.max(0.1, duration);
          useLooperStore.getState().addTrackEvent(armedId, {
            notes: this.liveHeldNotes.notes,
            time: this.liveHeldNotes.startTime,
            duration: duration,
            velocity: this.liveHeldNotes.velocity
          });
        }
      }

      // Smart diffing for attack
      const notesToAttack = notes.filter(n => !this.liveCurrentNotes.includes(n));
      const attackTarget = this.liveCurrentNotes.length === 0 ? notes : notesToAttack;
      
      if (attackTarget.length > 0) {
        layer.triggerAttack(attackTarget, velocity);
      }
      
      this.liveCurrentNotes = [...notes];

      // If recording, log the start of the new segment
      const state = useLooperStore.getState();
      if (state.isGlobalRecording && state.isPlaying) {
        let startTime = Tone.Transport.seconds;
        if (state.quantize) {
          const quantized = Tone.Time("16n").toSeconds();
          startTime = Math.round(startTime / quantized) * quantized;
        }
        this.liveHeldNotes = { notes: [...notes], startTime, velocity };
      }
    }
  }

  public releaseChord(gradual: boolean = false) {
    // Always release from direct instrument
    this.directInstrument.releaseChord(gradual);
    
    const armedId = this.getArmedTrackId();
    if (armedId !== null && this.liveCurrentNotes.length > 0) {
      this.trackLayers[armedId].triggerRelease(this.liveCurrentNotes);
      
      // If we were recording this note, finish it and add to store
      if (this.liveHeldNotes) {
        let duration = Tone.Transport.seconds - this.liveHeldNotes.startTime;
        
        // Handle loop wrap-around manually or ensure minimal duration
        if (duration < 0) duration += Tone.Time('4m').toSeconds();
        duration = Math.max(0.1, duration);

        useLooperStore.getState().addTrackEvent(armedId, {
          notes: this.liveHeldNotes.notes,
          velocity: this.liveHeldNotes.velocity,
          time: this.liveHeldNotes.startTime,
          duration: duration
        });
        this.liveHeldNotes = null;
      }
      
      this.liveCurrentNotes = [];
    }
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

  private releaseAllLiveNotes() {
    this.directInstrument.panic(); // clear live instrument voices
    for (let i = 0; i < 6; i++) {
      this.trackLayers[i].releaseAll();
    }
    this.liveCurrentNotes = [];
    this.liveHeldNotes = null;
  }
}

export const looperService = new LooperService();
