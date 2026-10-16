import { create } from 'zustand';

// Separate from the boolean effect switches, so existing track/session formats stay valid.
export const useEffectDialStore = create<{ level: number; settledLevel: number }>(() => ({ level: 0.5, settledLevel: 0.5 }));
export function effectDialSettings() {
  const { level, settledLevel } = useEffectDialStore.getState();
  return { amount: level * 2, decay: 0.3 + settledLevel * 3.4, feedback: 0.1 + settledLevel * 0.5 };
}
