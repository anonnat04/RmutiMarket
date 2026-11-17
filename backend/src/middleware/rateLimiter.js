const rateLimit = require("express-rate-limit");
const { RATE_LIMITS } = require("../config/constants");

// Global IP-level rate limit
const globalLimiter = rateLimit({
  windowMs: RATE_LIMITS.GLOBAL_WINDOW_MS,
  max: RATE_LIMITS.GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง" },
  // หน้านัดรับ polling สถานะเพื่อรับการเช็คอินของอีกฝ่าย จึงต้องไม่กิน
  // quota รวมของทั้ง IP (มือถือหลายเครื่องใน Wi-Fi เดียวกันจะชนกันได้ง่าย)
  skip: (req) =>
    (req.method === "GET" && req.path === "/api/meetups") ||
    (req.method === "POST" && /^\/api\/meetups\/[^/]+\/checkin$/.test(req.path)),
});

// เช็คอินจำกัดแยกต่างหากหลังยืนยันตัวตนแล้ว เพื่อป้องกันกดย้ำ แต่ไม่ปิดกั้น
// ผู้ใช้เพราะ traffic ปกติของหน้าแผนที่/GPS
const checkInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user.id),
  message: { error: "กดเช็คอินบ่อยเกินไป กรุณารอ 1 นาทีแล้วลองใหม่" },
});

// User Login rate limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.USER_LOGIN_MAX,
  message: { error: "พยายามเข้าสู่ระบบมากเกินไป กรุณารอสักครู่แล้วลองใหม่" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin Login rate limit
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.ADMIN_LOGIN_MAX,
  message: { error: "พยายามเข้าสู่ระบบผู้ดูแลมากเกินไป กรุณารอ 15 นาที" },
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP Verification rate limit
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.OTP_VERIFY_MAX,
  message: { error: "ทำรายการยืนยัน OTP มากเกินไป กรุณาลองใหม่ภายหลัง" },
});

// Forgot Password rate limit
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: RATE_LIMITS.FORGOT_PASSWORD_MAX,
  message: { message: "หากอีเมลนี้ลงทะเบียนไว้ เราได้ส่งรหัส OTP ไปให้แล้ว" },
});

module.exports = {
  globalLimiter,
  checkInLimiter,
  loginLimiter,
  adminLoginLimiter,
  otpVerifyLimiter,
  forgotPasswordLimiter,
};
