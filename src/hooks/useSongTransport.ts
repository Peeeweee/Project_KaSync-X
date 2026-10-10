import { useEffect } from 'react';
import * as Tone from 'tone';
import { useLooperStore } from '../store/looperState';
import { useMusicStore } from '../store/musicState';
import { getNextSongPlaybackPosition, useSongStore } from '../store/songStore';

export function useSongTransport() {
  const mode = useMusicStore(state => state.mode);
  const activeSongId = useSongStore(state => state.activeSongId);
  const activeSectionIndex = useSongStore(state => state.activeSectionIndex);
  const songs = useSongStore(state => state.songs);
  const isPlaying = useLooperStore(state => state.isPlaying);
  const autoAdvanceEnabled = useSongStore(state => state.autoAdvanceEnabled);

  useEffect(() => {
    if (mode !== 'Song') return;
    const song = songs.find(candidate => candidate.id === activeSongId);
    const section = song?.sections[activeSectionIndex];
    const bpm = section?.bpmOverride ?? song?.defaultBpm;
    if (bpm) useLooperStore.getState().setTransportState({ bpm });
  }, [mode, songs, activeSongId, activeSectionIndex]);

  useEffect(() => {
    if (mode !== 'Song' || !isPlaying || !autoAdvanceEnabled) return;

    const handleLoop = (time: number) => {
      const current = useSongStore.getState();
      const song = current.songs.find(candidate => candidate.id === current.activeSongId);
      if (!song) return;
      const next = getNextSongPlaybackPosition(song, current.activeSectionIndex, current.activeSectionRepeat);
      if (next.completed) {
        Tone.Transport.stop(time);
      } else {
        const nextSection = song.sections[next.sectionIndex];
        const nextBpm = nextSection?.bpmOverride ?? song.defaultBpm;
        if (nextBpm) Tone.Transport.bpm.setValueAtTime(nextBpm, time);
      }

      Tone.Draw.schedule(() => {
        const songState = useSongStore.getState();
        const advanced = songState.advanceSongCycle();
        if (!advanced) {
          useLooperStore.getState().setTransportState({
            isPlaying: false,
            isGlobalRecording: false,
          });
        }
      }, time);
    };

    Tone.Transport.on('loop', handleLoop);
    return () => {
      Tone.Transport.off('loop', handleLoop);
    };
  }, [mode, isPlaying, autoAdvanceEnabled]);
}
