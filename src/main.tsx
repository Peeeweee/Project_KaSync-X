import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// StrictMode removed: it double-invokes effects in dev which causes
// NotReadableError on the webcam (device briefly in use during cleanup/remount)
createRoot(document.getElementById('root')!).render(<App />);
