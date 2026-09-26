/*
 * QuickFix AI service worker.
 *
 * SECURITY (build prompt #55): cache ONLY static app-shell assets. Never
 * cache API responses, auth traffic, AI results, or anything private. All
 * Convex/auth traffic is network-only and pass-through.
 */

const VERSION = "v8";
const APP_SHELL_CACHE = `quickfix-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

// Static assets safe to cache (public, non-private, fingerprinted or static).
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/",
  "/manifest.webmanifest",
  "/logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      // Pre-cache the app shell + PWA icons eagerly (icons must be cached
      // before the install prompt criteria are evaluated).
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Clean old caches, then take control.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== APP_SHELL_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Support the in-app "Refresh" action when a new version is waiting
// (see useServiceWorkerRegistration in src/hooks/use-pwa.ts).
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // never touch non-GETs

  const url = new URL(request.url);

  // 1) Network-only for anything private or dynamic:
  //    - Convex API/WebSocket traffic
  //    - any path under /api/
  const isConvex = url.hostname.endsWith(".convex.cloud") || url.hostname.endsWith(".convex.site");
  const isApi = url.pathname.startsWith("/api/");
  if (isConvex || isApi) {
    return; // pass through — no cache, no fallback
  }

  // 2) Navigation requests: network first, offline page fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(APP_SHELL_CACHE);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // 3) Same-origin static assets: stale-while-revalidate.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === "basic") {
              cache.put(request, response.clone());
            }
            return response;
          })
          .catch(() => undefined);
        return cached || (await network) || new Response("", { status: 504 });
      })(),
    );
  }
});
