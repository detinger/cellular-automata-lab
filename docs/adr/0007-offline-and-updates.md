# ADR 0007: Offline caching and controlled updates

**Status:** accepted (2026-11-10)

## Decision

- A hand-written service worker (`public/sw.js`, no Workbox dependency) precaches the files listed in `precache.json`, which a small Vite plugin writes at build time with a content-derived build ID.
- Navigations are network-first (so deployments are seen) with the cached app shell as the offline fallback; hashed assets are cache-first.
- User data stays in IndexedDB; the service worker never caches or deletes it.
- A new version installs in the background and **waits**. The app shows a banner; the user reloads when their simulations are paused and saved. Only then does the page send `SKIP_WAITING`.

## Consequences

Offline use needs one online visit in a secure context (HTTPS or localhost). The dev server does not register the service worker.
