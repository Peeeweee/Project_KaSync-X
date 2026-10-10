import { useEffect, useRef, useState } from 'react';
import {
  applySession,
  downloadSession,
  parseSessionText,
  saveAutosave,
} from '../session/sessionManager';
import { useSessionStore } from '../store/sessionState';
import { toast } from '../store/toastStore';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function formatSavedTime(timestamp: number | null): string {
  if (!timestamp) return 'Not saved yet';
  return `Saved ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function SessionPanel() {
  const { isPanelOpen, setPanelOpen, status, lastSavedAt, projectName, setProjectName } = useSessionStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleExport = () => {
    if (saveAutosave()) {
      downloadSession();
      toast.success('Project file exported.');
    } else {
      toast.error('Could not save this project locally.');
    }
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const session = parseSessionText(await file.text());
      applySession(session);
      saveAutosave();
      toast.success(`Loaded “${session.meta.name}”.`);
      setPanelOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Session import failed.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') toast.success('Kasync.x installed.');
    setInstallPrompt(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(!isPanelOpen)}
        aria-label="Open project and session controls"
        aria-expanded={isPanelOpen}
        className="kasync-session-trigger absolute right-6 top-6 z-[39] rounded-l-full rounded-r-sm border border-[var(--color-secondary)]/30 bg-black/60 px-3 py-1 font-display font-bold text-[10px] uppercase tracking-widest text-[var(--color-secondary)] backdrop-blur-xl hover:bg-[var(--color-secondary)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        style={{ fontSize: '10px' }}
      >
        Project
      </button>

      {isPanelOpen && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-panel-title"
          className="kasync-session-panel absolute right-6 top-20 z-[100] w-[min(23rem,calc(100vw-2rem))] border border-[var(--color-secondary)]/35 bg-[#060710]/95 p-5 text-white shadow-[0_0_35px_rgba(0,240,255,0.18)] backdrop-blur-2xl"
          style={{ clipPath: 'polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px)' }}
        >
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h2 id="session-panel-title" className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-secondary)]">Project Core</h2>
              <p className="mt-1 text-[9px] tracking-wide text-white/45">Autosave · portable project files · offline ready</p>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close project controls" className="px-2 text-lg text-white/50 hover:text-white">×</button>
          </div>

          <label className="block text-[9px] uppercase tracking-[0.18em] text-white/55">
            Project name
            <input
              value={projectName}
              maxLength={100}
              onChange={event => setProjectName(event.target.value)}
              onBlur={() => { if (!projectName.trim()) setProjectName('Untitled Session'); }}
              className="mt-2 w-full border border-white/10 bg-black/40 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-[var(--color-secondary)]/60"
            />
          </label>

          <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-wider">
            <span className={status === 'error' ? 'text-red-400' : status === 'saving' ? 'text-[var(--color-highlight)]' : 'text-white/45'} aria-live="polite">
              {status === 'saving' ? 'Saving…' : status === 'error' ? 'Autosave unavailable' : formatSavedTime(lastSavedAt)}
            </span>
            <span className={isOnline ? 'text-[var(--color-secondary)]/60' : 'text-[var(--color-highlight)]'}>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={handleExport} className="border border-[var(--color-primary)]/50 px-3 py-2 text-[9px] uppercase tracking-wider text-[var(--color-primary-glow)] hover:bg-[var(--color-primary)]/15">Export Project</button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="border border-white/15 px-3 py-2 text-[9px] uppercase tracking-wider text-white/70 hover:border-[var(--color-secondary)]/60 hover:text-white">Import Project</button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.kasync.json,application/json"
              className="hidden"
              onChange={event => void handleImport(event.target.files?.[0])}
            />
          </div>

          {installPrompt && (
            <button type="button" onClick={() => void handleInstall()} className="mt-2 w-full border border-[var(--color-secondary)]/30 px-3 py-2 text-[9px] uppercase tracking-wider text-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/10">
              Install Kasync.x Offline
            </button>
          )}

          <div className="mt-5 border-t border-white/10 pt-4">
            <h3 className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">Keyboard</h3>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[9px] text-white/45">
              <dt className="font-mono text-white/75">Space</dt><dd>Play / stop</dd>
              <dt className="font-mono text-white/75">R</dt><dd>Record / cancel count-in</dd>
              <dt className="font-mono text-white/75">M</dt><dd>Toggle metronome</dd>
              <dt className="font-mono text-white/75">Ctrl Z / Y</dt><dd>Undo / redo armed track</dd>
              <dt className="font-mono text-white/75">1–4</dt><dd>Select instrument</dd>
            </dl>
          </div>
        </section>
      )}
    </>
  );
}
