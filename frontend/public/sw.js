/*
 * Minimal service worker for installability.
 *
 * Fetch events intentionally fall through to the network; Chisos is
 * authenticated and user-specific, so a broad cache-first strategy would risk
 * serving one account's shell to another or stale data after a deploy.
 */
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // Network passthrough.
})
