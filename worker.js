/* Cloudflare Worker: bridge Todo App -> GOWA (aldinokemal v9 API)
 * Env vars (dashboard Settings > Variables and Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   GOWA_URL (e.g. https://xxx.onrender.com, empty = sending disabled),
 *   GOWA_BASIC_AUTH (base64 of "user:pass", optional, only if GOWA uses --basic-auth),
 *   GOWA_DEVICE_ID (optional, required only with multiple linked devices),
 *   TARGET_PHONE (e.g. 62812xxxxxxx),
 *   REMINDER_OFFSET_MIN (default 3)
 */

function fmtDate(iso) {
  if (!iso) return "no deadline";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function normPhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.includes("@")) return s;
  return s.replace(/\D/g, "") + "@s.whatsapp.net";
}

async function sendWA(env, text) {
  if (!env.GOWA_URL) return { skipped: true, reason: "GOWA_URL not set" };
  const phone = normPhone(env.TARGET_PHONE);
  if (!phone) return { ok: false, reason: "TARGET_PHONE not set" };
  const headers = { "Content-Type": "application/json" };
  if (env.GOWA_BASIC_AUTH) headers["Authorization"] = "Basic " + String(env.GOWA_BASIC_AUTH).trim();
  if (env.GOWA_DEVICE_ID) headers["X-Device-Id"] = String(env.GOWA_DEVICE_ID).trim();
  let res;
  try {
    res = await fetch(env.GOWA_URL.replace(/\/$/, "") + "/send/message", {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message: text }),
    });
  } catch (e) {
    return { ok: false, reason: "GOWA unreachable (sleeping or down): " + String(e && e.message || e).slice(0, 120) };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* Render wake-up page is HTML, not JSON */ }
  const ok = res.ok && !!data && data.code === "SUCCESS";
  return { ok, status: res.status, message_id: (data && data.results && data.results.message_id) || null, detail: (data && (data.message || data.code)) || "non-JSON response (GOWA may be waking up)" };
}

async function markReminded(env, id) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/todos?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reminded: true }),
  }).catch(() => {});
}

async function handleNotify(req, env) {
  const { type, todo } = await req.json().catch(() => ({}));
  if (!todo) return Response.json({ error: "empty todo" }, { status: 400 });
  const text = type === "done"
    ? `✅ Done: ${todo.title}`
    : `⏰ Reminder: ${todo.title} (${fmtDate(todo.due_at)})`;
  const r = await sendWA(env, text);
  return Response.json({ sent: r.ok === true, ...r });
}

// Reminder sweep: due within [now-30m, now+offset], not done, not reminded.
// Only marks reminded when the send actually succeeded (or sending is disabled),
// so a sleeping GOWA gets retried on the next run instead of losing the reminder.
async function handleCheck(env) {
  const offsetMin = Number(env.REMINDER_OFFSET_MIN || 3);
  const now = Date.now();
  const dueBefore = new Date(now + offsetMin * 60 * 1000).toISOString();
  const dueAfter = new Date(now - 30 * 60 * 1000).toISOString();
  const q = `${env.SUPABASE_URL}/rest/v1/todos?select=id,title,due_at&done=eq.false&reminded=eq.false&due_at=lte.${encodeURIComponent(dueBefore)}&due_at=gte.${encodeURIComponent(dueAfter)}&order=due_at.asc&limit=20`;
  const listRes = await fetch(q, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  if (!listRes.ok) return Response.json({ error: "supabase query failed", status: listRes.status }, { status: 500 });
  const items = await listRes.json();
  const results = [];
  for (const t of items) {
    const r = await sendWA(env, `⏰ Reminder: ${t.title} (${fmtDate(t.due_at)})`);
    if (r.ok === true || r.skipped) await markReminded(env, t.id);
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
  // Workers Cron Trigger (see wrangler.toml): runs the reminder sweep every minute,
  // no external cron-job.org needed.
  async scheduled(_event, env) {
    await handleCheck(env).catch(() => {});
  },
};
