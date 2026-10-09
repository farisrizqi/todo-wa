/* Cloudflare Worker: jembatan Todo App -> GOWA (HP Realme, setup belakangan)
 * Env vars (di wrangler.toml / dashboard):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, GOWA_URL, GOWA_API_KEY, TARGET_PHONE, REMINDER_OFFSET_MIN=3
 */

function fmtDate(iso) {
  if (!iso) return "tanpa deadline";
  return new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function sendWA(env, text) {
  if (!env.GOWA_URL) return { skipped: true, reason: "GOWA_URL belum diset (HP belum setup)" };
  const url = env.GOWA_URL.replace(/\/$/, "") + "/send-message";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(env.GOWA_API_KEY ? { "X-Api-Key": env.GOWA_API_KEY } : {}) },
    // Sesuaikan field dengan versi GOWA kamu (umumnya phone/message atau jid/text).
    // Versi aldinokemal: { phone, message } atau endpoint /api/sendText.
    body: JSON.stringify({ phone: env.TARGET_PHONE, message: text }),
  });
  const body = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
}

async function handleNotify(req, env) {
  const { type, todo } = await req.json().catch(() => ({}));
  if (!todo) return Response.json({ error: "todo kosong" }, { status: 400 });
  const text = type === "done"
    ? `✅ Selesai: ${todo.title}`
    : `⏰ Reminder: ${todo.title} (${fmtDate(todo.due_at)})`;
  const r = await sendWA(env, text);
  return Response.json({ sent: r.ok ?? false, ...r });
}

// Dipanggil cron-job.org tiap 1 menit: GET /check-reminders
async function handleCheck(env) {
  const offsetMin = Number(env.REMINDER_OFFSET_MIN || 3);
  const dueBefore = new Date(Date.now() + offsetMin * 60 * 1000).toISOString();
  // Ambil todo yang belum done, belum reminded, dan deadline <= now+offset
  const q = `${env.SUPABASE_URL}/rest/v1/todos?select=id,title,due_at&done=eq.false&reminded=eq.false&due_at=lte.${encodeURIComponent(dueBefore)}&order=due_at.asc&limit=20`;
  const listRes = await fetch(q, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!listRes.ok) return Response.json({ error: "gagal query supabase", status: listRes.status }, { status: 500 });
  const items = await listRes.json();
  const results = [];
  for (const t of items) {
    const r = await sendWA(env, `⏰ Reminder: ${t.title} (${fmtDate(t.due_at)})`);
    // Tandai reminded=true biar tidak dikirim dobel, walau GOWA lagi mati tetap tandai + catat
    await fetch(`${env.SUPABASE_URL}/rest/v1/todos?id=eq.${t.id}`, {
      method: "PATCH",
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reminded: true }),
    });
    results.push({ id: t.id, ...r });
  }
  return Response.json({ checked: items.length, offsetMin, results });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/notify") return handleNotify(req, env);
    if (req.method === "GET" && url.pathname === "/check-reminders") return handleCheck(env);
    if (req.method === "GET" && url.pathname === "/health") return Response.json({ ok: true, gowa: !!env.GOWA_URL });
    return new Response("Todo WA Bridge: POST /notify | GET /check-reminders | GET /health", { status: 404 });
  },
};
