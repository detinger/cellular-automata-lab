// Service worker registration and controlled updates. Production builds only.
import { useEffect, useState } from 'react';

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const track = (w: ServiceWorker | null) => {
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = w;
              notify();
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          notify();
        }
        reg.addEventListener('updatefound', () => track(reg.installing));
      })
      .catch(() => {
        /* offline support is optional; the app works without it */
      });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading && waiting) {
        reloading = true;
        location.reload();
      }
    });
  });
}

/** True when a new app version is installed and waiting for the user to reload. */
export function useUpdateAvailable() {
  const [ready, setReady] = useState(!!waiting);
  useEffect(() => {
    const f = () => setReady(!!waiting);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return { ready, apply: () => waiting?.postMessage('SKIP_WAITING') };
}
