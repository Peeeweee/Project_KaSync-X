import { useMusicStore } from '../store/musicState';
import { useSongStore } from '../store/songStore';
import { formatChordName } from '../music/enharmonics';

/** Shared selection spelling for the central core and the performance strip. */
export function useSelectedChord() {
  const mode = useMusicStore(s => s.mode);
  const root = useMusicStore(s => s.hoveredRoot);
  const quality = useMusicStore(s => s.hoveredQuality);
  const bass = useMusicStore(s => s.hoveredBass);
  const currentKey = useMusicStore(s => s.currentKey);
  const songKey = useSongStore(s => {
    const song = s.songs.find(song => song.id === s.activeSongId);
    return song?.sections[s.activeSectionIndex]?.key ?? song?.defaultKey;
  });
  return root ? formatChordName(root, mode === 'Melody' ? '' : quality || 'maj', bass,
    mode === 'Song' ? songKey ?? currentKey : currentKey) : null;
}
