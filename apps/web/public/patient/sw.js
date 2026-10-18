/* Public static fallback only. NEVER cache authenticated pages, API traffic, audio, or tokens. */
const CACHE = "hale-patient-public-v5";
const PUBLIC_ASSETS = ["/patient/offline-v1.html", "/patient/manifest.webmanifest", "/patient/icon-192.png", "/patient/icon-512.png", "/patient/apple-touch-icon.png", "/patient/icon-maskable-512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PUBLIC_ASSETS)));
  // No skipWaiting: do not activate an update over an ongoing recording.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.includes("-patient-public-") && key !== CACHE).map((key) => caches.delete(key)))));
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
    event.respondWith(fetch(event.request).catch(async () => (await caches.match("/patient/offline-v1.html")) || new Response("Reconnect to open Hale.", { status: 503 })));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "A care reminder is due." }; }
  event.waitUntil(self.registration.showNotification(payload.title || "Hale reminder", {
    body: payload.body || "Open Hale to review your saved reminder.",
    icon: "/patient/icon-192.png",
    badge: "/patient/icon-192.png",
    tag: payload.tag || "hale-care-reminder",
    data: { url: typeof payload.url === "string" && (/^\/patient\//.test(payload.url) || /^\/family\//.test(payload.url)) ? payload.url : "/patient/today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/patient/today";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => "focus" in client && (new URL(client.url).pathname.startsWith("/patient/") || new URL(client.url).pathname.startsWith("/family/")));
    if (existing) return existing.navigate(path).then((client) => client?.focus());
    return self.clients.openWindow(path);
  }));
});
