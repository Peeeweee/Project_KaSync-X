import { useHandStore, type HandData } from '../store/handState';
import { useMusicStore, type InstrumentMode } from '../store/musicState';
import { useVolumeGestureStore, volumeHandId } from '../store/volumeGesture';
import { useLiveNoteReleaseStore } from '../diagnostics/liveNoteRelease';
import { getScreenHands } from '../tracking/handUtils';
import { useHandRecoveryStore } from '../store/handRecovery';

export function performanceGesture(hands: HandData[], mode: InstrumentMode, volume: string | null, effects: string | null) {
  if (!hands.length) return 'missing';
  const {leftHand,rightHand} = getScreenHands(hands);
  const hand = mode === 'Melody' ? leftHand ?? rightHand ?? hands[0]
    : leftHand ?? (hands.length === 1 ? hands[0] : undefined);
  if (!hand) return 'note-hand-missing';
  const id = volumeHandId(hand);
  if (id === volume) return 'volume';
  if (id === effects) return 'effects';
  if (hand.isPinching) return hand.isKeyDown === false ? 'cut' : 'pinch';
  return hand.isPointPressed ? 'tap' : 'open';
}

export function usePerformanceFeedback() {
  const mode = useMusicStore(s => s.mode);
  const playing = useMusicStore(s => s.playingNotes.length > 0);
  const selected = useMusicStore(s => !!s.hoveredRoot);
  const volume = useVolumeGestureStore(s => s.owner);
  const effects = useVolumeGestureStore(s => s.effectOwner);
  // Subscribe to a primitive phase, not landmarks: a steady pose never renders
  // this feedback again just because another camera frame completed.
  const phase = useHandStore(s => performanceGesture(s.smoothedHands,mode,volume,effects));
  const lost = useLiveNoteReleaseStore(s => s.lastRelease?.reason === 'hand-lost');
  const recovering = useHandRecoveryStore(s => s.active);
  if (recovering) return {state:'recovering',label:'FINDING HAND',hint:'Return hand to camera',connected:false};
  if (phase === 'missing' || phase === 'note-hand-missing') {
    if (playing || lost || phase === 'note-hand-missing') return {
      state:'recovering', label:playing ? 'FINDING HAND' : 'HAND LOST',
      hint:phase === 'note-hand-missing' ? 'Show hand at note ring' : 'Return hand to camera', connected:false,
    };
    return {state:'ready',label:'READY',hint:'Show a hand to begin',connected:false};
  }
  if (phase === 'volume' || phase === 'effects') return {
    state:'control',label:phase === 'volume' ? 'VOLUME CONTROL' : 'EFFECT CONTROL',
    hint:'Turn wrist to adjust',connected:false,
  };
  if (phase === 'cut') return {state:'cut',label:'CUT HELD',hint:'Lift fingers to resume',connected:true};
  if (playing) return {state:'playing',label:'PLAYING',hint:phase === 'pinch' ? 'Fingers down to cut' : 'Lift to release',connected:phase === 'pinch'};
  if (phase === 'pinch') return {state:'connected',label:'PINCH CONNECTED',hint:selected ? 'Ready to play' : 'Move over a note',connected:true};
  return {state:'ready',label:'HAND FOUND',hint:selected ? 'Pinch to play' : 'Select a note · pinch to play',connected:false};
}
