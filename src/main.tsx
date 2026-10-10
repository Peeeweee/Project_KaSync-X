import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { restoreAutosave, startSessionPersistence } from './session/sessionManager';
import { registerServiceWorker } from './pwa/registerServiceWorker';

restoreAutosave();
const stopSessionPersistence = startSessionPersistence();
registerServiceWorker();

// StrictMode removed: it double-invokes effects in dev which causes
// NotReadableError on the webcam (device briefly in use during cleanup/remount)
createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.hot) {
  import.meta.hot.dispose(stopSessionPersistence);
}
