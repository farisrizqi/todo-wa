/* Cloudflare Worker: bridge Todo App -> GOWA (aldinokemal v9 API).
 * Each todo notifies ITS OWNER's number (from the profiles table, set in Profile).
 * Env vars (dashboard Settings > Variables and Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY,
 *   GOWA_URL (default: https://gowa-fardev.de.deplexo.com),
 *   GOWA_BASIC_AUTH (base64 of "user:pass", optional, only if GOWA uses --basic-auth),
 *   GOWA_DEVICE_ID (default: far-dev),
 *   REMINDER_OFFSET_MIN (default 3)
 */

const DEFAULT_GOWA_URL = "https://gowa-fardev.de.deplexo.com";
const DEFAULT_DEVICE_ID = "far-dev";
const DEFAULT_SUPABASE_URL = "https://vfwinvfipuiztnqfjyow.supabase.co";

function getGowaUrl(env) {
  const val = (env && env.GOWA_URL) || DEFAULT_GOWA_URL;
  return String(val || "").trim().replace(/\/$/, "");
}

function getDeviceIdSetting(env) {
  const val = (env && env.GOWA_DEVICE_ID) || DEFAULT_DEVICE_ID;
  return String(val || "").trim();
}

function getSupabaseUrl(env) {
  const val = (env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  return String(val || "").trim().replace(/\/$/, "");
}

function fmtDate(iso) {
  if (!iso) return "no deadline";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function sbHeaders(env) {
  const key = (env && env.SUPABASE_SERVICE_KEY) || "";
  return { apikey: key, Authorization: `Bearer ${key}` };
}

// Resolve the todo owner's WhatsApp number from profiles (service_role bypasses RLS).
async function getOwnerPhone(env, userId) {
  if (!userId) return "";
  try {
    const sbUrl = getSupabaseUrl(env);
    const r = await fetch(`${sbUrl}/rest/v1/profiles?select=phone&id=eq.${userId}`, { headers: sbHeaders(env) });
    if (!r.ok) return "";
    const arr = await r.json();
    return (arr[0] && arr[0].phone) || "";
  } catch (e) { return ""; }
}

function normPhone(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // GOWA expects pure international digits without leading zero or @s.whatsapp.net suffix
  let d = s.replace(/@.*$/, "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}

function getAuthHeader(rawAuth) {
  if (!rawAuth) return null;
  const s = String(rawAuth).trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith("basic ")) return s;
  if (s.includes(":")) {
    try {
      return "Basic " + btoa(s);
    } catch (e) {
      return "Basic " + s;
    }
  }
  return "Basic " + s;
}

let cachedDeviceId = null;
let cachedDeviceExpiry = 0;

async function resolveDeviceId(env) {
  const configured = (env && env.GOWA_DEVICE_ID && String(env.GOWA_DEVICE_ID).trim()) || "";
  if (configured) return configured;

  if (cachedDeviceId && Date.now() < cachedDeviceExpiry) {
    return cachedDeviceId;
  }
  const gowaUrl = getGowaUrl(env);
  if (!gowaUrl) return DEFAULT_DEVICE_ID;
  try {
    const headers = {};
    const authH = getAuthHeader(env && env.GOWA_BASIC_AUTH);
    if (authH) headers["Authorization"] = authH;
    const res = await fetch(gowaUrl + "/devices", { headers });
    if (!res.ok) return DEFAULT_DEVICE_ID;
    const data = await res.json();
    const list = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
    const active = list.find(d => d.status === "running" || d.status === "connected" || d.connected || d.state === "logged_in") || list[0];
    if (active && (active.id || active.device_id || active.phone)) {
      cachedDeviceId = String(active.id || active.device_id || active.phone);
      cachedDeviceExpiry = Date.now() + 5 * 60 * 1000;
      return cachedDeviceId;
    }
  } catch (e) { }
  return DEFAULT_DEVICE_ID;
}

async function sendOne(env, text, rawPhone) {
  const phone = normPhone(rawPhone);
  if (!phone) return { ok: false, phone: String(rawPhone), reason: "bad number" };

  const gowaUrl = getGowaUrl(env);
  if (!gowaUrl) return { ok: false, phone, reason: "GOWA_URL not configured" };

  const deviceId = await resolveDeviceId(env);

  const headers = { "Content-Type": "application/json" };
  const authH = getAuthHeader(env && env.GOWA_BASIC_AUTH);
  if (authH) headers["Authorization"] = authH;
  if (deviceId) headers["X-Device-Id"] = deviceId;

  const bodyObj = { phone, message: text };
  if (deviceId) bodyObj.device_id = deviceId;

  let queryStr = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  let res;
  try {
    res = await fetch(gowaUrl + "/send/message" + queryStr, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyObj),
    });
  } catch (e) {
    return { ok: false, phone, device_id: deviceId || null, reason: "GOWA unreachable: " + String(e && e.message || e).slice(0, 120) };
  }
  let rawText = "";
  try { rawText = await res.text(); } catch (e) { rawText = String(e); }
  let data = null;
  try { data = JSON.parse(rawText); } catch (e) { }
  const ok = res.ok && !!data && (data.code === "SUCCESS" || data.status === "success" || data.code === 200);
  const resultStr = (data && data.results) ? (typeof data.results === "string" ? data.results : JSON.stringify(data.results)) : "";
  const detail = resultStr || (data && (data.message || data.error || data.code)) || (rawText ? rawText.slice(0, 200) : `HTTP ${res.status}`);
  return { ok, status: res.status, phone, device_id: deviceId || null, message_id: (data && data.results && data.results.message_id) || null, detail, raw: data || rawText };
}

async function sendWA(env, text, rawPhone) {
  const gowaUrl = getGowaUrl(env);
  if (!gowaUrl) return { skipped: true, reason: "GOWA_URL not set" };
  if (!rawPhone) return { skipped: true, reason: "owner has no phone in profile" };
  return sendOne(env, text, rawPhone);
}

async function patchTodo(env, id, patch) {
  const sbUrl = getSupabaseUrl(env);
  await fetch(`${sbUrl}/rest/v1/todos?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...sbHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).catch(() => { });
}

function parseReminderMinutes(title) {
  if (!title) return null;
  const m = String(title).match(/\[remind:(\d+)([mhd])\]/i);
  if (!m) return null;
  const val = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === "h") return val * 60;
  if (unit === "d") return val * 24 * 60;
  return val;
}

function cleanTitle(title) {
  return String(title || "").replace(/\s*\[remind:[^\]]+\]/gi, "").trim();
}

async function handleNotify(req, env) {
  const { type, todo } = await req.json().catch(() => ({}));
  if (!todo) return Response.json({ error: "empty todo" }, { status: 400 });
  const displayTitle = cleanTitle(todo.title);
  const text = type === "done"
    ? `✅ Done: ${displayTitle}`
    : `⏰ Reminder: ${displayTitle} (${fmtDate(todo.due_at)})`;
  const phone = await getOwnerPhone(env, todo.user_id);
  const r = await sendWA(env, text, phone);
  if (type === "done" && r.ok === true && todo.id) await patchTodo(env, todo.id, { sent: true });
  return Response.json({ sent: r.ok === true, ...r });
}

const MOTIVATION_QUOTES = [
  "Fokus pada langkah kecil hari ini, hasil besar akan menyusul kemudian!",
  "Disiplin adalah jembatan antara cita-cita dan pencapaian nyata.",
  "Satu pekerjaan yang selesai lebih berharga daripada seribu rencana di kepala.",
  "Konsistensi kecil setiap hari akan menghasilkan perubahan yang luar biasa.",
  "Jangan menunggu waktu luang untuk produktif, tapi luangkan waktu untuk hal yang penting.",
  "Kamu lebih dekat ke tujuan dibanding kemarin. Yuk gas!",
  "Kerjakan yang sulit selagi masih ada waktu, agar sisa harimu terasa ringan.",
  "Fokus ke prosesnya, nikmati progresnya.",
  "Sukses dibangun dari kebiasaan-kebiasaan kecil yang dikerjakan konsisten.",
  "Waktu terus berjalan, buat setiap menitnya bernilai!",
  "Langkah pertama memang berat, tapi setelah jalan semuanya terasa ringan.",
  "Kalahkan rasa malas hari ini untuk masa depan yang lebih tenang."
];

const FOLLOW_UP_QUESTIONS = [
  "Gimana, to-do ini udah mulai dicicil atau baru mau siap-siap dieksekusi nih? Semangat ya, yuk tuntaskan! 🔥",
  "Sudah beres sampai mana progress-nya? Jangan ditunda ya biar nanti bisa istirahat tenang! 💪",
  "Udah siap dieksekusi belum nih? Yuk ambil nafas, fokus, dan selesaikan satu per satu! 🙌",
  "Sudah masuk persiapan belum? Yuk gas, kamu pasti bisa beresin ini tepat waktu! 👏",
  "Gimana progress-nya, aman kan? Luangkan waktu sebentar yuk buat nuntasin ini! ⚡"
];

const HASHTAG_SETS = [
  "#fardev-automation #todoready #GasPol",
  "#fardev-automation #todoreminder #FokusJuara",
  "#fardev-automation #tododone #ProductiveDay",
  "#fardev-automation #todogo #SemangatHariIni",
  "#fardev-automation #todoaction #PastiBisa"
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateReminderMessage(todo, ownerName, offsetMin) {
  const name = ownerName || "Faris";
  const displayTitle = cleanTitle(todo.title);

  let offsetLabel = "saat ini";
  if (offsetMin > 0) {
    offsetLabel = offsetMin >= 60
      ? `${Math.round(offsetMin / 60)} jam lagi`
      : `${offsetMin} menit lagi`;
  }

  const quote = pickRandom(MOTIVATION_QUOTES);
  const question = pickRandom(FOLLOW_UP_QUESTIONS);
  const hashtags = pickRandom(HASHTAG_SETS);

  return `⏰ *PING! Reminder To-Do Kamu* 🚀

Hai *${name}*! Jangan lupa ada agenda penting nih:
📝 *${displayTitle}*
🕒 *Waktu:* ${fmtDate(todo.due_at)} (${offsetLabel})

💡 _"${quote}"_

🤔 ${question}

${hashtags}`;
}

// Reminder sweep: checks tasks due soon or with custom reminder window.
// Sweep window: tasks due up to 24h ahead. Fires when now >= (due_at - reminder_offset_min).
async function handleCheck(env) {
  try {
    const defaultOffsetMin = Number((env && env.REMINDER_OFFSET_MIN) || 3);
    const now = Date.now();
    const dueBefore = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const sbUrl = getSupabaseUrl(env);

    // Fetch pending tasks due up to 24h ahead (avoid double-encoded date filters in PostgREST)
    const q = `${sbUrl}/rest/v1/todos?select=id,title,due_at,reminder_offset_min,user_id&done=eq.false&reminded=eq.false&due_at=not.is.null&due_at=lte.${encodeURIComponent(dueBefore)}&order=due_at.asc&limit=100`;
    const listRes = await fetch(q, { headers: sbHeaders(env) });
    if (!listRes.ok) return Response.json({ error: "supabase query failed", status: listRes.status, url: q }, { status: 500 });
    const allItems = await listRes.json();

    // Filter tasks whose reminder trigger time has arrived (allow up to 2 hours after deadline)
    const items = allItems.filter(t => {
      if (!t.due_at) return false;

      let offsetMin;
      if (t.reminder_offset_min === null && t.reminder_offset_min !== 0) {
        // Explicitly no reminder (none), but check legacy title tag just in case
        const titleTag = parseReminderMinutes(t.title);
        if (titleTag === null) return false;
        offsetMin = titleTag;
      } else if (typeof t.reminder_offset_min === "number") {
        offsetMin = t.reminder_offset_min;
      } else {
        offsetMin = parseReminderMinutes(t.title) ?? defaultOffsetMin;
      }

      const dueTime = new Date(t.due_at).getTime();
      const remindTime = dueTime - (offsetMin * 60 * 1000);
      return now >= remindTime && now <= dueTime + (2 * 60 * 60 * 1000);
    });

    // Batch-resolve owner phones and names in one query.
    const uids = [...new Set(items.map(t => t.user_id).filter(Boolean))];
    const owners = {};
    if (uids.length) {
      try {
        const pr = await fetch(`${sbUrl}/rest/v1/profiles?select=id,phone,name&id=in.(${uids.join(",")})`, { headers: sbHeaders(env) });
        if (pr.ok) {
          (await pr.json()).forEach(p => {
            owners[p.id] = { phone: p.phone || "", name: p.name || "" };
          });
        }
      } catch (e) { }
    }
    const results = [];
    for (const t of items) {
      const owner = owners[t.user_id] || {};
      const offsetMin = (typeof t.reminder_offset_min === "number")
        ? t.reminder_offset_min
        : (parseReminderMinutes(t.title) ?? defaultOffsetMin);
      const msg = generateReminderMessage(t, owner.name, offsetMin);
      const r = await sendWA(env, msg, owner.phone || "");
      // Only mark reminded if actually sent successfully or if user has no phone in profile
      if (r.ok === true || (r.skipped && r.reason === "owner has no phone in profile")) {
        await patchTodo(env, t.id, { reminded: true });
      }
      results.push({ id: t.id, title: t.title, phone: owner.phone || null, ...r });
    }
    return Response.json({
      checked: items.length,
      totalUpcoming: allItems.length,
      serverTime: new Date(now).toISOString(),
      results
    });
  } catch (err) {
    return Response.json({
      error: "handleCheck exception: " + String(err && err.message || err),
      stack: String(err && err.stack || "")
    }, { status: 500 });
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/notify") return handleNotify(req, env);
    if (req.method === "GET" && url.pathname === "/check-reminders") return handleCheck(env);
    if (req.method === "GET" && url.pathname === "/health") {
      const gowaUrl = getGowaUrl(env);
      const deviceId = await resolveDeviceId(env);
      return Response.json({ ok: true, mode: "gowa-profile", gowa_url: gowaUrl, sender: !!gowaUrl, device_id: deviceId || null });
    }
    if (req.method === "GET" && url.pathname === "/reset-reminded") {
      // Emergency endpoint: resets reminded = false for todos that are not done yet
      try {
        const sbUrl = getSupabaseUrl(env);
        const patchRes = await fetch(`${sbUrl}/rest/v1/todos?done=eq.false`, {
          method: "PATCH",
          headers: { ...sbHeaders(env), "Content-Type": "application/json" },
          body: JSON.stringify({ reminded: false }),
        });
        return Response.json({ ok: patchRes.ok, status: patchRes.status, message: "All pending tasks reset to reminded = false" });
      } catch (e) {
        return Response.json({ error: String(e && e.message || e) }, { status: 500 });
      }
    }
    if (req.method === "GET" && url.pathname === "/devices") {
      const gowaUrl = getGowaUrl(env);
      if (!gowaUrl) return Response.json({ error: "GOWA_URL not configured" }, { status: 500 });
      const headers = {};
      const authH = getAuthHeader(env && env.GOWA_BASIC_AUTH);
      if (authH) headers["Authorization"] = authH;
      try {
        const r = await fetch(gowaUrl + "/devices", { headers });
        const text = await r.text();
        return new Response(text, { status: r.status, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return Response.json({ error: String(e && e.message || e) }, { status: 502 });
      }
    }
    if (req.method === "GET" && url.pathname === "/test-send") {
      const targetPhone = url.searchParams.get("phone") || "6289506982507";
      const targetName = url.searchParams.get("name") || "Faris";
      const sampleTodo = {
        title: url.searchParams.get("title") || "Menyelesaikan to-do harian",
        due_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      };
      const targetMsg = url.searchParams.get("message") || generateReminderMessage(sampleTodo, targetName, 30);
      const r = await sendOne(env, targetMsg, targetPhone);
      return Response.json(r);
    }
    if (req.method === "GET" && url.pathname === "/debug") {
      const results = {};
      const targetUrl = getGowaUrl(env);
      const sbUrl = getSupabaseUrl(env);
      const deviceId = await resolveDeviceId(env);

      results.gowa_url = targetUrl;
      results.supabase_url = sbUrl;
      results.device_id_resolved = deviceId;
      results.raw_basic_auth = env && env.GOWA_BASIC_AUTH ? `${String(env.GOWA_BASIC_AUTH).slice(0, 3)}***` : "NOT_SET";
      results.computed_auth_header = getAuthHeader(env && env.GOWA_BASIC_AUTH) ? "PRESENT" : "NONE";
      results.has_supabase_service_key = !!(env && env.SUPABASE_SERVICE_KEY);

      // Check specific target todo if provided (or default)
      const targetId = url.searchParams.get("todo_id") || "e4a8a254-0852-4dde-b90f-757d25f181a6";
      try {
        const tr = await fetch(`${sbUrl}/rest/v1/todos?id=eq.${targetId}`, { headers: sbHeaders(env) });
        results.target_todo = await tr.json();
      } catch (e) { results.target_todo_error = String(e); }

      // Check specific user profile if provided (or default)
      const targetUid = url.searchParams.get("user_id") || "068db014-e1a0-4875-baa3-1cd16a3ab14b";
      try {
        const pr = await fetch(`${sbUrl}/rest/v1/profiles?id=eq.${targetUid}`, { headers: sbHeaders(env) });
        results.target_profile = await pr.json();
      } catch (e) { results.target_profile_error = String(e); }

      // Test Supabase connection & check latest pending todos
      try {
        const sbRes = await fetch(`${sbUrl}/rest/v1/todos?select=id,title,due_at,reminded,done,reminder_offset_min&done=eq.false&order=due_at.desc&limit=5`, {
          headers: sbHeaders(env)
        });
        results.supabase_status = sbRes.status;
        results.supabase_recent_todos = await sbRes.json();
      } catch (e) {
        results.supabase_error = String(e && e.message || e);
      }

      // Test GOWA with auth
      const authH = getAuthHeader(env && env.GOWA_BASIC_AUTH);
      if (authH) {
        try {
          const r3 = await fetch(targetUrl + "/devices", { headers: { Authorization: authH } });
          results.devices_auth_status = r3.status;
          results.devices_auth_text = (await r3.text()).slice(0, 150);
        } catch (e) { results.devices_auth_error = String(e && e.message || e); }
      }

      // Only test send message if explicitly requested: /debug?send=1
      if (url.searchParams.get("send") === "1") {
        const testHeaders = { "Content-Type": "application/json" };
        if (authH) testHeaders["Authorization"] = authH;
        if (deviceId) testHeaders["X-Device-Id"] = deviceId;

        try {
          const r4 = await fetch(targetUrl + "/send/message" + (deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""), {
            method: "POST",
            headers: testHeaders,
            body: JSON.stringify({
              phone: "6289506982507",
              message: "Testing WA Reminder Todo"
            })
          });
          results.send_status = r4.status;
          results.send_text = (await r4.text()).slice(0, 200);
        } catch (e) { results.send_error = String(e && e.message || e); }
      }

      return Response.json(results);
    }
    return new Response("Todo WA Bridge: POST /notify | GET /check-reminders | GET /devices | GET /test-send | GET /debug | GET /health | GET /reset-reminded", { status: 404 });
  },
  // Workers Cron Trigger (see wrangler.toml): runs the reminder sweep every minute.
  async scheduled(_event, env) {
    try {
      const res = await handleCheck(env);
      const data = await res.json().catch(() => null);
      console.log("Cron sweep result:", JSON.stringify(data));
    } catch (err) {
      console.error("Cron sweep error:", err);
    }
  },
};
