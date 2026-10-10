import { toast } from '../store/toastStore';

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      if (registration.waiting) {
        toast.info('An update is ready. Restart Kasync.x when your session is saved.', 7000);
      }
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            toast.info('Update downloaded. Export or save your project, then restart Kasync.x.', 7000);
          }
        });
      });
    }).catch(error => {
      console.warn('Offline support could not be enabled:', error);
    });
  }, { once: true });
}
