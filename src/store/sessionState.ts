import { create } from 'zustand';

export type SessionSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SessionUiState {
  isPanelOpen: boolean;
  status: SessionSaveStatus;
  lastSavedAt: number | null;
  projectName: string;
  setPanelOpen: (open: boolean) => void;
  setSaveStatus: (status: SessionSaveStatus, savedAt?: number) => void;
  setProjectName: (name: string) => void;
}

export const useSessionStore = create<SessionUiState>((set) => ({
  isPanelOpen: false,
  status: 'idle',
  lastSavedAt: null,
  projectName: 'Untitled Session',
  setPanelOpen: (open) => set({ isPanelOpen: open }),
  setSaveStatus: (status, savedAt) => set(state => ({
    status,
    lastSavedAt: savedAt ?? state.lastSavedAt,
  })),
  setProjectName: (projectName) => set({ projectName }),
}));
