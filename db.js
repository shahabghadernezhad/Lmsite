// db.js
// یک لایه‌ی دیتابیس ساده و بدون وابستگی native، مبتنی بر فایل JSON.
// برای دموی Offline-First مناسب است: هیچ سرور دیتابیس جداگانه‌ای لازم نیست
// و کل داده به‌صورت محلی روی دیسک (data/db.json) نگهداری می‌شود.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");

function nowIso() {
  return new Date().toISOString();
}

function seed() {
  const sites = [
    { id: "site-1", name: "ساختمان مرکزی - تهران" },
    { id: "site-2", name: "انبار شماره ۲ - اصفهان" },
  ];

  const users = [
    { id: "u-1", username: "admin", password: "admin123", name: "مدیر سیستم", role: "SuperAdmin" },
    { id: "u-2", username: "guard1", password: "guard123", name: "نگهبان شیفت شب", role: "Security" },
    { id: "u-3", username: "viewer", password: "viewer123", name: "بازدیدکننده", role: "Viewer" },
  ];

  const devices = [
    { id: "d-1", name: "دوربین ورودی اصلی", type: "camera", siteId: "site-1", location: "درب اصلی", status: "online" },
    { id: "d-2", name: "دوربین پارکینگ", type: "camera", siteId: "site-1", location: "پارکینگ B", status: "online" },
    { id: "d-3", name: "دوربین راهرو طبقه ۲", type: "camera", siteId: "site-1", location: "طبقه ۲", status: "offline" },
    { id: "d-4", name: "کنترلر درب انبار", type: "door", siteId: "site-2", location: "درب انبار", status: "online" },
    { id: "d-5", name: "سنسور دود", type: "sensor", siteId: "site-2", location: "سالن اصلی", status: "online" },
    { id: "d-6", name: "دوربین محوطه", type: "camera", siteId: "site-2", location: "محوطه بیرونی", status: "online" },
  ];

  const eventTypes = [
    { type: "FACE_DETECTED", label: "تشخیص چهره", severity: "info" },
    { type: "PLATE_DETECTED", label: "تشخیص پلاک", severity: "info" },
    { type: "MOTION_DETECTED", label: "تشخیص حرکت", severity: "low" },
    { type: "DOOR_OPENED", label: "باز شدن درب", severity: "low" },
    { type: "UNAUTHORIZED_ACCESS", label: "ورود غیرمجاز", severity: "high" },
    { type: "FIRE_ALERT", label: "هشدار آتش", severity: "critical" },
    { type: "DEVICE_OFFLINE", label: "قطع ارتباط دستگاه", severity: "medium" },
  ];

  const events = [];
  const startTime = Date.now() - 1000 * 60 * 60 * 20; // 20 hours ago
  for (let i = 0; i < 40; i++) {
    const et = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const dev = devices[Math.floor(Math.random() * devices.length)];
    events.push({
      id: "e-" + (i + 1),
      type: et.type,
      label: et.label,
      severity: et.severity,
      deviceId: dev.id,
      deviceName: dev.name,
      siteId: dev.siteId,
      message: `${et.label} توسط ${dev.name}`,
      status: Math.random() > 0.7 ? "resolved" : "new",
      timestamp: new Date(startTime + i * 1000 * 60 * 27).toISOString(),
    });
  }

  const rules = [
    {
      id: "r-1",
      name: "هشدار ورود غیرمجاز شبانه",
      condition: "Face = Unknown AND Time > 22:00",
      action: "Notify Security + Lock Door + Start Recording",
      enabled: true,
    },
    {
      id: "r-2",
      name: "هشدار آتش‌سوزی",
      condition: "FIRE_ALERT = true",
      action: "Notify All + Open Emergency Doors",
      enabled: true,
    },
    {
      id: "r-3",
      name: "ثبت خودکار ورود پلاک مجاز",
      condition: "PLATE_DETECTED IN Whitelist",
      action: "Open Barrier + Log Entry",
      enabled: false,
    },
  ];

  return {
    sites,
    users,
    devices,
    events,
    rules,
    systemStatus: { online: true, lastSyncAt: nowIso() },
  };
}

function load() {
  if (!fs.existsSync(DB_PATH)) {
    const data = seed();
    save(data);
    return data;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("خطا در خواندن دیتابیس، بازسازی می‌شود:", e.message);
    const data = seed();
    save(data);
    return data;
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

module.exports = { load, save, seed, nowIso };
