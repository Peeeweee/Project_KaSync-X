import { create } from 'zustand';
import { EMPTY_TRACKING_METRICS, type TrackingMetricsSnapshot } from '../tracking/trackingMetrics';
import type { TrackingBackend } from '../tracking/workerProtocol';

export type TrackingQuality = 'auto' | 'audio' | 'performance' | 'balanced' | 'quality';

export interface TrackingPreferences {
  trackingEngine: 'compatible' | 'worker';
  quality: TrackingQuality;
  smoothingAlpha: number;
  pinchThreshold: number;
  pinchReleaseThreshold: number;
  mirrorCamera: boolean;
  showHandOverlay: boolean;
}

interface TrackingSettingsState extends TrackingPreferences, TrackingMetricsSnapshot {
  restartGeneration: number;
  restartTracking: () => void;
  isPanelOpen: boolean;
  isLowPerformance: boolean;
  backend: TrackingBackend | null;
  targetFps: number;
  inferenceLatencyMs: number | null;
  fallbackReason: string | null;
  inferenceWidth: number | null;
  inferenceHeight: number | null;
  setPreference: <K extends keyof TrackingPreferences>(key: K, value: TrackingPreferences[K]) => void;
  setPreferences: (partial: Partial<TrackingPreferences>) => void;
  setPanelOpen: (open: boolean) => void;
  setLowPerformance: (low: boolean) => void;
  setRuntime: (runtime: Partial<Pick<TrackingSettingsState, 'backend' | 'targetFps' | 'inferenceLatencyMs' | 'fallbackReason' | 'inferenceWidth' | 'inferenceHeight'> & TrackingMetricsSnapshot>) => void;
  resetPreferences: () => void;
}

const STORAGE_KEY = 'kasync-tracking-v1';

export const DEFAULT_TRACKING_PREFERENCES: TrackingPreferences = {
  trackingEngine: 'compatible',
  quality: 'auto',
  smoothingAlpha: 0.72,
  pinchThreshold: 0.32,
  pinchReleaseThreshold: 0.44,
  mirrorCamera: true,
  showHandOverlay: true,
};

function loadPreferences(): TrackingPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TRACKING_PREFERENCES;
    return { ...DEFAULT_TRACKING_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_TRACKING_PREFERENCES;
  }
}

function persistPreferences(preferences: TrackingPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Persistence is optional in private browsing or quota-constrained sessions.
  }
}

function selectPreferences(state: TrackingSettingsState): TrackingPreferences {
  return {
    trackingEngine: state.trackingEngine,
    quality: state.quality,
    smoothingAlpha: state.smoothingAlpha,
    pinchThreshold: state.pinchThreshold,
    pinchReleaseThreshold: state.pinchReleaseThreshold,
    mirrorCamera: state.mirrorCamera,
    showHandOverlay: state.showHandOverlay,
  };
}

export function getTargetInferenceFps(quality: TrackingQuality, lowPerformance: boolean): number {
  if (lowPerformance) return 18;
  switch (quality) {
    case 'audio': return 36;
    case 'performance': return 24;
    case 'quality': return 30;
    case 'balanced':
    case 'auto':
    default: return 30;
  }
}

export const useTrackingSettingsStore = create<TrackingSettingsState>((set, get) => ({
  ...loadPreferences(),
  ...EMPTY_TRACKING_METRICS,
  restartGeneration: 0,
  restartTracking: () => set(state => ({ restartGeneration: state.restartGeneration + 1 })),
  isPanelOpen: false,
  isLowPerformance: false,
  backend: null,
  targetFps: 30,
  inferenceLatencyMs: null,
  fallbackReason: null,
  inferenceWidth: null,
  inferenceHeight: null,

  setPreference: (key, value) => {
    set({ [key]: value } as Pick<TrackingSettingsState, typeof key>);
    persistPreferences(selectPreferences(get()));
  },
  setPreferences: (partial) => {
    set(partial);
    persistPreferences(selectPreferences(get()));
  },
  setPanelOpen: (open) => set({ isPanelOpen: open }),
  setLowPerformance: (low) => set({ isLowPerformance: low }),
  setRuntime: (runtime) => set(runtime),
  resetPreferences: () => {
    set(DEFAULT_TRACKING_PREFERENCES);
    persistPreferences(DEFAULT_TRACKING_PREFERENCES);
  },
}));
