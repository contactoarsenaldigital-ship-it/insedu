/* INSEDU · Service worker
 * - Shell offline: precarga de rutas principales y estáticos.
 * - Navegación: red primero, caché como respaldo, página offline al final.
 * - Las llamadas a /api nunca se cachean (datos personales y registro oficial).
 * - La cola de escaneos vive en IndexedDB y la sincroniza la página (iOS no soporta Background Sync).
 */
const VERSION = "insedu-v1";
const SHELL = ["/", "/escanear", "/offline", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // nunca en caché

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (SHELL.includes(url.pathname)) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(event.request)) || (await caches.match("/offline"))),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".svg")) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(event.request, copy));
            return res;
          }),
      ),
    );
  }
});
