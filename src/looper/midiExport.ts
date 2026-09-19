import { Midi } from '@tonejs/midi';
import type { Track } from './trackModel';

export function exportMIDI(tracks: Track[], bpm: number) {
  // We export all tracks that have events, ignoring muted tracks.
  const activeTracks = tracks.filter(t => t.events.length > 0 && !t.isMuted);
  
  if (activeTracks.length === 0) {
    alert("No active tracks with recorded events to export.");
    return;
  }

  const midi = new Midi();
  // Set tempo
  midi.header.setTempo(bpm);

  activeTracks.forEach(track => {
    const midiTrack = midi.addTrack();
    midiTrack.name = `Track ${track.id + 1} - ${track.instrument}`;
    
    // Assign a basic MIDI program based on instrument type for playback in DAWs
    let program = 0;
    switch(track.instrument) {
      case 'Subtractive': program = 81; break; // Synth Sawtooth
      case 'FM': program = 80; break;          // Synth Square
      case 'Electric Piano': program = 4; break; // Electric Piano 1
      case 'Pad': program = 88; break;           // Pad 1 (new age)
    }
    midiTrack.instrument.number = program;

    track.events.forEach(event => {
      event.notes.forEach(noteName => {
        midiTrack.addNote({
          name: noteName,
          time: event.time,
          duration: event.duration,
          velocity: event.velocity
        });
      });
    });
  });

  const buffer = midi.toArray();
  const blob = new Blob([buffer as any], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kasync_session.mid';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
