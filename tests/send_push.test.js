// send-push: contraseña, validación, envío por suscripción y limpieza de suscripciones muertas (sin red: el servicio de push es simulado).
const fs = require("fs"), path = require("path"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "supabase/functions/send-push/index.ts"), "utf8");
const cut = src.slice(0, src.indexOf('if(typeof Deno !== "undefined"'));
const { sendPush } = new Function(cut + "; return { sendPush };")();
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const U = "11111111-1111-1111-1111-111111111111", ENV = { PUSH_SECRET: "s3cr3to" }, H = { "x-push-secret": "s3cr3to" };
const mk = (subs, errs = {}) => {
  const log = { sent: [], borradas: [] };
  return { log,
    db: { subscriptionsOf: async () => subs, deleteSubscription: async ep => { log.borradas.push(ep); } },
    wp: { sendNotification: async (s, payload, opt) => { if(errs[s.endpoint]) throw Object.assign(new Error("x"), { statusCode: errs[s.endpoint] }); log.sent.push({ ep: s.endpoint, payload: JSON.parse(payload), opt }); } } };
};
(async () => {
  const subs = [{ endpoint: "https://p/1", p256dh: "a", auth: "b" }, { endpoint: "https://p/2", p256dh: "c", auth: "d" }];
  let m = mk(subs);
  let r = await sendPush(m.db, m.wp, ENV, {}, { user_id: U, title: "t", body: "b", url: "/?partida=1", tag: "x" });
  ok(r.status === 401 && m.log.sent.length === 0, "sin contraseña: 401 y no se envía nada");
  r = await sendPush(m.db, m.wp, ENV, { "x-push-secret": "otra" }, { user_id: U, title: "t", body: "b", url: "/" });
  ok(r.status === 401, "contraseña equivocada: 401");
  r = await sendPush(m.db, m.wp, { PUSH_SECRET: "" }, { "x-push-secret": "" }, { user_id: U, title: "t", body: "b", url: "/" });
  ok(r.status === 401, "si la función no tiene contraseña configurada, nunca autoriza (ni con una vacía)");
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: "no-es-uuid", title: "t", body: "b", url: "/" });
  ok(r.status === 400, "persona inválida: 400");
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "t", body: "b", url: "https://malo.example/" });
  ok(r.status === 400, "enlace externo rechazado");
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "t", body: "b", url: "//malo.example/" });
  ok(r.status === 400, "enlace «//» rechazado");
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "♞ Es tu turno", body: "Beto ha movido.", url: "/?partida=1", tag: "turno-1" });
  ok(r.status === 200 && r.body.sent === 2 && m.log.sent.length === 2, "envía a cada dispositivo suscrito");
  ok(m.log.sent[0].payload.title === "♞ Es tu turno" && m.log.sent[0].payload.url === "/?partida=1" && m.log.sent[0].payload.tag === "turno-1", "el contenido llega completo");
  ok(m.log.sent[0].opt.TTL === 86400, "caduca en 24 h si el aparato está apagado");
  m = mk(subs, { "https://p/2": 410 });
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "t", body: "b", url: "/" });
  ok(r.body.sent === 1 && r.body.removed === 1 && m.log.borradas[0] === "https://p/2", "suscripción muerta (410): se borra y se sigue con las demás");
  m = mk(subs, { "https://p/1": 500 });
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "t", body: "b", url: "/" });
  ok(r.body.failed === 1 && r.body.sent === 1 && m.log.borradas.length === 0, "fallo temporal (500): no se borra");
  m = mk(subs);
  await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "x".repeat(500), body: "y".repeat(900), url: "/" });
  ok(m.log.sent[0].payload.title.length === 120 && m.log.sent[0].payload.body.length === 300, "recorta títulos y textos largos");
  m = mk([]);
  r = await sendPush(m.db, m.wp, ENV, H, { user_id: U, title: "t", body: "b", url: "/" });
  ok(r.status === 200 && r.body.sent === 0, "sin dispositivos: 200 y 0 envíos");
  console.log(n + "/" + n + " pruebas pasan");
})().catch(e => { console.error("FALLA:", e.message); process.exit(1); });
