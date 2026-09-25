import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType, durationMs?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (message, type = 'info', durationMs = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Convenience helper for non-React code (looper, exporters, etc.) */
export const toast = {
  info:    (msg: string, ms?: number) => useToastStore.getState().addToast(msg, 'info',    ms),
  success: (msg: string, ms?: number) => useToastStore.getState().addToast(msg, 'success', ms),
  error:   (msg: string, ms?: number) => useToastStore.getState().addToast(msg, 'error',   ms),
  warning: (msg: string, ms?: number) => useToastStore.getState().addToast(msg, 'warning', ms),
};
