import { create } from 'zustand';

/** Semantic feedback only; no hand positions or camera-frame subscriptions. */
export const useHandRecoveryStore = create<{ active: boolean }>(() => ({ active: false }));
