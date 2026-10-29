const jwt = require("jsonwebtoken");
const { supabase } = require("../config/db");
const { JWT_SECRET, ADMIN_JWT_SECRET } = require("../config/constants");

async function requireUserAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "กรุณาเข้าสู่ระบบก่อนทำรายการ" });
    }

    let payload;
    let isAdmin = false;
    try {
      payload = jwt.verify(token, JWT_SECRET, { issuer: "campus-market-user" });
    } catch (err) {
      try {
        payload = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: "campus-market-admin" });
        isAdmin = true;
      } catch {
        return res.status(401).json({ error: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" });
      }
    }

    if (isAdmin) {
      const { data: admin, error: adminErr } = await supabase
        .from("admins")
        .select("id, email, full_name, role, is_active")
        .eq("id", payload.sub)
        .single();

      if (adminErr || !admin || !admin.is_active) {
        return res.status(401).json({ error: "ไม่พบบัญชีผู้ดูแลระบบในระบบ" });
      }

      req.user = {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        display_name: admin.full_name,
        role: "admin",
      };
      return next();
    }

    const { data: user, error } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, ban_reason, successful_deal_count,
        average_rating, review_count, avatar_url, profile_image_url,
        last_seen_at, email_verified_at, created_at, updated_at,
        faculties(id, name, code),
        majors(id, name, code)
      `)
      .eq("id", payload.sub)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: "ไม่พบบัญชีผู้ใช้ในระบบ" });
    }
    if (user.status === "banned" || user.status === "suspended") {
      return res.status(403).json({ error: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
    }

    const { formatUser } = require("../utils/statusHelper");
    req.user = formatUser(user);
    next();
  } catch (err) {
    console.error("[requireUserAuth error]", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ผู้ใช้" });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    const payload = jwt.verify(token, JWT_SECRET, { issuer: "campus-market-user" });
    const { data: user } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, avatar_url, profile_image_url,
        email_verified_at, faculties(name), majors(name)
      `)
      .eq("id", payload.sub)
      .single();

    if (user && user.status === "active") {
      const { formatUser } = require("../utils/statusHelper");
      req.user = formatUser(user);
    }
  } catch {
    // Token invalid — proceed without auth
  }
  next();
}

module.exports = {
  requireUserAuth,
  optionalAuth,
};