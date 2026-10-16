import { create } from 'zustand';
import type { HandData } from './handState';

export const volumeHandId = (hand: HandData) => hand.handedness === 'Unknown'
  ? hand.screenRole ?? hand.handedness : hand.handedness;
export const useVolumeGestureStore = create<{ owner: string | null; effectOwner: string | null }>(() => ({ owner: null, effectOwner: null }));
// Both performance controls reserve their hand from note, FX-selection and swipe actions.
export const isVolumeHand = (hand: HandData) => {
  const state = useVolumeGestureStore.getState();
  return state.owner === volumeHandId(hand) || state.effectOwner === volumeHandId(hand);
};
