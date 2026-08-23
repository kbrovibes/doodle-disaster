// Minimal service worker: makes the app installable. The game is realtime,
// so everything goes straight to the network — no offline caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
