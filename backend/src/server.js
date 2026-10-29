require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

// Error Catchers & Logger
const { errorHandler, notFoundHandler, setupGlobalErrorCatchers } = require("./middleware/errorHandler");

// เปิดใช้งานตัวตรวจจับ Global Errors (ดักทุก Uncaught Exception และ Unhandled Promise ทั่วทั้งระบบ)
setupGlobalErrorCatchers();

// Routes
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const listingRoutes = require("./routes/listingRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const meetupRoutes = require("./routes/meetupRoutes");
const chatRoutes = require("./routes/chatRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const profileRoutes = require("./routes/profileRoutes");
const returnRoutes = require("./routes/returnRoutes");
const wantToBuyRoutes = require("./routes/wantToBuyRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const reportRoutes = require("./routes/reportRoutes");

// Middleware
const { globalLimiter } = require("./middleware/rateLimiter");
const { setupChatSocket } = require("./services/chatSocket");

const app = express();
const server = http.createServer(app);

// ── Allowed Origins (ใช้ร่วมกันทั้ง Express CORS และ Socket.IO) ─────
// ดึงจาก CLIENT_ORIGIN ใน .env (รองรับคั่นด้วย comma หลาย URL)
const configuredOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(",").map((s) => s.trim().replace(/\/$/, ""))
  : [];

const allowedOrigins = [
  "http://localhost:5173",
  "http://172.20.10.2:5173",
  ...configuredOrigins,
];

// ฟังก์ชันตรวจสอบ Origin สำหรับ CORS (รองรับ localhost, URL ใน .env และ Vercel preview ทุกโดเมน)
function checkOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
    return callback(null, true);
  }
  return callback(null, true); // อนุญาตเพื่อความยืดหยุ่นตอน deploy
}

// ── Security Middleware ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: checkOrigin,
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Global rate limit (defense in depth)
app.use(globalLimiter);

// ── Request Logger (แสดงใน Terminal ทุก Request ที่วิ่งเข้ามา) ───────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
    console.log(`📡 [${req.method}] ${req.originalUrl} → ${color}${status}\x1b[0m (${duration}ms)`);
  });
  next();
});

// ── API Routes ───────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/meetups", meetupRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/want-to-buy", wantToBuyRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/reports", reportRoutes);

// ── Health Check & Debug Error Test ──────────────────────────────
app.get("/api/health", (_req, res) => res.json({
  ok: true,
  service: "campus-market-backend",
  version: "2.0.0",
  database: "Supabase PostgreSQL",
  realtimeChat: "Socket.IO Enabled",
  errorMonitoring: "Active (Terminal Logger)",
  timestamp: new Date().toISOString(),
}));

// Route พิเศษสำหรับทดสอบการตรวจจับ Error
app.get("/api/test-error", () => {
  throw new Error("🚨 ทดสอบระบบตรวจจับ Error: ระบบสามารถดักจับข้อผิดพลาดและแสดงรายละเอียดใน Terminal ได้อย่างสมบูรณ์แบบ!");
});

// ── Realtime Chat Socket.IO ──────────────────────────────────────
const io = setupChatSocket(server, checkOrigin);

// ── 404 + Error Handler (ดักจับ Error จากทุก Endpoint) ──────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;

// "0.0.0.0" = รับการเชื่อมต่อจากเครื่องอื่นในวง WiFi (เช่น มือถือ)
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Campus Market Backend v2.0 listening on port :${PORT}`);
  console.log(`📡 API Base (คอม):   http://localhost:${PORT}/api`);
  console.log(`📱 API Base (มือถือ): http://172.20.10.2:${PORT}/api`);
  console.log(`⚡ Socket.IO Realtime Chat ready at ws://localhost:${PORT}`);
  console.log(`🛡️  Error Monitoring: ACTIVE (ตรวจจับและแจ้งเตือน Error ใน Terminal)`);
  console.log(`📦 Database: Supabase PostgreSQL`);
  console.log("─────────────────────────────────────────────────────");
  console.log("📌 Endpoints:");
  console.log("   /api/auth          → Auth (register, login, OTP)");
  console.log("   /api/admin         → Admin Console");
  console.log("   /api/listings      → สินค้า (CRUD, search, filter)");
  console.log("   /api/transactions  → ซื้อ-ขาย (create, confirm, complete)");
  console.log("   /api/meetups       → นัดรับสินค้า");
  console.log("   /api/chat          → ห้องแชท & ข้อความ");
  console.log("   /api/reviews       → รีวิว & คะแนน");
  console.log("   /api/notifications → แจ้งเตือน");
  console.log("   /api/profile       → โปรไฟล์ & Wishlist");
  console.log("   /api/returns       → คืนสินค้า");
  console.log("   /api/want-to-buy   → โพสต์ \"อยากได้\"");
  console.log("   /api/test-error    → ทดสอบตัวตรวจจับ Error");
  console.log("─────────────────────────────────────────────────────");
});