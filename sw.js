const CACHE_VERSION = "v3";
const CACHE = "tablero-" + CACHE_VERSION;
const NET_TIMEOUT_MS = 4000;

const CORE = ["index.html", "supabase.js"];
const OPTIONAL = ["fairy-stockfish-engine.js", "fairy-stockfish-engine.wasm", "stockfish-19-lite-single.wasm"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map((u) => new Request(u, { cache: "reload" })));
    await Promise.all(OPTIONAL.map((u) =>
      cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith("tablero-") && k !== CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    const key = req.mode === "navigate"
      ? new Request(new URL("index.html", self.registration.scope).href)
      : req;
    event.respondWith(networkFirst(event, req, key));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(event, req));
  }
});

async function networkFirst(event, req, key) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key, { ignoreSearch: true });

  const net = fetch(new Request(req.url, { cache: "no-cache", credentials: "same-origin" }))
    .then((res) => {
      if (res.ok) { cache.put(key, res.clone()); return res; }
      return cached || res;
    });

  if (!cached) return net;
  event.waitUntil(net.catch(() => {}));

  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NET_TIMEOUT_MS));
  try {
    return await Promise.race([net, timeout]);
  } catch (e) {
    return cached;
  }
}

async function staleWhileRevalidate(event, req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  });
  if (cached) { event.waitUntil(net.catch(() => {})); return cached; }
  return net;
}
