import { useToastStore } from '../store/toastStore';
import type { ToastType } from '../store/toastStore';

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; glow: string; icon: string }> = {
  info:    { bg: 'rgba(0,240,255,0.08)',    border: 'rgba(0,240,255,0.3)',    glow: '#00f0ff', icon: 'ℹ' },
  success: { bg: 'rgba(0,240,180,0.08)',    border: 'rgba(0,240,180,0.3)',    glow: '#00f0b4', icon: '✓' },
  warning: { bg: 'rgba(249,168,38,0.08)',   border: 'rgba(249,168,38,0.3)',   glow: '#F9A826', icon: '⚠' },
  error:   { bg: 'rgba(255,77,77,0.10)',    border: 'rgba(255,77,77,0.4)',    glow: '#ff4d4d', icon: '✕' },
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => {
        const c = TOAST_COLORS[t.type];
        return (
          <div
            key={t.id}
            className="pointer-events-auto toast-enter flex items-center gap-3 px-4 py-2.5 rounded-full max-w-sm"
            style={{
              background: c.bg,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${c.border}`,
              boxShadow: `0 0 20px rgba(0,0,0,0.5), 0 0 8px ${c.glow}33`,
            }}
            onClick={() => removeToast(t.id)}
          >
            <span
              className="text-[11px] font-bold w-4 text-center shrink-0"
              style={{ color: c.glow, textShadow: `0 0 8px ${c.glow}` }}
            >
              {c.icon}
            </span>
            <span className="text-[11px] text-white/90 font-medium tracking-wide">
              {t.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
