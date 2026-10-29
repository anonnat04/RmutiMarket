const jwt = require("jsonwebtoken");
const { supabase } = require("../config/db");
const { ADMIN_JWT_SECRET } = require("../config/constants");

/**
 * Verifies admin JWT access token and attaches req.admin
 */
async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "ต้องเข้าสู่ระบบผู้ดูแลระบบ (Unauthorized)" });

    let payload;
    try {
      payload = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: "campus-market-admin" });
    } catch {
      return res.status(401).json({ error: "เซสชันผู้ดูแลระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
    }

    const { data: admin, error } = await supabase
      .from("admins")
      .select("id, email, full_name, role, must_change_password, is_active")
      .eq("id", payload.sub)
      .single();

    if (error || !admin || !admin.is_active) {
      return res.status(401).json({ error: "บัญชีผู้ดูแลระบบนี้ถูกระงับหรือไม่พบในระบบ" });
    }

    req.admin = admin;
    next();
  } catch (err) {
    console.error("[requireAdmin error]", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ผู้ดูแลระบบ" });
  }
}

/**
 * Blocks dashboard access if admin still has must_change_password = true
 */
function blockUntilPasswordChanged(req, res, next) {
  if (req.admin?.must_change_password) {
    return res.status(403).json({
      error: "กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งานคอนโซลผู้ดูแลระบบ",
      mustChangePassword: true,
    });
  }
  next();
}

/**
 * Restricts a route to super_admin only
 */
function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== "super_admin") {
    return res.status(403).json({ error: "เฉพาะ Super Admin เท่านั้นที่ทำรายการนี้ได้" });
  }
  next();
}

/**
 * Record action to admin audit log table
 */
async function logAdminAction(adminId, action, targetType, targetId, details, ip) {
  try {
    await supabase.from("admin_audit_log").insert({
      admin_id: adminId,
      action,
      target_type: targetType || null,
      target_id: targetId ? String(targetId) : null,
      details: details || null,
      ip_address: ip,
    });
  } catch (err) {
    console.error("[logAdminAction error]", err.message);
  }
}

module.exports = {
  requireAdmin,
  blockUntilPasswordChanged,
  requireSuperAdmin,
  logAdminAction,
  ADMIN_JWT_SECRET,
};
