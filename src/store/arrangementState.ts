import { create } from 'zustand';

interface ArrangementState {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

export const useArrangementStore = create<ArrangementState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set(state => ({ isOpen: !state.isOpen })),
}));
