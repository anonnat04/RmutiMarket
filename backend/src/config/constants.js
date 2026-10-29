/**
 * Application Constants and Configuration Settings
 */
module.exports = {
  // Authentication & Tokens
  JWT_SECRET: process.env.JWT_SECRET || "rmuti-campus-market-user-secret-change-in-prod-2026",
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || "rmuti-campus-admin-secret-change-in-prod-2026",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  ADMIN_JWT_EXPIRES_IN: process.env.ADMIN_JWT_EXPIRES_IN || "8h",

  // OTP Configuration
  OTP_TTL_MS: 5 * 60 * 1000, // 5 minutes
  OTP_MAX_ATTEMPTS: 5,
  OTP_MAX_REQUESTS_PER_HOUR: 5,
  OTP_RESEND_COOLDOWN_SEC: 60,
  RESET_TOKEN_TTL_MS: 15 * 60 * 1000, // 15 minutes

  // Validation Rules
  STUDENT_ID_REGEX: /^\d{11}-\d{1}$/, // RMUTI Format: 11 digits, hyphen, 1 check digit (e.g. 116410400011-1)
  
  // Rate Limits
  RATE_LIMITS: {
    GLOBAL_WINDOW_MS: 15 * 60 * 1000,
    GLOBAL_MAX: 300,
    USER_LOGIN_MAX: 25,
    ADMIN_LOGIN_MAX: 8,
    OTP_VERIFY_MAX: 30,
    FORGOT_PASSWORD_MAX: 10,
  }
};
