import { useRef, useState, useEffect } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';
import { WakandanSelect } from './WakandanSelect';

export function CameraFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  
  const { isReady, error } = useHandTracking(videoRef, selectedDeviceId);

  const refreshDevices = () => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then((stream) => {
        navigator.mediaDevices.enumerateDevices().then((deviceInfos) => {
          const videoDevices = deviceInfos.filter(d => d.kind === 'videoinput');
          setDevices(videoDevices);
          if (videoDevices.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(videoDevices[0].deviceId);
          }
        });
        stream.getTracks().forEach(track => track.stop());
      })
      .catch(err => console.error("Error enumerating cameras:", err));
  };

  useEffect(() => {
    refreshDevices();
  }, []);

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
        style={{ transform: 'scaleX(-1)' }}
        playsInline
        muted
      />

      {/* Minimal Wakandan Camera Selector */}
      {devices.length > 0 && (
        <div className="absolute bottom-4 right-6 z-20 pointer-events-auto flex items-center gap-2 opacity-50 hover:opacity-100 transition-all duration-500 group">
          
          <button 
            onClick={refreshDevices}
            className="relative w-7 h-7 flex items-center justify-center text-[var(--color-primary-glow)] hover:text-white transition-all overflow-hidden border border-transparent hover:border-[var(--color-primary-glow)]/50 hover:shadow-[0_0_10px_var(--color-primary-glow)]"
            style={{ clipPath: 'polygon(25% 0%, 100% 0, 100% 75%, 75% 100%, 0 100%, 0% 25%)' }}
            title="Refresh Cameras"
          >
            <div className="absolute inset-0 bg-[var(--color-primary)]/10 group-hover:bg-[var(--color-primary)]/30 transition-colors z-0" />
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 active:rotate-180 transition-transform duration-500">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.59-9.21l5.67-4.24" />
            </svg>
          </button>
          
          <WakandanSelect
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="text-[9px] tracking-[0.25em] max-w-[180px]"
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId} className="bg-[#070912] tracking-normal">
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </WakandanSelect>
        </div>
      )}
    </div>
  );
}
