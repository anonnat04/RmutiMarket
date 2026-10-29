const rateLimit = require("express-rate-limit");
const { RATE_LIMITS } = require("../config/constants");

// Global IP-level rate limit
const globalLimiter = rateLimit({
  windowMs: RATE_LIMITS.GLOBAL_WINDOW_MS,
  max: RATE_LIMITS.GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้ง" },
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
  loginLimiter,
  adminLoginLimiter,
  otpVerifyLimiter,
  forgotPasswordLimiter,
};
