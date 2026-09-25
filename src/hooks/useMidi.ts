/**
 * useMidi — wires the MidiManager singleton to app stores and the looper service.
 * Call this hook once at the App root level.
 */
import { useEffect } from 'react';
import { midiManager } from '../midi/midiManager';
import { useMidiLearnStore } from '../midi/midiLearn';
import { looperService } from '../looper/recorder';
import { useLooperStore } from '../store/looperState';

export function useMidi() {
  useEffect(() => {
    // Request MIDI access; resolves asynchronously, UI reacts via useMidiStore
    midiManager.init();

    midiManager.setCallbacks({
      /** MIDI noteOn (or chord change while holding) → trigger through the looper */
      onNoteOn: (notes, velocity) => {
        looperService.triggerChord(notes, velocity);
      },

      /** All keys released → release the looper's live chord */
      onNoteOff: () => {
        looperService.releaseChord(false);
      },

      /** Clock-derived BPM → sync Tone.Transport */
      onBpmChange: (bpm) => {
        useLooperStore.getState().setTransportState({ bpm });
      },

      /** MIDI Start / Continue */
      onTransportStart: () => {
        useLooperStore.getState().setTransportState({ isPlaying: true });
      },

      /** MIDI Stop */
      onTransportStop: () => {
        useLooperStore.getState().setTransportState({ isPlaying: false });
      },

      /** Every CC → midiLearn store (learn capture or parameter dispatch) */
      onCC: (cc, value) => {
        useMidiLearnStore.getState().applyCC(cc, value);
      },
    });
  }, []);
}
