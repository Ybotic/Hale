/* Public static fallback only. NEVER cache authenticated pages, API traffic, audio, or tokens. */
const CACHE = "mnemo-patient-public-v1";
const PUBLIC_ASSETS = ["/patient/offline-v1.html", "/patient/icon-192.png", "/patient/icon-512.png", "/patient/apple-touch-icon.png", "/patient/icon-maskable-512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)));
  // No skipWaiting: do not activate an update over an ongoing recording.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("mnemo-patient-public-") && key !== CACHE).map((key) => caches.delete(key)))));
  // No clients.claim and no controllerchange reload.
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (PUBLIC_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(url.pathname)) || fetch(event.request)));
    return;
  }
  if (event.request.mode === "navigate" && url.pathname.startsWith("/patient/")) {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match("/patient/offline-v1.html")) || new Response("Reconnect to open Mnemo.", { status: 503 })));
  }
});
