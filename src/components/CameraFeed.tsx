import { useRef, useState, useEffect, useCallback } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';
import { WakandanSelect } from './WakandanSelect';
import { TrackingSettingsPanel } from './TrackingSettingsPanel';
import { useTrackingSettingsStore } from '../store/trackingSettings';

export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const mirrorCamera = useTrackingSettingsStore((state) => state.mirrorCamera);
  const isPanelOpen = useTrackingSettingsStore((state) => state.isPanelOpen);
  const setPanelOpen = useTrackingSettingsStore((state) => state.setPanelOpen);
  
  const { isReady, error } = useHandTracking(videoRef, selectedDeviceId);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const deviceInfos = await navigator.mediaDevices.enumerateDevices();
      setDevices(deviceInfos.filter(device => device.kind === 'videoinput'));
    } catch (err) {
      console.error('Error enumerating cameras:', err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-black flex items-center justify-center">
      {!isReady && !error && (
        <div className="absolute z-10 text-[var(--color-primary-glow)] animate-pulse tracking-widest uppercase">
          Initializing Tracking Core...
        </div>
      )}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-red-500 text-xs font-bold bg-black/80 px-4 py-2 rounded tracking-widest uppercase shadow-[0_0_10px_red]">
          {error}
        </div>
      )}
      <video
        ref={videoRef}
        className="w-full h-full object-cover brightness-[0.65] hue-rotate-[220deg] saturate-[1.2]"
        style={{ transform: mirrorCamera ? 'scaleX(-1)' : undefined }}
        playsInline
        muted
        onLoadedData={refreshDevices}
      />

      <TrackingSettingsPanel />

      {/* Minimal camera and tracking controls */}
      <div className="kasync-camera-controls absolute bottom-4 right-6 z-50 pointer-events-auto flex items-center gap-2 opacity-60 hover:opacity-100 focus-within:opacity-100 transition-all duration-500 group">
        <button
          type="button"
          onClick={() => setPanelOpen(!isPanelOpen)}
          aria-label="Open hand tracking settings"
          aria-expanded={isPanelOpen}
          className="border border-[var(--color-secondary)]/30 px-2 py-1 font-display font-bold text-[9px] uppercase tracking-widest text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10"
          style={{ fontSize: '9px' }}
          title="Hand Tracking Settings"
        >
          Track
        </button>

        {devices.length > 0 && (
          <>
          
          <button 
            onClick={refreshDevices}
            className="relative w-4 h-4 flex items-center justify-center text-[var(--color-primary-glow)] hover:text-white transition-all overflow-hidden border border-transparent hover:border-[var(--color-primary-glow)]/50 hover:shadow-[0_0_10px_var(--color-primary-glow)]"
            style={{ clipPath: 'polygon(25% 0%, 100% 0, 100% 75%, 75% 100%, 0 100%, 0% 25%)' }}
            title="Refresh Cameras"
          >
            <div className="absolute inset-0 bg-[var(--color-primary)]/10 group-hover:bg-[var(--color-primary)]/30 transition-colors z-0" />
            <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 active:rotate-180 transition-transform duration-500">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-4.24" />
            </svg>
          </button>
          
          <WakandanSelect
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="text-[9px] tracking-[0.25em] max-w-[180px]"
          >
            <option value="" className="bg-[#070912] tracking-normal">
              Default Camera
            </option>
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId} className="bg-[#070912] tracking-normal">
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </WakandanSelect>
          </>
        )}
      </div>
    </div>
  );
}
