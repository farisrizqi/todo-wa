/* ===== KONFIGURASI ===== */
const SUPABASE_URL = "https://vfwinvfipuiztnqfjyow.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmd2ludmZpcHVpenRucWZqeW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NDE0NDUsImV4cCI6MjEwNzExNzQ0NX0.ENhNWvcuZBpB-KwYI2oLI-SbhmZMd8Y2T9oF_7oEa70";
const WORKER_URL = "https://todo-wa.farisnur07.workers.dev"; // e.g.: https://todo-wa-bridge.you.workers.dev (fill in later)

/* ============================================================ */
let sbClient = null;
let todos = [];
let search = "";
let bootDone = false;
let weekStart = loadWeekStart(); // Week starts on Sunday
let user = null, isSignup = false;
const QUOTES = [
  "Small steps every day.",
  "Done is better than perfect.",
  "Focus on one thing at a time.",
  "Your future self is watching.",
  "Discipline beats motivation.",
  "Make today count.",
  "Progress, not perfection.",
  "Win the morning, win the day.",
  "One task at a time.",
  "Show up, even on hard days.",
  "Clear mind, clear week.",
  "Consistency beats intensity."
];

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RING_C = 2 * Math.PI * 34;

function sundayOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtD(d) { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function fmtT(iso) { if (!iso) return ""; return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function loadWeekStart() {
  try { const s = localStorage.getItem("todo-weekstart"); if (s) return sundayOf(new Date(s + "T00:00:00")); } catch (e) {}
  return sundayOf(new Date());
}
function saveWeekStart() { try { localStorage.setItem("todo-weekstart", weekStart.toISOString().slice(0, 10)); } catch (e) {} }

/* ---------- helpers ---------- */
function saveLocal() { if (!sbClient) localStorage.setItem("todos-demo", JSON.stringify(todos)); }
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2600);
}
function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function normNum(s) {
  let d = String(s || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}
function parseRecipients(str) {
  const out = [];
  String(str || "").split(",").forEach(p => {
    const d = normNum(p);
    if (d.length >= 9 && !out.includes(d)) out.push(d);
  });
  return out;
}
function getLastRecipients() { try { return JSON.parse(localStorage.getItem("todo-last-rc") || "[]"); } catch (e) { return []; } }
function saveLastRecipients(list) { try { localStorage.setItem("todo-last-rc", JSON.stringify(list)); } catch (e) {} }
function pushRecentNumbers(list) {
  try {
    let rec = JSON.parse(localStorage.getItem("todo-recent-nums") || "[]");
    list.forEach(n => { rec = [n].concat(rec.filter(x => x !== n)); });
    localStorage.setItem("todo-recent-nums", JSON.stringify(rec.slice(0, 12)));
  } catch (e) {}
}
function refreshDatalist() {
  const dl = $("rc-recent"); if (!dl) return;
  let rec = []; try { rec = JSON.parse(localStorage.getItem("todo-recent-nums") || "[]"); } catch (e) {}
  dl.innerHTML = rec.map(n => `<option value="${esc(n)}">`).join("");
}

/* ---------- DATA ---------- */
async function load() {
  if (sbClient) {
    if (!user) { todos = []; render(); return; }
    const { data, error } = await sbClient.from("todos").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) { toast("Load failed: " + error.message); return; }
    todos = data;
  }
  render();
}
async function insertTodo(obj) {
  if (sbClient) {
    if (user) obj.user_id = user.id;
    const { data, error } = await sbClient.from("todos").insert(obj).select().single();
    if (error) { toast("Save failed: " + error.message); return null; }
    todos.unshift(data); return data;
  }
  obj.id = "local-" + Date.now(); obj.created_at = new Date().toISOString();
  todos.unshift(obj); saveLocal(); return obj;
}
async function addTodo() {
  const title = $("input-title").value.trim();
  if (!title) { toast("Type a task title first"); return; }
  const dueVal = $("input-due").value;
  const rc = parseRecipients($("input-to").value);
  if (rc.length > 5) { toast("Max 5 recipients"); return; }
  const r = await insertTodo({
    title, due_at: dueVal ? new Date(dueVal).toISOString() : null,
    priority: $("input-priority").value, done: false, reminded: false, sent: false,
    recipients: rc,
  });
  if (!r) return;
  $("input-title").value = ""; $("input-due").value = ""; $("input-to").value = "";
  if (rc.length) { saveLastRecipients(rc); pushRecentNumbers(rc); }
  render(); toast(rc.length ? `✅ Task added → ${rc.length}` : "✅ Task added (no WA recipients)");
}
async function quickAdd(dayIdx) {
  const inp = $("q-" + dayIdx);
  const title = inp.value.trim();
  if (!title) return;
  const d = addDays(weekStart, dayIdx); d.setHours(9, 0, 0, 0); // default 9:00 AM
  const r = await insertTodo({ title, due_at: d.toISOString(), priority: "medium", done: false, reminded: false, sent: false, recipients: getLastRecipients().slice(0, 5) });
  if (!r) return;
  inp.value = ""; render(); toast("✅ Added to " + DAY_NAMES[dayIdx]);
}
async function toggleDone(id) {
  const t = todos.find(x => String(x.id) === String(id));
  if (!t) return;
  const newDone = !t.done;
  if (sbClient) {
    const patch = { done: newDone };
    if (newDone) patch.sent = false;
    const { error } = await sbClient.from("todos").update(patch).eq("id", t.id);
    if (error) { toast("Update failed: " + error.message); return; }
    t.done = newDone;
  } else { t.done = newDone; saveLocal(); }
  render();
  if (newDone) { confetti(); notifyWA("done", t); }
}
async function removeTodo(id) {
  if (!confirm("Delete this task?")) return;
  if (sbClient) {
    const { error } = await sbClient.from("todos").delete().eq("id", id);
    if (error) { toast("Delete failed: " + error.message); return; }
  }
  todos = todos.filter(x => String(x.id) !== String(id));
  saveLocal(); render(); toast("🗑️ Deleted");
}

/* ---------- WHATSAPP TRIGGER VIA WORKER ---------- */
async function notifyWA(type, t) {
  if (!WORKER_URL) return;
  try {
    await fetch(WORKER_URL + "/notify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, todo: { id: t.id, title: t.title, due_at: t.due_at, recipients: t.recipients || [] } }),
    });
    toast("📲 Sent to WhatsApp");
  } catch (e) { console.warn("worker unreachable", e); }
}

/* ---------- RENDER WEEKLY ---------- */
function dayTasks(i) {
  const q = search.toLowerCase();
  return todos.filter(t => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    if (!sameDay(d, addDays(weekStart, i))) return false;
    return !q || t.title.toLowerCase().includes(q);
  }).sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
}
function inboxTasks() {
  const q = search.toLowerCase();
  return todos.filter(t => !t.due_at && (!q || t.title.toLowerCase().includes(q)));
}
function liHTML(t, now) {
  const over = !t.done && t.due_at && new Date(t.due_at) < now;
  const rcp = t.recipients || [];
  const time = (t.due_at || rcp.length) ? `<small>${t.due_at ? "⏰ " + fmtT(t.due_at) : ""}${over ? ' <span class="over">• late</span>' : ""}${rcp.length ? ` <span class="rc" title="${esc(rcp.join(", "))}">→ ${rcp.length}</span>` : ""}</small>` : "";
  const dot = `<span class="dot ${t.priority || "medium"}" title="Priority: ${t.priority || "medium"}"></span>`;
  return `<li class="${t.done ? "done" : ""}">
    <button class="sq" onclick="toggleDone('${t.id}')" title="Check">${t.done ? "✓" : ""}</button>
    <span class="tt" onclick="toggleDone('${t.id}')"><span class="t">${esc(t.title)}</span>${time}</span>
    <span class="side">${dot}<button class="del" onclick="removeTodo('${t.id}')" title="Delete">×</button></span>
  </li>`;
}
function render() {
  refreshDatalist();
  const now = new Date();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // current week + inbox
  const weekTodos = [];
  for (let i = 0; i < 7; i++) weekTodos.push(...dayTasks(i));
  const inbox = inboxTasks();
  const all = weekTodos.concat(inbox);
  const done = all.filter(t => t.done).length;
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  $("ov-pct").textContent = pct + "%";
  $("ov-bar").style.width = pct + "%";
  $("ov-count").textContent = done + " / " + all.length + " Completed";

  // per-day bars
  $("bars").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const ts = dayTasks(i);
    const p = ts.length ? Math.round(ts.filter(t => t.done).length / ts.length * 100) : 0;
    const isToday = sameDay(addDays(weekStart, i), today);
    return `<div class="bar${ts.length && p === 100 ? " done" : ""}${isToday ? " today" : ""}" title="${DAY_NAMES[i]}: ${p}%">
      <i style="height:${Math.max(p, 4)}%"></i><span>${DAY_SHORT[i]}</span></div>`;
  }).join("");

  // today's tasks
  const dueToday = todos.filter(t => t.due_at && sameDay(new Date(t.due_at), today)
    && (!search || t.title.toLowerCase().includes(search.toLowerCase())));
  $("today-date").textContent = today.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  $("today-list").innerHTML = dueToday.length
    ? dueToday.map(t => `<div class="titem${t.done ? " done" : ""}" onclick="toggleDone('${t.id}')">
        <button class="sq" style="width:16px;height:16px;font-size:10px">${t.done ? "✓" : ""}</button><span>${esc(t.title)}</span></div>`).join("")
    : '<div class="empty-mini">No tasks today 🎉</div>';

  // inbox
  $("inbox").classList.toggle("hidden", inbox.length === 0);
  $("inbox-list").innerHTML = inbox.map(t => `<span class="chip${t.done ? " done" : ""}">
    <button class="sq" style="width:16px;height:16px;font-size:10px" onclick="toggleDone('${t.id}')">${t.done ? "✓" : ""}</button>
    <span onclick="toggleDone('${t.id}')">${esc(t.title)}</span>
    <button class="x" onclick="removeTodo('${t.id}')">×</button></span>`).join("");

  // 7 day columns
  $("week").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(weekStart, i);
    const ts = dayTasks(i);
    const p = ts.length ? Math.round(ts.filter(t => t.done).length / ts.length * 100) : 0;
    const off = RING_C * (1 - p / 100);
    const isToday = sameDay(d, today);
    return `<div class="day${isToday ? " today" : ""}">
      <div class="day-head"><b>${DAY_NAMES[i]}</b><span>${fmtD(d)}</span></div>
      <div class="ringwrap"><svg class="ring" viewBox="0 0 80 80">
        <circle class="bg" cx="40" cy="40" r="34"></circle>
        <circle class="fg" cx="40" cy="40" r="34" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      </svg></div>
      <div class="ringpct">${p}%</div>
      <ul class="tasks">${ts.map(t => liHTML(t, now)).join("") || '<li style="color:#bbb;font-size:12px">— empty —</li>'}</ul>
      <div class="quick"><input id="q-${i}" maxlength="80" placeholder="+ task..." onkeydown="if(event.key==='Enter')quickAdd(${i})" /><button onclick="quickAdd(${i})">＋</button></div>
    </div>`;
  }).join("");

  // week picker input
  const w = $("input-week");
  if (w && document.activeElement !== w) w.value = weekStart.toISOString().slice(0, 10);
}

function confetti() {
  const el = document.createElement("div");
  el.textContent = "🎉";
  el.style.cssText = "position:fixed;top:40%;left:50%;font-size:60px;transform:translate(-50%,-50%) scale(0);transition:.3s;z-index:99;pointer-events:none";
  document.body.appendChild(el);
  requestAnimationFrame(() => el.style.transform = "translate(-50%,-50%) scale(1.3) rotate(15deg)");
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 650);
}

/* ---------- greeting + motivation ---------- */
function renderGreet() {
  const h = new Date().getHours();
  const part = h < 11 ? "Good morning" : h < 15 ? "Good afternoon" : h < 19 ? "Good evening" : "Good night";
  const um = (user && user.user_metadata) || {};
  const name = (user && (um.display_name || user.email.split("@")[0])) || "there";
  $("greet").innerHTML = `👋 ${part}, <b>${esc(name)}</b>`;
  const dayNo = Math.floor(Date.now() / 86400000);
  $("quote").textContent = `\u201C${QUOTES[dayNo % QUOTES.length]}\u201D — ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" })}`;
}

/* ---------- theme ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  $("theme-toggle").textContent = t === "light" ? "🌙" : "☀️";
  try { localStorage.setItem("todo-theme", t); } catch (e) {}
}

/* ---------- auth ---------- */
function setAuthMode(signup) {
  isSignup = signup;
  $("auth-name").classList.toggle("hidden", !signup);
  $("auth-title").textContent = signup ? "Join us 🎉" : "Welcome back 👋";
  $("auth-sub").textContent = signup ? "Create an account for your week." : "Sign in to see your week.";
  $("btn-auth-go").textContent = signup ? "Create account" : "Sign in";
  $("swap-text").textContent = signup ? "Already have an account?" : "New here?";
  $("btn-auth-swap").textContent = signup ? "Sign in" : "Create account";
}
async function authGo() {
  const email = $("auth-email").value.trim(), pass = $("auth-pass").value, name = $("auth-name").value.trim();
  if (!email || pass.length < 6) { toast("Enter email + password (min 6 chars)"); return; }
  let res;
  if (isSignup) {
    if (!name) { toast("Tell us your name first"); return; }
    res = await sbClient.auth.signUp({ email, password: pass, options: { data: { display_name: name } } });
  } else {
    res = await sbClient.auth.signInWithPassword({ email, password: pass });
  }
  if (res.error) { toast(res.error.message); return; }
  if (isSignup && res.data && !res.data.session) toast("🎉 Account created — check your email, then sign in!");
  else toast(isSignup ? "🎉 Welcome!" : "👋 Welcome back!");
}

/* ---------- events ---------- */
$("btn-add").onclick = addTodo;
try { applyTheme(localStorage.getItem("todo-theme") || "dark"); } catch (e) { applyTheme("dark"); }
$("theme-toggle").onclick = () => applyTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
$("btn-auth-go").onclick = authGo;
$("btn-auth-swap").onclick = () => setAuthMode(!isSignup);
$("auth-pass").onkeydown = e => { if (e.key === "Enter") authGo(); };
$("btn-logout").onclick = async () => { if (sbClient) await sbClient.auth.signOut(); else location.reload(); };
$("profile-toggle").onclick = () => {
  const p = $("profile-panel");
  if (!p.classList.contains("hidden")) { p.classList.add("hidden"); return; }
  const um = (user && user.user_metadata) || {};
  $("profile-name").value = um.display_name || "";
  $("profile-email").textContent = (user && user.email) || "";
  p.classList.remove("hidden");
};
$("profile-name").onkeydown = e => { if (e.key === "Enter") $("btn-save-name").click(); };
$("btn-save-name").onclick = async () => {
  const name = $("profile-name").value.trim();
  if (!name) { toast("Type a name first"); return; }
  if (!sbClient || !user) return;
  const { error } = await sbClient.auth.updateUser({ data: { display_name: name } });
  if (error) { toast(error.message); return; }
  renderGreet(); toast("✅ Name saved");
  $("profile-panel").classList.add("hidden");
};
$("input-title").onkeydown = e => { if (e.key === "Enter") addTodo(); };
$("input-search").oninput = e => { search = e.target.value; render(); };
$("btn-prev").onclick = () => { weekStart = addDays(weekStart, -7); saveWeekStart(); render(); };
$("btn-next").onclick = () => { weekStart = addDays(weekStart, 7); saveWeekStart(); render(); };
$("btn-today").onclick = () => { weekStart = sundayOf(new Date()); saveWeekStart(); render(); };
$("input-week").onchange = e => { if (e.target.value) { weekStart = sundayOf(new Date(e.target.value + "T00:00:00")); saveWeekStart(); render(); } };

function subscribeRealtime() {
  if (!sbClient) return;
  sbClient.channel("todos-ch").on("postgres_changes", { event: "*", schema: "public", table: "todos" }, () => load()).subscribe();
}
async function boot() {
  if (bootDone) return; bootDone = true;
  let ok = false;
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    for (let i = 0; i < 40 && !window.supabase; i++) await new Promise(r => setTimeout(r, 250));
    if (window.supabase) {
      try { sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); ok = true; }
      catch (e) { console.error("createClient failed:", e); }
    } else console.error("Supabase CDN failed to load. Check internet / adblock / VPN.");
  }
  if (ok) {
    const c = $("conn"); c.textContent = "● cloud"; c.classList.add("cloud");
    $("config-banner").classList.add("hidden");
    subscribeRealtime();
  } else {
    const b = $("config-banner"); b.classList.remove("hidden");
    if (SUPABASE_URL && SUPABASE_ANON_KEY)
      b.innerHTML = "⚠️ Supabase keys are set but the cloud connection failed. Open Console (F12) to see the red error. Local demo mode active for now.";
    try { todos = JSON.parse(localStorage.getItem("todos-demo") || "[]"); } catch (e) { todos = []; }
  }
  if (WORKER_URL) $("worker-label").textContent = WORKER_URL;
  if (sbClient) {
    sbClient.auth.onAuthStateChange((_ev, sess) => {
      user = (sess && sess.user) || null;
      document.body.classList.toggle("logged-out", !user);
      document.body.classList.toggle("logged-in", !!user);
      if (!user) $("profile-panel").classList.add("hidden");
      if (user) { renderGreet(); load(); }
    });
    const { data } = await sbClient.auth.getSession();
    user = (data.session && data.session.user) || null;
    document.body.classList.toggle("logged-out", !user);
    document.body.classList.toggle("logged-in", !!user);
  } else {
    document.body.classList.remove("logged-out");
  }
  renderGreet();
  if (!sbClient || user) load();
}
boot();
