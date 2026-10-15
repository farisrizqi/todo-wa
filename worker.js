/* Cloudflare Worker: bridge Todo App -> WhatsApp via CallMeBot (free API, no server needed)
 * Env vars (dashboard Settings > Variables and Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   CALLMEBOT_PHONE (e.g. 62812xxxxxxx, digits, no +),
 *   CALLMEBOT_APIKEY (from the CallMeBot WhatsApp bot activation),
 *   REMINDER_OFFSET_MIN (default 3)
 *
 * Setup (once, ~5 min, on your phone):
 *   1. Check the current bot number at https://www.callmebot.com/blog/free-api-whatsapp-messages/
 *   2. Save it as a contact, send it:  I allow callmebot to send me messages
 *   3. The bot replies with your personal APIKEY -> paste it into CALLMEBOT_APIKEY.
 */

function fmtDate(iso) {
  if (!iso) return "no deadline";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function sendWA(env, text) {
  const phone = String(env.CALLMEBOT_PHONE || "").replace(/\D/g, "");
  const key = String(env.CALLMEBOT_APIKEY || "").trim();
  if (!phone || !key) return { skipped: true, reason: "CALLMEBOT_PHONE/APIKEY not set" };
  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent("+" + phone)
    + "&text=" + encodeURIComponent(text)
    + "&apikey=" + encodeURIComponent(key);
  let res, body = "";
  try {
    res = await fetch(url);
    body = await res.text();
  } catch (e) {
    return { ok: false, reason: "CallMeBot unreachable: " + String(e && e.message || e).slice(0, 120) };
  }
  // CallMeBot answers 200 with an error text on failure (e.g. "APIKey is invalid").
  const failed = /error|invalid|not allowed|limit exceeded|blocked/i.test(body);
  return { ok: res.ok && !failed, status: res.status, detail: body.slice(0, 200) };
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
// so a failed send gets retried on the next run instead of losing the reminder.
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
    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, sender: !!(env.CALLMEBOT_PHONE && env.CALLMEBOT_APIKEY) });
    }
    return new Response("Todo WA Bridge: POST /notify | GET /check-reminders | GET /health", { status: 404 });
  },
  // Workers Cron Trigger (see wrangler.toml): runs the reminder sweep every minute.
  async scheduled(_event, env) {
    await handleCheck(env).catch(() => {});
  },
};
