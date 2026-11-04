const CACHE_VERSION = "v11";
const CACHE = "tablero-" + CACHE_VERSION;
const NET_TIMEOUT_MS = 4000;

const CORE = ["index.html", "supabase.js"];
const NTF_ICONOS = ["caballo", "rey", "dama", "torre", "alfil", "peon", "arzobispo", "canciller", "amazona", "halcon", "elefante",
  "shatranj-baydaq", "shatranj-faras", "shatranj-fil", "shatranj-rukh", "shatranj-ferz", "shatranj-shah"].map((n) => "ntf-" + n + ".png");
const OPTIONAL = ["fairy-stockfish-engine.js", "fairy-stockfish-engine.wasm", "stockfish-19-lite-single.wasm", "icono-192.png", "icono-insignia.png", ...NTF_ICONOS];
// Insignia de la barra de estado (caballo blanco sobre transparente, 96 px) incrustada: Chrome la lee sin pedirla a la red,
// porque con el Tablero cerrado la carga por red a veces fallaba y Android mostraba un cuadrito genérico.
const INSIGNIA = "data:image/png;base64,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";
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
    badge: INSIGNIA,
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
