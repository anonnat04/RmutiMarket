/**
 * errorHandler.js — ระบบตรวจจับและแสดงรายละเอียดข้อผิดพลาด (Error Logger & Handler)
 * แสดงผลใน Terminal แบบละเอียด เข้าใจง่าย ชัดเจน
 */

// ANSI Color Codes สำหรับตกแต่ง Terminal ให้อ่านง่าย
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
};

/**
 * วิเคราะห์และจัดหมวดหมู่ประเภท Error พร้อมแนะนำวิธีแก้
 */
function inspectError(err) {
  let category = "APPLICATION_ERROR";
  let hint = "";

  const errMsg = err?.message || String(err);
  const errCode = err?.code || "";

  // Supabase / PostgreSQL Errors
  if (errCode === "PGRST116") {
    category = "SUPABASE_RECORD_NOT_FOUND";
    hint = "ค้นหาข้อมูลไม่พบตามเงื่อนไข (.single() ไม่พบแถวข้อมูล)";
  } else if (errCode === "23505") {
    category = "DATABASE_DUPLICATE_KEY";
    hint = "ข้อมูลซ้ำ (UNIQUE constraint violation) เช่น อีเมล หรือ รหัสนักศึกษา ซ้ำในระบบ";
  } else if (errCode === "23503") {
    category = "DATABASE_FOREIGN_KEY_VIOLATION";
    hint = "ข้อมูลอ้างอิง Foreign Key ไม่ถูกต้อง (เช่น category_id หรือ user_id ไม่มีอยู่จริง)";
  } else if (errMsg.includes("fetch failed") || errMsg.includes("ENOTFOUND")) {
    category = "SUPABASE_NETWORK_ERROR";
    hint = "ไม่สามารถเชื่อมต่อ Supabase ได้ — กรุณาตรวจเช็คอินเทอร์เน็ต และค่า SUPABASE_URL ใน .env";
  } else if (err?.name === "JsonWebTokenError" || err?.name === "TokenExpiredError") {
    category = "AUTH_JWT_ERROR";
    hint = "Token ไม่ถูกต้องหรือหมดอายุ";
  } else if (err?.type === "entity.parse.failed") {
    category = "INVALID_JSON_BODY";
    hint = "JSON Payload ใน Request Body ผิดรูปแบบ (Syntax Error)";
  } else if (errMsg.includes("รหัส OTP หมดอายุ") || errMsg.includes("OTP expired")) {
    category = "OTP_EXPIRED_ERROR";
    hint = "รหัส OTP มีอายุ 5 นาที ผู้ใช้กรอกช้ากว่าเวลาที่กำหนด กรุณากดขอรหัส OTP ใหม่";
  } else if (errMsg.includes("รหัส OTP ไม่ถูกต้อง") || errMsg.includes("Invalid OTP")) {
    category = "OTP_INVALID_CODE";
    hint = "ผู้ใช้กรอกรหัส OTP ไม่ตรงกับรหัสที่ระบบส่งให้ทางอีเมล";
  } else if (errMsg.includes("กรอกรหัสผิดเกิน") || errMsg.includes("OTP Max Attempts")) {
    category = "OTP_MAX_ATTEMPTS_EXCEEDED";
    hint = "กรอก OTP ผิดเกิน 5 ครั้ง บัญชีถูกล็อกชั่วคราวเพื่อป้องกันการ Brute-force แฮ็กรหัส";
  } else if (errMsg.includes("กรุณารอ") && errMsg.includes("วินาทีก่อนขอรหัสใหม่")) {
    category = "OTP_RATE_LIMIT_COOLDOWN";
    hint = "ผู้ใช้กดขอรหัส OTP ถี่เกินไป (ต้องเว้นระยะอย่างน้อย 60 วินาที)";
  } else if (errMsg.includes("เกินจำนวน 5 ครั้งในหนึ่งชั่วโมง")) {
    category = "OTP_HOURLY_LIMIT_EXCEEDED";
    hint = "อีเมลนี้ขอ OTP เกิน 5 ครั้งใน 1 ชั่วโมง ระบบบล็อกเพื่อป้องกันการสแปม";
  } else if (errMsg.includes("Mailjet") || errMsg.includes("mail") || errMsg.includes("SMTP")) {
    category = "EMAIL_DELIVERY_ERROR";
    hint = "ส่งอีเมลไม่สำเร็จ — ตรวจสอบค่า MAILJET_API_KEY, MAILJET_SECRET_KEY หรืออีเมลผู้ส่งใน .env";
  }

  return { category, hint };
}

/**
 * พิมพ์ Error ลง Terminal แบบละเอียดชัดเจน
 */
function logErrorToTerminal(err, req = null) {
  const timestamp = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  const { category, hint } = inspectError(err);
  const status = err.statusCode || err.status || 500;

  console.log("\n" + COLORS.bgRed + COLORS.white + COLORS.bold + " 🚨 [ERROR DETECTED / พบข้อผิดพลาดในระบบ] " + COLORS.reset);
  console.log(COLORS.red + "━".repeat(70) + COLORS.reset);
  console.log(`${COLORS.bold}⏰ เวลา (Timestamp):${COLORS.reset}   ${timestamp}`);
  console.log(`${COLORS.bold}🏷️  ประเภท (Category):${COLORS.reset}  ${COLORS.yellow}${category}${COLORS.reset}`);
  console.log(`${COLORS.bold}🔢 รหัสสถานะ (Status):${COLORS.reset} ${COLORS.magenta}${status}${COLORS.reset}`);

  if (req) {
    console.log(`${COLORS.bold}🌐 Endpoint Request:${COLORS.reset}  ${COLORS.cyan}${req.method} ${req.originalUrl || req.url}${COLORS.reset}`);
    console.log(`${COLORS.bold}📍 Client IP:${COLORS.reset}         ${req.ip || req.connection?.remoteAddress}`);
    if (req.user) {
      console.log(`${COLORS.bold}👤 ผู้ใช้งาน (User ID):${COLORS.reset} ${req.user.id} (${req.user.email || req.user.student_id})`);
    }
    if (req.query && Object.keys(req.query).length > 0) {
      console.log(`${COLORS.bold}🔍 Query Params:${COLORS.reset}      ${JSON.stringify(req.query)}`);
    }
    if (req.body && Object.keys(req.body).length > 0) {
      // ซ่อนรหัสผ่านใน terminal log เพื่อความปลอดภัย
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.password) sanitizedBody.password = "******";
      if (sanitizedBody.newPassword) sanitizedBody.newPassword = "******";
      if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = "******";
      console.log(`${COLORS.bold}📦 Request Body:${COLORS.reset}      ${JSON.stringify(sanitizedBody)}`);
    }
  }

  console.log(`${COLORS.bold}❌ ข้อความผิดพลาด:${COLORS.reset}    ${COLORS.red}${err.message || String(err)}${COLORS.reset}`);
  
  if (hint) {
    console.log(`${COLORS.bold}💡 คำแนะนำ (Hint):${COLORS.reset}     ${COLORS.green}${hint}${COLORS.reset}`);
  }

  if (err.stack) {
    console.log(COLORS.cyan + "─── Stack Trace ───────────────────────────────────────────" + COLORS.reset);
    console.log(COLORS.white + err.stack.split("\n").slice(0, 6).join("\n") + COLORS.reset);
  }
  console.log(COLORS.red + "━".repeat(70) + COLORS.reset + "\n");
}

/**
 * Express Error Handling Middleware
 */
function errorHandler(err, req, res, next) {
  // บันทึกลง Terminal ทันที
  logErrorToTerminal(err, req);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง";

  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || undefined,
    ...(process.env.NODE_ENV === "development" ? { stack: err.stack } : {}),
  });
}

/**
 * 404 Not Found Middleware พร้อมแจ้งเตือนใน Terminal
 */
function notFoundHandler(req, res) {
  console.log(
    `${COLORS.yellow}⚠️  [404 Not Found]: ${COLORS.cyan}${req.method} ${req.originalUrl}${COLORS.reset} from IP: ${req.ip}`
  );

  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
}

/**
 * ติดตั้งตัวจับ Error ระดับ Global ของ Node.js Process (Uncaught Exception & Unhandled Rejection)
 */
function setupGlobalErrorCatchers() {
  // ตรวจจับข้อผิดพลาดที่ไม่มี try-catch ครอบ
  process.on("uncaughtException", (err) => {
    console.log(COLORS.bgRed + COLORS.white + " 💥 [FATAL: Uncaught Exception] " + COLORS.reset);
    logErrorToTerminal(err);
  });

  // ตรวจจับ Promise Rejection ที่ลืม .catch()
  process.on("unhandledRejection", (reason, promise) => {
    console.log(COLORS.bgRed + COLORS.white + " 💥 [Unhandled Promise Rejection] " + COLORS.reset);
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logErrorToTerminal(err);
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
  logErrorToTerminal,
  setupGlobalErrorCatchers,
};
