const crypto = require("crypto");
const { sendEmail } = require("./mailService");
const {
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SEC,
  RESET_TOKEN_TTL_MS,
} = require("../config/constants");

/**
 * Generate a cryptographically secure 6-digit numeric OTP code
 */
function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Hash OTP using SHA-256 for secure storage
 */
function hashOtp(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Generate a 32-byte secure hex token for password reset
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash Reset Token using SHA-256
 */
function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const SUBJECT_BY_PURPOSE = {
  register_verify: "🔐 ยืนยันอีเมลเพื่อสมัครสมาชิก - RMUTI Campus Market",
  login_2fa: "🔐 รหัส OTP สำหรับเข้าสู่ระบบ - RMUTI Campus Market",
  email_change: "🔐 ยืนยันการเปลี่ยนอีเมล - RMUTI Campus Market",
  password_reset: "🔐 รหัส OTP สำหรับรีเซ็ตรหัสผ่าน - RMUTI Campus Market",
};

const HEADLINE_BY_PURPOSE = {
  register_verify: "ยืนยันอีเมลของคุณ",
  login_2fa: "ยืนยันการเข้าสู่ระบบ",
  email_change: "ยืนยันอีเมลใหม่",
  password_reset: "รีเซ็ตรหัสผ่าน",
};

function otpEmailHtml(code, purpose) {
  const headline = HEADLINE_BY_PURPOSE[purpose] || "ยืนยันตัวตน";
  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #FAF6EC; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.08); }
        .header { background: #1A1A1A; color: #ffffff; padding: 36px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; color: #E8631C; }
        .content { padding: 36px 30px; text-align: center; }
        .otp-box { background: #E8631C; color: #ffffff; font-size: 42px; font-weight: bold; padding: 18px; border-radius: 14px; letter-spacing: 10px; margin: 26px 0; display: inline-block; }
        .message { color: #4D4D4D; font-size: 15px; line-height: 1.6; margin: 16px 0; }
        .warning { background: #FBEEDF; border: 1px solid #E8631C; border-radius: 10px; padding: 14px; margin: 20px 0; color: #4D4D4D; font-size: 14px; text-align: left; }
        .footer { background: #FAF6EC; padding: 18px; text-align: center; color: #8A8A8A; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>RMUTI Campus Market</h1></div>
        <div class="content">
          <h2 style="color:#1A1A1A;">${headline}</h2>
          <p class="message">กรุณากรอกรหัส OTP ด้านล่างนี้เพื่อดำเนินการต่อ:</p>
          <div class="otp-box">${code}</div>
          <div class="warning">
            <strong>⚠️ คำเตือนความปลอดภัย:</strong><br>
            • รหัสนี้ใช้ได้ครั้งเดียวและจะหมดอายุภายใน <strong>5 นาที</strong><br>
            • หากคุณไม่ได้ทำรายการนี้ กรุณาเพิกเฉยอีเมลฉบับนี้ และอย่าส่งต่อรหัสนี้ให้ผู้อื่นเด็ดขาด
          </div>
          <p class="message" style="color:#A6A6A6; font-size:13px;">อีเมลนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ</p>
        </div>
        <div class="footer">© ${new Date().getFullYear()} RMUTI Campus Market — All Rights Reserved</div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Dispatch OTP email to user
 */
async function sendOtpEmail(toEmail, code, purpose = "register_verify") {
  return await sendEmail({
    to: toEmail,
    subject: SUBJECT_BY_PURPOSE[purpose] || "🔐 รหัสยืนยัน OTP ของคุณ",
    text: `รหัสยืนยัน OTP ของคุณคือ ${code} (หมดอายุใน 5 นาที) กรุณาอย่าเปิดเผยรหัสนี้กับผู้อื่น`,
    html: otpEmailHtml(code, purpose),
  });
}

module.exports = {
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_REQUESTS_PER_HOUR,
  OTP_RESEND_COOLDOWN_SEC,
  RESET_TOKEN_TTL_MS,
  generateOtp,
  hashOtp,
  generateResetToken,
  hashResetToken,
  sendOtpEmail,
};
