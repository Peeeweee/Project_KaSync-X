import * as Tone from 'tone';
import type { Track } from './trackModel';
import { TrackAudioLayer } from '../audio/trackAudioLayer';

export async function exportAudioWav(tracks: Track[], bpm: number): Promise<void> {
  const activeTracks = tracks.filter(t => t.events.length > 0 && !t.isMuted);
  
  if (activeTracks.length === 0) {
    alert("No active tracks with recorded events to export.");
    return;
  }

  // Calculate exactly 4 bars in seconds
  const beats = 16; 
  const duration = (beats / bpm) * 60;

  try {
    // Tone.Offline temporarily overrides Tone.context during the callback
    const buffer = await Tone.Offline(({ transport }) => {
      transport.bpm.value = bpm;
      
      activeTracks.forEach(track => {
        // Instantiate track layer in offline context
        const layer = new TrackAudioLayer(track.id);
        layer.setInstrument(track.instrument);
        layer.setEffects(track.effects);
        layer.setVolume(track.volume);
        
        // Schedule events on the offline transport
        const part = new Tone.Part((time, event: any) => {
          layer.triggerAttackRelease(event.notes, event.duration, time, event.velocity);
        }, track.events).start(0);
        part.loop = false; // Render one pass
      });

      // Start the offline transport
      transport.start(0);
    }, duration);

    // Convert AudioBuffer to WAV blob
    const audioBuffer = buffer.get();
    if (!audioBuffer) throw new Error("AudioBuffer is null");
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    
    // Trigger download
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kasync_session.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
  } catch (error) {
    console.error("Export failed:", error);
    alert("Failed to render audio.");
  }
}

// Utility to convert an AudioBuffer to a WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"
  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit
  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  // Interleave and convert to 16-bit PCM
  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArray], { type: "audio/wav" });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}
