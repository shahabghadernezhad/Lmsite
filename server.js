// server.js
// بک‌اند SecureVision Demo — یک سرور Express که هم API و هم فرانت‌اند را سرو می‌کند.
// اجرا: node server.js  →  سپس مرورگر را روی http://localhost:3000 باز کنید.

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let DATA = db.load();
const sessions = new Map(); // token -> userId

function persist() {
  db.save(DATA);
}

// ---------- Auth ----------
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  const userId = sessions.get(token);
  if (!userId) {
    return res.status(401).json({ error: "احراز هویت نشده. لطفاً دوباره وارد شوید." });
  }
  const user = DATA.users.find((u) => u.id === userId);
  if (!user) return res.status(401).json({ error: "کاربر یافت نشد." });
  req.user = user;
  next();
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = DATA.users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: "نام کاربری یا رمز عبور اشتباه است." });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, user.id);
  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  sessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const { id, username, name, role } = req.user;
  res.json({ id, username, name, role });
});

// ---------- Dashboard ----------
app.get("/api/dashboard/stats", authMiddleware, (req, res) => {
  const totalDevices = DATA.devices.length;
  const onlineDevices = DATA.devices.filter((d) => d.status === "online").length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventsToday = DATA.events.filter((e) => new Date(e.timestamp) >= today).length;
  const criticalOpen = DATA.events.filter((e) => e.severity === "critical" && e.status === "new").length;

  const bySeverity = {};
  DATA.events.forEach((e) => {
    bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
  });

  // events per hour bucket for last 24h (based on seeded timestamps' hour)
  const perHour = Array(24).fill(0);
  DATA.events.forEach((e) => {
    const h = new Date(e.timestamp).getHours();
    perHour[h] += 1;
  });

  res.json({
    totalDevices,
    onlineDevices,
    offlineDevices: totalDevices - onlineDevices,
    eventsToday,
    criticalOpen,
    bySeverity,
    perHour,
    systemStatus: DATA.systemStatus,
  });
});

// ---------- Sites ----------
app.get("/api/sites", authMiddleware, (req, res) => res.json(DATA.sites));

// ---------- Devices ----------
app.get("/api/devices", authMiddleware, (req, res) => {
  const { siteId, type, status } = req.query;
  let list = DATA.devices;
  if (siteId) list = list.filter((d) => d.siteId === siteId);
  if (type) list = list.filter((d) => d.type === type);
  if (status) list = list.filter((d) => d.status === status);
  res.json(list);
});

app.post("/api/devices", authMiddleware, (req, res) => {
  const { name, type, siteId, location } = req.body || {};
  if (!name || !type || !siteId) {
    return res.status(400).json({ error: "نام، نوع و سایت دستگاه الزامی است." });
  }
  const device = {
    id: "d-" + crypto.randomBytes(4).toString("hex"),
    name,
    type,
    siteId,
    location: location || "",
    status: "online",
  };
  DATA.devices.push(device);
  persist();
  res.status(201).json(device);
});

app.patch("/api/devices/:id", authMiddleware, (req, res) => {
  const device = DATA.devices.find((d) => d.id === req.params.id);
  if (!device) return res.status(404).json({ error: "دستگاه یافت نشد." });
  Object.assign(device, req.body);
  persist();
  res.json(device);
});

app.delete("/api/devices/:id", authMiddleware, (req, res) => {
  DATA.devices = DATA.devices.filter((d) => d.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

// ---------- Events ----------
app.get("/api/events", authMiddleware, (req, res) => {
  const { type, severity, status, deviceId, siteId, limit } = req.query;
  let list = [...DATA.events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  if (type) list = list.filter((e) => e.type === type);
  if (severity) list = list.filter((e) => e.severity === severity);
  if (status) list = list.filter((e) => e.status === status);
  if (deviceId) list = list.filter((e) => e.deviceId === deviceId);
  if (siteId) list = list.filter((e) => e.siteId === siteId);
  if (limit) list = list.slice(0, parseInt(limit, 10));
  res.json(list);
});

const EVENT_TYPES = [
  { type: "FACE_DETECTED", label: "تشخیص چهره", severity: "info" },
  { type: "PLATE_DETECTED", label: "تشخیص پلاک", severity: "info" },
  { type: "MOTION_DETECTED", label: "تشخیص حرکت", severity: "low" },
  { type: "DOOR_OPENED", label: "باز شدن درب", severity: "low" },
  { type: "UNAUTHORIZED_ACCESS", label: "ورود غیرمجاز", severity: "high" },
  { type: "FIRE_ALERT", label: "هشدار آتش", severity: "critical" },
  { type: "DEVICE_OFFLINE", label: "قطع ارتباط دستگاه", severity: "medium" },
];

// شبیه‌سازی یک رویداد تصادفی جدید — برای نمایش رفتار Real-time در دمو
app.post("/api/events/simulate", authMiddleware, (req, res) => {
  const et = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const dev = DATA.devices[Math.floor(Math.random() * DATA.devices.length)];
  const event = {
    id: "e-" + crypto.randomBytes(4).toString("hex"),
    type: et.type,
    label: et.label,
    severity: et.severity,
    deviceId: dev.id,
    deviceName: dev.name,
    siteId: dev.siteId,
    message: `${et.label} توسط ${dev.name}`,
    status: "new",
    timestamp: db.nowIso(),
  };
  DATA.events.unshift(event);
  persist();
  res.status(201).json(event);
});

app.patch("/api/events/:id", authMiddleware, (req, res) => {
  const event = DATA.events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: "رویداد یافت نشد." });
  Object.assign(event, req.body);
  persist();
  res.json(event);
});

// ---------- Rules ----------
app.get("/api/rules", authMiddleware, (req, res) => res.json(DATA.rules));

app.post("/api/rules", authMiddleware, (req, res) => {
  const { name, condition, action } = req.body || {};
  if (!name || !condition || !action) {
    return res.status(400).json({ error: "نام، شرط و اقدام قانون الزامی است." });
  }
  const rule = { id: "r-" + crypto.randomBytes(4).toString("hex"), name, condition, action, enabled: true };
  DATA.rules.push(rule);
  persist();
  res.status(201).json(rule);
});

app.patch("/api/rules/:id", authMiddleware, (req, res) => {
  const rule = DATA.rules.find((r) => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: "قانون یافت نشد." });
  Object.assign(rule, req.body);
  persist();
  res.json(rule);
});

app.delete("/api/rules/:id", authMiddleware, (req, res) => {
  DATA.rules = DATA.rules.filter((r) => r.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

// ---------- Users ----------
app.get("/api/users", authMiddleware, (req, res) => {
  res.json(DATA.users.map(({ password, ...u }) => u));
});

app.post("/api/users", authMiddleware, (req, res) => {
  if (req.user.role !== "SuperAdmin") {
    return res.status(403).json({ error: "فقط مدیر سیستم می‌تواند کاربر اضافه کند." });
  }
  const { username, password, name, role } = req.body || {};
  if (!username || !password || !name || !role) {
    return res.status(400).json({ error: "همه فیلدها الزامی است." });
  }
  if (DATA.users.some((u) => u.username === username)) {
    return res.status(409).json({ error: "این نام کاربری قبلاً استفاده شده است." });
  }
  const user = { id: "u-" + crypto.randomBytes(4).toString("hex"), username, password, name, role };
  DATA.users.push(user);
  persist();
  const { password: _pw, ...safeUser } = user;
  res.status(201).json(safeUser);
});

app.delete("/api/users/:id", authMiddleware, (req, res) => {
  if (req.user.role !== "SuperAdmin") {
    return res.status(403).json({ error: "فقط مدیر سیستم می‌تواند کاربر حذف کند." });
  }
  DATA.users = DATA.users.filter((u) => u.id !== req.params.id);
  persist();
  res.json({ ok: true });
});

// ---------- System / Offline simulation ----------
app.get("/api/system/status", authMiddleware, (req, res) => {
  res.json(DATA.systemStatus);
});

app.post("/api/system/toggle-online", authMiddleware, (req, res) => {
  DATA.systemStatus.online = !DATA.systemStatus.online;
  if (DATA.systemStatus.online) DATA.systemStatus.lastSyncAt = db.nowIso();
  persist();
  res.json(DATA.systemStatus);
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: db.nowIso() }));

app.listen(PORT, () => {
  console.log(`\n✅ SecureVision Demo در حال اجراست: http://localhost:${PORT}`);
  console.log(`   ورود پیش‌فرض → کاربری: admin   رمز: admin123\n`);
});
