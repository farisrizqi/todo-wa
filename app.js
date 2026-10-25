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
  "Consistency beats intensity.",
  "Start where you are.",
  "Keep moving forward.",
  "Small wins add up.",
  "Trust the process.",
  "Action beats overthinking.",
  "Be stubborn about your goals.",
  "Energy flows where focus goes.",
  "Build the habit, not the hype.",
  "Tired is okay. Giving up isn’t.",
  "Your only competition is yesterday's you.",
  "Growth lives outside comfort.",
  "Finish what you start.",
  "Stay patient, stay consistent.",
  "Momentum beats motivation.",
  "Do it scared.",
  "Push past the excuse.",
  "Dream big, start small.",
  "Effort compounds over time.",
  "Slow progress is still progress.",
  "Every rep counts.",
  "Focus on the next step.",
  "Make it a habit, not an event.",
  "Keep your promises to yourself.",
  "Hard now, easy later.",
  "Small disciplines create big results.",
  "Choose progress over comfort.",
  "Just begin.",
  "You don't need motivation, you need a plan.",
  "Stay in the arena.",
  "The work speaks for itself.",
  "Own your mornings.",
  "Chase progress, not perfection.",
  "Be relentless, not reckless.",
  "Keep showing up.",
  "One day or day one, you decide.",
  "Let your actions do the talking.",
  "Stack small wins.",
  "Build momentum, not excuses.",
  "Trust the small steps.",
  "Discipline is freedom.",
  "Stay consistent, stay sharp.",
  "Work quietly, let results speak.",
  "Keep the streak alive.",
  "Start messy, improve later.",
  "Your habits shape your future.",
  "Choose discomfort over regret.",
  "Keep your head down and grind.",
  "Small effort, repeated, wins big.",
  "Don't wait for motivation, create it.",
  "Focus beats talent.",
  "Be better than yesterday.",
  "Get 1% better today.",
  "Every day is a fresh start.",
  "Stay hungry, stay humble.",
  "Your goals don't care about excuses.",
  "Keep pushing, even slowly.",
  "Make progress your identity.",
  "Small steps, big destination.",
  "Patience pays compound interest.",
  "Discipline outlasts motivation.",
  "Show up for yourself first.",
  "Keep the promise you made to yourself.",
  "Stay focused, stay driven.",
  "Do the work when no one's watching.",
  "Build the life you want, brick by brick.",
  "One step closer, every day.",
  "Keep your eyes on the goal.",
  "Progress is progress, however small.",
  "Stay committed to the process.",
  "Your future is built today.",
  "Turn pressure into progress.",
  "Choose growth over comfort.",
  "Keep your standards high.",
  "Small habits, big changes.",
  "Be consistent, not perfect.",
  "Discipline today, freedom tomorrow.",
  "Keep grinding, the results will come.",
  "Every effort matters.",
  "Stay the course.",
  "Make your future self proud.",
  "Keep your focus narrow, your vision wide.",
  "Small steps still move you forward.",
  "Be patient with progress, impatient with excuses.",
  "Keep going, you're closer than you think.",
  "Your discipline writes your story.",
  "Stay steady, stay strong.",
  "Make consistency your superpower.",
  "Finish strong, start stronger."
];

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const RING_C = 2 * Math.PI * 34;

function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
function fmtD(d) { return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }); }
function fmtT(iso) { if (!iso) return ""; return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
function loadWeekStart() {
  try { const s = localStorage.getItem("todo-weekstart"); if (s) return mondayOf(new Date(s + "T00:00:00")); } catch (e) { }
  return mondayOf(new Date());
}
function saveWeekStart() { try { localStorage.setItem("todo-weekstart", weekStart.toISOString().slice(0, 10)); } catch (e) { } }

/* ---------- reminder helpers (database-driven: reminder_offset_min) ---------- */
const REMINDER_MINUTES_MAP = {
  "none": null,
  "0m": 0,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "24h": 1440
};

function remStringToMinutes(str) {
  if (!str || str === "none") return null;
  if (str in REMINDER_MINUTES_MAP) return REMINDER_MINUTES_MAP[str];
  const num = parseInt(str, 10);
  return isNaN(num) ? 30 : num;
}

function minutesToRemString(min) {
  if (min === null || min === undefined) return "none";
  for (const [k, v] of Object.entries(REMINDER_MINUTES_MAP)) {
    if (v === min) return k;
  }
  if (min % 60 === 0) return `${min / 60}h`;
  return `${min}m`;
}

function formatReminderMinutes(min) {
  if (min === null || min === undefined) return "";
  if (min === 0) return "At due time";
  if (min % 1440 === 0) return `${min / 1440}d before`;
  if (min % 60 === 0) return `${min / 60}h before`;
  return `${min}m before`;
}

function toLocalDatetimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function selectPriorityOption(prio) {
  const val = prio || "medium";
  $("edit-todo-priority").value = val;
  document.querySelectorAll(".prio-opt-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.getAttribute("data-prio") === val);
  });
}

function selectReminderOption(rem) {
  const val = rem || "none";
  $("edit-todo-reminder").value = val;
  document.querySelectorAll(".rem-opt-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.getAttribute("data-rem") === val);
  });
}

function openEditModal(id) {
  const t = todos.find(x => String(x.id) === String(id));
  if (!t) return;
  $("edit-todo-id").value = t.id;
  $("edit-todo-title").value = t.title || "";
  $("edit-todo-due").value = toLocalDatetimeInput(t.due_at);
  selectPriorityOption(t.priority || "medium");
  const remStr = minutesToRemString(t.reminder_offset_min);
  selectReminderOption(remStr);
  $("modal-edit").classList.remove("hidden");
  setTimeout(() => $("edit-todo-title").focus(), 40);
}

function closeEditModal() {
  $("modal-edit").classList.add("hidden");
}

async function saveTaskEdit() {
  const id = $("edit-todo-id").value;
  const t = todos.find(x => String(x.id) === String(id));
  if (!t) return;

  const title = $("edit-todo-title").value.trim();
  if (!title) { toast("Task title cannot be empty"); return; }

  const dueVal = $("edit-todo-due").value;
  const due_at = dueVal ? new Date(dueVal).toISOString() : null;
  const remStr = $("edit-todo-reminder").value || "none";
  const reminder_offset_min = due_at ? remStringToMinutes(remStr) : null;
  const priority = $("edit-todo-priority").value || "medium";

  const patch = {
    title,
    due_at,
    priority,
    reminder_offset_min,
    reminded: false
  };

  if (sbClient) {
    const { error } = await sbClient.from("todos").update(patch).eq("id", t.id);
    if (error) { toast("Update failed: " + error.message); return; }
  }

  t.title = patch.title;
  t.due_at = patch.due_at;
  t.priority = patch.priority;
  t.reminder_offset_min = patch.reminder_offset_min;
  t.reminded = patch.reminded;
  saveLocal();
  closeEditModal();
  render();
  toast("✅ Task updated");
}

/* ---------- helpers ---------- */
function saveLocal() { if (!sbClient) localStorage.setItem("todos-demo", JSON.stringify(todos)); }
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.add("hidden"), 2600);
}
function esc(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function normNum(s) {
  let d = String(s || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d;
}
let profilePhone = "";
let profileName = "";
async function loadProfile() {
  profilePhone = "";
  profileName = "";
  if (!sbClient || !user) return;
  const { data } = await sbClient.from("profiles").select("phone, name").eq("id", user.id).maybeSingle();
  if (data) {
    if (data.phone) profilePhone = data.phone;
    if (data.name) {
      profileName = data.name;
      if (!user.user_metadata) user.user_metadata = {};
      user.user_metadata.display_name = data.name;
    }
  }
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
  const remStr = $("input-reminder") ? $("input-reminder").value : "none";
  const reminder_offset_min = dueVal ? remStringToMinutes(remStr) : null;
  const priority = $("input-priority").value || "medium";

  const r = await insertTodo({
    title,
    due_at: dueVal ? new Date(dueVal).toISOString() : null,
    priority,
    reminder_offset_min,
    done: false,
    reminded: false,
    sent: false,
  });
  if (!r) return;
  $("input-title").value = ""; $("input-due").value = "";
  render(); toast("✅ Task added");
}
async function quickAdd(dayIdx) {
  const inp = $("q-" + dayIdx);
  const title = inp.value.trim();
  if (!title) return;
  const timeInp = $("qt-" + dayIdx);
  const timeVal = (timeInp && timeInp.value) ? timeInp.value : "09:00";
  const [hours, mins] = timeVal.split(":").map(Number);

  const prioInp = $("qp-" + dayIdx);
  const priority = (prioInp && prioInp.value) ? prioInp.value : "medium";

  const remInp = $("qr-" + dayIdx);
  const remStr = (remInp && remInp.value) ? remInp.value : "30m";
  const reminder_offset_min = remStringToMinutes(remStr);

  const d = addDays(weekStart, dayIdx);
  d.setHours(isNaN(hours) ? 9 : hours, isNaN(mins) ? 0 : mins, 0, 0);

  const r = await insertTodo({
    title,
    due_at: d.toISOString(),
    priority,
    reminder_offset_min,
    done: false,
    reminded: false,
    sent: false
  });
  if (!r) return;
  inp.value = "";
  render();
  const remText = reminder_offset_min !== null ? ` • 🔔 ${formatReminderMinutes(reminder_offset_min)}` : "";
  toast(`✅ Added to ${DAY_NAMES[dayIdx]} (${timeVal}${remText})`);
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
      body: JSON.stringify({ type, todo: { id: t.id, title: t.title, due_at: t.due_at, user_id: user ? user.id : null } }),
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
    return !q || (t.title && t.title.toLowerCase().includes(q));
  }).sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
}
function inboxTasks() {
  const q = search.toLowerCase();
  return todos.filter(t => {
    if (t.due_at) return false;
    return !q || (t.title && t.title.toLowerCase().includes(q));
  });
}
function liHTML(t, now) {
  const over = !t.done && t.due_at && new Date(t.due_at) < now;
  const timeBadge = t.due_at
    ? `<span class="chip-due${over ? ' over' : ''}" onclick="event.stopPropagation();openEditModal('${t.id}')" title="Click to edit deadline time">⏰ ${fmtT(t.due_at)}${over ? ' • late' : ''}</span>`
    : `<button class="chip-rem empty" onclick="event.stopPropagation();openEditModal('${t.id}')" title="Set deadline time">+ ⏰ Time</button>`;

  const hasRem = t.due_at && t.reminder_offset_min !== null && t.reminder_offset_min !== undefined;
  const remBadge = hasRem
    ? `<button class="chip-rem active" onclick="event.stopPropagation();openEditModal('${t.id}')" title="WhatsApp reminder: click to edit">🔔 ${formatReminderMinutes(t.reminder_offset_min)}</button>`
    : `<button class="chip-rem empty" onclick="event.stopPropagation();openEditModal('${t.id}')" title="Add WhatsApp reminder">+ 🔔 Remind</button>`;
  const dot = `<span class="dot ${t.priority || "medium"}" title="Priority: ${t.priority || "medium"}"></span>`;

  return `<li class="${t.done ? "done" : ""}">
    <button class="sq" onclick="toggleDone('${t.id}')" title="Check">${t.done ? "✓" : ""}</button>
    <div class="tt" onclick="toggleDone('${t.id}')">
      <div class="t-left">
        <span class="t" ondblclick="event.stopPropagation();openEditModal('${t.id}')" title="Double-click or click ✏️ to edit">${esc(t.title)}</span>
      </div>
      <div class="t-meta">
        ${timeBadge}
        ${remBadge}
        ${dot}
      </div>
    </div>
    <div class="side">
      <button class="btn-edit" onclick="event.stopPropagation();openEditModal('${t.id}')" title="Edit task & reminder">✏️</button>
      <button class="del" onclick="removeTodo('${t.id}')" title="Delete">×</button>
    </div>
  </li>`;
}
function render() {
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

  // per-day bars (Mon -> Sun)
  $("bars").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const ts = dayTasks(i);
    const p = ts.length ? Math.round(ts.filter(t => t.done).length / ts.length * 100) : 0;
    const isToday = sameDay(addDays(weekStart, i), today);
    return `<div class="bar${ts.length && p === 100 ? " done" : ""}${isToday ? " today" : ""}" title="${DAY_NAMES[i]}: ${p}%">
      <i style="height:${Math.max(p, 4)}%"></i><span>${DAY_SHORT[i]}</span></div>`;
  }).join("");

  // today's tasks
  const dueToday = todos.filter(t => t.due_at && sameDay(new Date(t.due_at), today)
    && (!search || (t.title && t.title.toLowerCase().includes(search.toLowerCase()))));
  $("today-date").textContent = today.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  $("today-list").innerHTML = dueToday.length
    ? dueToday.map(t => `<div class="titem${t.done ? " done" : ""}" onclick="toggleDone('${t.id}')">
        <button class="sq" style="width:16px;height:16px;font-size:10px">${t.done ? "✓" : ""}</button><span>${esc(t.title)}</span></div>`).join("")
    : '<div class="empty-mini">No tasks today 🎉</div>';

  // inbox
  $("inbox").classList.toggle("hidden", inbox.length === 0);
  $("inbox-list").innerHTML = inbox.map(t => {
    return `<span class="chip${t.done ? " done" : ""}">
      <button class="sq" style="width:16px;height:16px;font-size:10px" onclick="toggleDone('${t.id}')">${t.done ? "✓" : ""}</button>
      <span onclick="toggleDone('${t.id}')">${esc(t.title)}</span>
      <button class="x" onclick="removeTodo('${t.id}')">×</button></span>`;
  }).join("");

  // 7 day cards stacked vertically (Monday -> Sunday)
  $("week").innerHTML = [0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(weekStart, i);
    const ts = dayTasks(i);
    const doneCount = ts.filter(t => t.done).length;
    const p = ts.length ? Math.round(doneCount / ts.length * 100) : 0;
    const isToday = sameDay(d, today);
    return `<div class="day${isToday ? " today" : ""}">
      <div class="day-head">
        <div class="day-head-left">
          <b class="day-name">${DAY_NAMES[i]}</b>
          <span class="day-date">${fmtD(d)}</span>
          ${isToday ? '<span class="today-tag">TODAY</span>' : ""}
        </div>
        <div class="day-head-right">
          <span class="day-progress-text">${doneCount} / ${ts.length} done</span>
          <div class="day-progress-track"><div class="day-progress-fill" style="width:${p}%"></div></div>
          <span class="day-progress-pct">${p}%</span>
        </div>
      </div>
      <ul class="tasks">${ts.map(t => liHTML(t, now)).join("") || '<li class="empty-day">— No tasks for this day —</li>'}</ul>
      <div class="quick">
        <input id="q-${i}" class="q-title" maxlength="80" placeholder="＋ Add task for ${DAY_NAMES[i]}..." onkeydown="if(event.key==='Enter')quickAdd(${i})" />
        <input id="qt-${i}" class="q-time" type="time" value="09:00" title="Jam to do (${DAY_NAMES[i]})" onkeydown="if(event.key==='Enter')quickAdd(${i})" />
        <select id="qp-${i}" class="q-prio" title="Tingkat Urgensi (${DAY_NAMES[i]})">
          <option value="low">🟢 Easy</option>
          <option value="medium" selected>🟡 Med</option>
          <option value="high">🔴 Urgent</option>
        </select>
        <select id="qr-${i}" class="q-rem" title="Reminder WhatsApp (${DAY_NAMES[i]})">
          <option value="none">🔕 None</option>
          <option value="0m">⏰ 0m</option>
          <option value="5m">🔔 5m</option>
          <option value="10m">🔔 10m</option>
          <option value="15m">🔔 15m</option>
          <option value="30m" selected>🔔 30m</option>
          <option value="1h">🔔 1h</option>
          <option value="2h">🔔 2h</option>
          <option value="24h">🔔 24h</option>
        </select>
        <button onclick="quickAdd(${i})" title="Add task">＋ Add</button>
      </div>
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
  try { localStorage.setItem("todo-theme", t); } catch (e) { }
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
  $("profile-name").value = profileName || um.display_name || "";
  $("profile-email").textContent = (user && user.email) || "";
  $("profile-phone").value = profilePhone || "";
  p.classList.remove("hidden");
};
$("profile-name").onkeydown = e => { if (e.key === "Enter") $("btn-save-name").click(); };
$("profile-phone").onkeydown = e => { if (e.key === "Enter") $("btn-save-name").click(); };
$("btn-save-name").onclick = async () => {
  const name = $("profile-name").value.trim();
  const phone = normNum($("profile-phone").value);
  if (phone && phone.length < 9) { toast("Invalid WhatsApp number"); return; }
  if (!sbClient || !user) return;
  if (name) {
    const { error } = await sbClient.auth.updateUser({ data: { display_name: name } });
    if (error) { toast(error.message); return; }
  }
  const payload = { id: user.id, phone };
  if (name) payload.name = name;
  const { error: pErr } = await sbClient.from("profiles").upsert(payload, { onConflict: "id" });
  if (pErr) { toast(pErr.message); return; }
  profilePhone = phone;
  if (name) profileName = name;
  renderGreet(); toast(phone ? "✅ Profile saved → " + phone : "✅ Profile saved");
  $("profile-panel").classList.add("hidden");
};
$("input-title").onkeydown = e => { if (e.key === "Enter") addTodo(); };
$("input-search").oninput = e => { search = e.target.value; render(); };
$("btn-prev").onclick = () => { weekStart = addDays(weekStart, -7); saveWeekStart(); render(); };
$("btn-next").onclick = () => { weekStart = addDays(weekStart, 7); saveWeekStart(); render(); };
$("btn-today").onclick = () => { weekStart = mondayOf(new Date()); saveWeekStart(); render(); };
$("input-week").onchange = e => { if (e.target.value) { weekStart = mondayOf(new Date(e.target.value + "T00:00:00")); saveWeekStart(); render(); } };

/* modal edit bindings */
$("btn-close-modal").onclick = closeEditModal;
$("btn-cancel-edit").onclick = closeEditModal;
$("btn-save-edit").onclick = saveTaskEdit;
$("modal-edit").onclick = (e) => {
  if (e.target === $("modal-edit")) closeEditModal();
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("modal-edit").classList.contains("hidden")) closeEditModal();
});
$("edit-todo-title").onkeydown = (e) => { if (e.key === "Enter") saveTaskEdit(); };
$("edit-todo-due").onkeydown = (e) => { if (e.key === "Enter") saveTaskEdit(); };
document.querySelectorAll(".prio-opt-btn").forEach(btn => {
  btn.onclick = () => selectPriorityOption(btn.getAttribute("data-prio"));
});
document.querySelectorAll(".rem-opt-btn").forEach(btn => {
  btn.onclick = () => selectReminderOption(btn.getAttribute("data-rem"));
});

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
      if (!user) { profilePhone = ""; $("profile-panel").classList.add("hidden"); }
      if (user) { renderGreet(); loadProfile().then(load); } else { renderGreet(); }
    });
    const { data } = await sbClient.auth.getSession();
    user = (data.session && data.session.user) || null;
    document.body.classList.toggle("logged-out", !user);
    document.body.classList.toggle("logged-in", !!user);
  } else {
    document.body.classList.remove("logged-out");
  }
  renderGreet();
  if (!sbClient || user) { await loadProfile(); load(); }
  checkAutoTourPrompt();
}
boot();

/* ============================================================
 * INTERACTIVE TOUR & WHAT'S NEW NOTIFICATION (v2.0)
 * ============================================================ */
let currentTourStep = 0;
const TOUR_STORAGE_KEY = "todo_tour_v2_seen";

function openUpdateModal() {
  const m = $("modal-update-notice");
  if (m) m.classList.remove("hidden");
}

function closeUpdateModal(markSeen = true) {
  const m = $("modal-update-notice");
  if (m) m.classList.add("hidden");
  if (markSeen) {
    try { localStorage.setItem(TOUR_STORAGE_KEY, "true"); } catch (e) {}
  }
}

function clearTourHighlights() {
  document.querySelectorAll(".tour-highlight, .tour-highlight-gold").forEach(el => {
    el.classList.remove("tour-highlight", "tour-highlight-gold");
  });
}

const TOUR_STEPS = [
  {
    title: "🗓️ Vertical Daily Cards & Dedicated Scroll",
    desc: "Monday through Sunday cards now stretch vertically with independent internal scrollbars to keep your board clean and manageable.",
    getTarget: () => document.querySelector(".day.today") || document.querySelector(".day"),
    highlightClass: "tour-highlight",
    beforeStep: () => {
      $("profile-panel").classList.add("hidden");
    }
  },
  {
    title: "⚡ Quick-Add with Time, Priority & Reminder",
    desc: "Add tasks directly to today's card! You can set the execution time (09:00), priority level (Easy/Med/Urgent), and WhatsApp reminder offset (default 30m before due).",
    getTarget: () => {
      const day = document.querySelector(".day.today") || document.querySelector(".day");
      return day ? day.querySelector(".quick") : null;
    },
    highlightClass: "tour-highlight",
    beforeStep: () => {
      $("profile-panel").classList.add("hidden");
    }
  },
  {
    title: "✏️ Edit Tasks, Urgency & Reminders",
    desc: "Need to make changes? Click the pencil icon ✏️ or double-click any task item to edit its title, deadline, urgency level, or WhatsApp reminder window.",
    getTarget: () => document.querySelector(".btn-edit") || document.querySelector(".tasks li") || document.querySelector(".addbar"),
    highlightClass: "tour-highlight",
    beforeStep: () => {
      $("profile-panel").classList.add("hidden");
    }
  },
  {
    title: "👤 IMPORTANT: Complete Your WhatsApp Profile!",
    desc: "To receive automated reminder messages on your phone, enter your Display Name and WhatsApp Number (e.g., 628...), then click \"Save profile\"!",
    getTarget: () => $("profile-panel"),
    highlightClass: "tour-highlight-gold",
    beforeStep: () => {
      const p = $("profile-panel");
      p.classList.remove("hidden");
      const um = (user && user.user_metadata) || {};
      $("profile-name").value = profileName || um.display_name || "";
      $("profile-email").textContent = (user && user.email) || "";
      $("profile-phone").value = profilePhone || "";
      setTimeout(() => {
        if (!profilePhone) $("profile-phone").focus();
        else $("profile-name").focus();
      }, 300);
    }
  }
];

function showTourStep(index) {
  if (index < 0 || index >= TOUR_STEPS.length) {
    endTour(true);
    return;
  }
  currentTourStep = index;
  clearTourHighlights();

  const step = TOUR_STEPS[index];
  if (step.beforeStep) step.beforeStep();

  const targetEl = step.getTarget();
  if (targetEl) {
    targetEl.classList.add(step.highlightClass || "tour-highlight");
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const box = $("tour-guide-box");
  $("tour-step-badge").textContent = `Step ${index + 1} of ${TOUR_STEPS.length}`;
  $("tour-title").textContent = step.title;
  $("tour-desc").textContent = step.desc;

  $("btn-tour-prev").style.display = index === 0 ? "none" : "inline-block";
  $("btn-tour-next").textContent = index === TOUR_STEPS.length - 1 ? "Finish & Complete Profile 🎉" : "Next 👉";

  box.classList.remove("hidden");
}

function startTour() {
  closeUpdateModal(false);
  showTourStep(0);
}

function endTour(markSeen = true) {
  clearTourHighlights();
  const box = $("tour-guide-box");
  if (box) box.classList.add("hidden");
  if (markSeen) {
    try { localStorage.setItem(TOUR_STORAGE_KEY, "true"); } catch (e) {}
    toast("✨ Feature tour completed! Enjoy the new updates!");
  }
}

function checkAutoTourPrompt() {
  try {
    const seen = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!seen) {
      setTimeout(() => openUpdateModal(), 900);
    }
  } catch (e) {}
}

/* tour event bindings */
$("btn-whats-new").onclick = openUpdateModal;
$("btn-close-update-modal").onclick = () => closeUpdateModal(true);
$("btn-skip-tour").onclick = () => closeUpdateModal(true);
$("btn-start-tour").onclick = startTour;

$("btn-tour-prev").onclick = () => showTourStep(currentTourStep - 1);
$("btn-tour-next").onclick = () => showTourStep(currentTourStep + 1);
$("btn-exit-tour").onclick = () => endTour(true);
$("modal-update-notice").onclick = (e) => {
  if (e.target === $("modal-update-notice")) closeUpdateModal(true);
};
