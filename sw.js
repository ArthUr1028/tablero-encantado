const CACHE_VERSION = "v10";
const CACHE = "tablero-" + CACHE_VERSION;
const NET_TIMEOUT_MS = 4000;

const CORE = ["index.html", "supabase.js"];
const NTF_ICONOS = ["caballo", "rey", "dama", "torre", "alfil", "peon", "arzobispo", "canciller", "amazona", "halcon", "elefante",
  "shatranj-baydaq", "shatranj-faras", "shatranj-fil", "shatranj-rukh", "shatranj-ferz", "shatranj-shah"].map((n) => "ntf-" + n + ".png");
const OPTIONAL = ["fairy-stockfish-engine.js", "fairy-stockfish-engine.wasm", "stockfish-19-lite-single.wasm", "icono-192.png", "icono-insignia.png", ...NTF_ICONOS];
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

  // version.json lo consulta la página para saber si hay versión nueva: siempre directo a la red.
  if (url.origin === self.location.origin && url.pathname.endsWith("/version.json")) return;

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
      if (res.ok) {
        // La copia nueva debe terminar de guardarse aunque ya se haya servido la vieja (index.html pesa varios MB):
        // sin esto el navegador podía apagar el service worker a medias y la copia vieja se quedaba para siempre.
        event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
        return res;
      }
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

// ---- Notificaciones push (2.200) ----
// El servidor manda {title, body, url, tag}. `userVisibleOnly`: toda notificación push debe mostrarse. La misma etiqueta (turno-<partida>)
// que usa el aviso local de la página hace que, si llegan las dos, se reemplacen en vez de duplicarse.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "El Tablero Encantado", {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    icon: NTF_ICONOS[Math.floor(Math.random() * NTF_ICONOS.length)],   // una pieza del Tablero al azar en cada aviso (están guardadas para verse también sin red)
    badge: "icono-insignia.png",
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rel = String((event.notification.data && event.notification.data.url) || "/").replace(/^\//, "");
  const target = new URL(rel, self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try { await c.focus(); c.postMessage({ tipo: "abrir", url: target }); return; } catch (e) {}
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
