// @ts-nocheck
// send-push · Edge Function de Supabase (2.200). La llama SOLO la base de datos (push_notify, vía pg_net) con una contraseña compartida:
// recibe {user_id, title, body, url, tag}, busca los dispositivos suscritos de esa persona y manda el Web Push. Borra las suscripciones muertas (404/410).
// Variables (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), PUSH_SECRET. SUPABASE_URL y la llave de servicio ya vienen puestas.
// Aquí NO hay lógica de ajedrez ni secretos: los textos ya vienen decididos (y sin información oculta de Dark Chess) desde 27_push.sql.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

function sameSecret(a, b){   // comparación en tiempo constante
  a = String(a || ""); b = String(b || "");
  if(a.length !== b.length || !a) return false;
  let d = 0; for(let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function sendPush(db, wp, env, headers, body){
  if(!sameSecret(headers["x-push-secret"], env.PUSH_SECRET)) return { status: 401, body: { error: "No autorizado." } };
  if(!body || !UUID.test(String(body.user_id || ""))) return { status: 400, body: { error: "Falta la persona." } };
  const url = String(body.url || "/");
  if(url[0] !== "/" || url.startsWith("//")) return { status: 400, body: { error: "Enlace inválido." } };
  const payload = JSON.stringify({ title: clip(body.title, 120), body: clip(body.body, 300), url, tag: clip(body.tag, 100) });
  const subs = await db.subscriptionsOf(body.user_id);
  let sent = 0, removed = 0, failed = 0;
  for(const s of subs){
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "normal" });
      sent++;
    } catch(e){
      if(e && (e.statusCode === 404 || e.statusCode === 410)){ await db.deleteSubscription(s.endpoint); removed++; }   // el aparato ya no existe
      else failed++;
    }
  }
  return { status: 200, body: { sent, removed, failed } };
}

if(typeof Deno !== "undefined" && Deno.serve){
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const webpush = (await import("npm:web-push@3.6.7")).default;
  const env = { PUSH_SECRET: Deno.env.get("PUSH_SECRET") };
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC_KEY"), Deno.env.get("VAPID_PRIVATE_KEY"));
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try { const ks = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); key = ks.default || Object.values(ks)[0] || key; } catch(e){}
  const admin = createClient(Deno.env.get("SUPABASE_URL"), key, { auth: { persistSession: false } });
  const db = {
    async subscriptionsOf(uid){ const r = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", uid); if(r.error) throw new Error(r.error.message); return r.data || []; },
    async deleteSubscription(ep){ await admin.from("push_subscriptions").delete().eq("endpoint", ep); }
  };
  Deno.serve(async req => {
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if(req.method !== "POST") return reply(405, { error: "Usa POST." });
    let body; try { body = await req.json(); } catch(e){ return reply(400, { error: "Cuerpo inválido." }); }
    try {
      const hdr = { "x-push-secret": req.headers.get("x-push-secret") };
      const out = await sendPush(db, webpush, env, hdr, body);
      return reply(out.status, out.body);
    } catch(e){ return reply(500, { error: String(e && e.message || e) }); }
  });
}
