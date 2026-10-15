// Baileys WhatsApp gateway for Raven Host (NodeJS) — no browser needed.
// Same HTTP contract as GOWA, so our Cloudflare Worker talks to it unchanged:
//   GET  /              status page (+ QR when not connected)
//   GET  /qr            QR code as PNG (404 when already connected)
//   GET  /health        { ok, connected }  (for uptime pingers)
//   POST /send/message  { phone, message } -> { code: "SUCCESS", results: { message_id } }
//   POST /logout        wipe session (fresh QR on next start)
// Env: PORT or APP_PORT (default 3000), APP_BASIC_AUTH="user:pass" (optional),
//      APP_OS="TodoWA" (device label shown in WhatsApp > Linked Devices).
const express = require("express");
const qrcode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Boom } = require("@hapi/boom");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const PORT = Number(process.env.APP_PORT || process.env.PORT || 3000);
const BASIC = process.env.APP_BASIC_AUTH || "";
const SESSION_DIR = path.join(__dirname, "session");

let sock = null;
let connected = false;
let lastQR = "";
let me = "";

function needAuth(req, res, next) {
  if (!BASIC) return next();
  const expect = "Basic " + Buffer.from(BASIC).toString("base64");
  if ((req.headers.authorization || "") === expect) return next();
  res.set("WWW-Authenticate", 'Basic realm="wa"');
  return res.status(401).json({ code: "UNAUTHORIZED" });
}

function normJid(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.includes("@")) return s;
  let d = s.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  return d + "@s.whatsapp.net";
}

async function startSock() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    browser: [process.env.APP_OS || "TodoWA", "Chrome", "1.0"],
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect, qr } = u || {};
    if (qr) lastQR = qr;
    if (connection === "open") {
      connected = true;
      lastQR = "";
      me = (sock.user && sock.user.id) || "";
      console.log("WhatsApp connected as", me);
    }
    if (connection === "close") {
      connected = false;
      let code = 0;
      try { code = new Boom(lastDisconnect && lastDisconnect.error).output.statusCode; } catch (e) {}
      console.log("Connection closed, code:", code);
      if (code === DisconnectReason.loggedOut) {
        try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
        console.log("Logged out — session wiped, fresh QR in a few seconds");
      }
      setTimeout(startSock, 3000);
    }
  });
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/", (req, res) => {
  const body = connected
    ? `<p style="color:#1f9d55;font-weight:800">● Connected${me ? " as " + me.split(":")[0] : ""}</p>`
    : `<p style="color:#e5484d;font-weight:800">● Not connected — scan with WhatsApp &gt; Linked Devices</p><img src="/qr" width="280" height="280" alt="QR" />`;
  res.send(`<html><body style="font-family:sans-serif;max-width:480px;margin:40px auto;text-align:center;background:#0c1428;color:#e9efff"><h2>WA Gateway</h2>${body}<p style="color:#8d99bd;font-size:12px">GET /health · POST /send/message</p></body></html>`);
});

app.get("/qr", async (req, res) => {
  if (!lastQR) return res.status(404).send("no QR right now (already connected?)");
  res.type("png").send(await qrcode.toBuffer(lastQR, { width: 280 }));
});

app.get("/health", (req, res) => res.json({ ok: true, connected }));

app.post("/send/message", needAuth, async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ code: "BAD_REQUEST" });
  if (!connected || !sock) return res.status(503).json({ code: "NOT_CONNECTED" });
  try {
    const sent = await sock.sendMessage(normJid(phone), { text: String(message) });
    const id = sent && sent.key && sent.key.id;
    return res.json({ code: "SUCCESS", message: "Message sent", results: { message_id: id || null } });
  } catch (e) {
    return res.status(502).json({ code: "SEND_FAILED", detail: String((e && e.message) || e).slice(0, 200) });
  }
});

app.post("/logout", needAuth, async (req, res) => {
  try { if (sock) await sock.logout().catch(() => {}); } catch (e) {}
  try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
  connected = false;
  setTimeout(startSock, 2000);
  res.json({ code: "SUCCESS", message: "Logged out, fresh QR incoming" });
});

app.listen(PORT, () => {
  console.log("WA gateway listening on", PORT);
  startSock().catch((e) => { console.error("start failed:", e); setTimeout(startSock, 5000); });
});
