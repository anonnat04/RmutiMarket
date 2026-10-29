const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { supabase } = require("../config/db");
const {
  JWT_SECRET,
  ADMIN_JWT_SECRET,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SEC,
  OTP_MAX_REQUESTS_PER_HOUR,
} = require("../config/constants");
const {
  generateOtp,
  hashOtp,
  generateResetToken,
  hashResetToken,
  sendOtpEmail,
} = require("../services/otpService");
const {
  isValidStudentId,
  isEmailDomainAllowed,
  isStrongUserPassword,
  verifyTurnstile,
} = require("../utils/validators");
const { logErrorToTerminal } = require("../middleware/errorHandler");
const { formatUser } = require("../utils/statusHelper");

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
async function throttleOtpRequests(email, ip) {
  const oneMinAgo = new Date(Date.now() - OTP_RESEND_COOLDOWN_SEC * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  // Cooldown check
  const { data: recent } = await supabase
    .from("otp_request_log")
    .select("requested_at")
    .eq("email", email.toLowerCase())
    .order("requested_at", { ascending: false })
    .limit(1);

  if (recent?.[0]) {
    const secondsSince = (Date.now() - new Date(recent[0].requested_at).getTime()) / 1000;
    if (secondsSince < OTP_RESEND_COOLDOWN_SEC) {
      const remaining = Math.ceil(OTP_RESEND_COOLDOWN_SEC - secondsSince);
      throw { status: 429, message: `กรุณารอ ${remaining} วินาทีก่อนขอรหัสใหม่` };
    }
  }

  // Per-hour cap
  const { count } = await supabase
    .from("otp_request_log")
    .select("*", { count: "exact", head: true })
    .eq("email", email.toLowerCase())
    .gte("requested_at", oneHourAgo);

  if ((count || 0) >= OTP_MAX_REQUESTS_PER_HOUR) {
    throw { status: 429, message: "ขอรหัส OTP เกินจำนวน 5 ครั้งในหนึ่งชั่วโมง กรุณาลองใหม่ภายหลัง" };
  }

  await supabase.from("otp_request_log").insert({ email: email.toLowerCase(), ip_address: ip });
}

async function issueOtp(email, userId, purpose) {
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await supabase.from("otp_codes").insert({
    user_id: userId || null,
    email: email.toLowerCase(),
    code_hash: hashOtp(code),
    purpose,
    expires_at: expiresAt,
    max_attempts: OTP_MAX_ATTEMPTS,
  });
  await sendOtpEmail(email, code, purpose);
}

async function logAdminAction(adminId, action, targetType, targetId, details, ip) {
  await supabase.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: String(targetId),
    details,
    ip_address: ip,
  });
}

// ----------------------------------------------------------------
// GET /api/auth/faculties-and-majors
// ----------------------------------------------------------------
// ⚠️ หมายเหตุ: ตาราง "faculties" และ "majors" ไม่มีอยู่ใน schema.sql ที่ยึดเป็นหลัก
// ถ้ายังไม่เคยสร้างตารางนี้แยกไว้ต่างหากใน Supabase endpoint นี้จะ 500
// (ไม่ได้แก้ในรอบนี้เพราะไม่แน่ใจว่าคุณสร้างไว้แยกหรือยัง — ถ้าเจอ error แจ้งได้เลย)
// ----------------------------------------------------------------
async function getFacultiesAndMajors(req, res, next) {
  try {
    const { data: fRows, error: fErr } = await supabase
      .from("faculties")
      .select("id, name, code")
      .order("id");
    if (fErr) throw fErr;

    const { data: mRows, error: mErr } = await supabase
      .from("majors")
      .select("id, faculty_id, name, code")
      .order("id");
    if (mErr) throw mErr;

    const faculties = fRows.map((f) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      majors: mRows
        .filter((m) => m.faculty_id === f.id)
        .map((m) => ({ id: m.id, name: m.name, code: m.code })),
    }));

    res.json({ faculties });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/auth/register
// ----------------------------------------------------------------
async function register(req, res, next) {
  const {
    fullName, firstName, lastName, username, phone, email, password,
    studentId, displayName, faculty, major,
    termsAccepted, turnstileToken,
  } = req.body;

  const cleanUsername = (username || "").trim();
  const resolvedFullName = (fullName || `${firstName || ""} ${lastName || ""}`).trim();
  const resolvedDisplayName = displayName || cleanUsername || firstName || resolvedFullName.split(" ")[0] || "User";

  try {
    if (!termsAccepted)
      return res.status(400).json({ error: "กรุณายอมรับข้อตกลงการใช้งานและนโยบายความเป็นส่วนตัว" });

    if (!cleanUsername || !/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({ error: "ชื่อผู้ใช้ (Username) ต้องมีความยาว 3-30 ตัวอักษร และประกอบด้วยตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่าง (_) เท่านั้น" });
    }

    if (!(await verifyTurnstile(turnstileToken, req.ip)))
      return res.status(400).json({ error: "การตรวจสอบความปลอดภัย (Captcha) ไม่สำเร็จ กรุณาลองใหม่" });

    if (!isStrongUserPassword(password))
      return res.status(400).json({ error: "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษรและประกอบด้วยตัวอักษรและตัวเลข" });

    const cleanStudentId = (studentId || "").trim();
    if (!isValidStudentId(cleanStudentId))
      return res.status(400).json({ error: "รหัสนักศึกษาต้องเป็นตัวเลข 11 หลักตามด้วยขีดและตัวเลข 1 หลัก (เช่น 116410400011-1)" });

    // Allowed email domains
    // ⚠️ หมายเหตุ: ตาราง "university_domains" ก็ไม่มีอยู่ใน schema.sql เช่นกัน — ถ้ายังไม่มีตารางนี้จริง
    // query นี้จะ error แต่เพราะไม่ได้เช็ค { error } จึงไม่ throw แค่ตกไปใช้ allowedDomains แบบ hardcode ด้านล่างแทนเงียบๆ
    const { data: domainRows } = await supabase.from("university_domains").select("domain");
    const allowedDomains = domainRows?.length
      ? domainRows.map((d) => d.domain)
      : ["rmuti.ac.th", "korat.rmuti.ac.th", "kkc.rmuti.ac.th", "skc.rmuti.ac.th", "surin.rmuti.ac.th"];

    if (!isEmailDomainAllowed(email, allowedDomains))
      return res.status(400).json({ error: "กรุณาใช้อีเมลมหาวิทยาลัย (@rmuti.ac.th หรือโดเมนวิทยาเขต)" });

    // Duplicate check
    const cleanEmail = email.toLowerCase().trim();
    const { data: dupEmail } = await supabase.from("users").select("id").eq("university_email", cleanEmail).limit(1);
    const { data: dupSid } = await supabase.from("users").select("id").eq("student_id", cleanStudentId).limit(1);
    const { data: dupUsername } = await supabase.from("users").select("id").eq("username", cleanUsername).limit(1);

    if (dupEmail?.length) return res.status(409).json({ error: "อีเมลมหาวิทยาลัยนี้ถูกใช้งานแล้ว" });
    if (dupSid?.length) return res.status(409).json({ error: "รหัสนักศึกษานี้มีในระบบแล้ว" });
    if (dupUsername?.length) return res.status(409).json({ error: "ชื่อผู้ใช้ (Username) นี้ถูกใช้งานแล้ว กรุณาเลือกชื่ออื่น" });

    let resolvedFacultyId = 1;
    let resolvedMajorId = 1;

    if (faculty) {
      if (!isNaN(parseInt(faculty))) {
        resolvedFacultyId = parseInt(faculty);
      } else {
        const { data: fMatch } = await supabase.from("faculties").select("id").ilike("name", `%${faculty}%`).limit(1);
        if (fMatch?.[0]) resolvedFacultyId = fMatch[0].id;
      }
    }

    if (major) {
      if (!isNaN(parseInt(major))) {
        resolvedMajorId = parseInt(major);
      } else {
        const { data: mMatch } = await supabase.from("majors").select("id").ilike("name", `%${major}%`).limit(1);
        if (mMatch?.[0]) resolvedMajorId = mMatch[0].id;
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const { data: newUser, error: insErr } = await supabase
      .from("users")
      .insert({
        username: cleanUsername,
        full_name: resolvedFullName,
        student_id: cleanStudentId,
        university_email: cleanEmail,
        faculty_id: resolvedFacultyId,
        major_id: resolvedMajorId,
        phone: phone || null,
        password_hash: passwordHash,
        role: "user",
        trust_score: 100,
        status: "active",
      })
      .select("id")
      .single();

    if (insErr) throw insErr;

    await throttleOtpRequests(email, req.ip);
    await issueOtp(email, newUser.id, "register_verify");

    res.status(201).json({
      message: "สมัครสมาชิกสำเร็จ กรุณากรอกรหัส OTP 6 หลักที่ส่งไปยังอีเมลของคุณเพื่อยืนยันตัวตน",
      userId: newUser.id,
      username: cleanUsername,
      email,
    });
  } catch (err) {
    if (err.status) {
      logErrorToTerminal(new Error(err.message), req);
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/auth/otp/resend
// ----------------------------------------------------------------
async function resendOtp(req, res, next) {
  const { email, purpose = "register_verify" } = req.body;
  if (!email) return res.status(400).json({ error: "กรุณาระบุอีเมล" });
  try {
    const { data: rows } = await supabase.from("users").select("id").eq("university_email", email.toLowerCase().trim()).limit(1);
    await throttleOtpRequests(email, req.ip);
    await issueOtp(email, rows?.[0]?.id || null, purpose);
    res.json({ message: "ส่งรหัส OTP ใหม่เรียบร้อยแล้ว (หมดอายุใน 5 นาที)" });
  } catch (err) {
    if (err.status) {
      logErrorToTerminal(new Error(err.message), req);
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/auth/otp/verify
// ----------------------------------------------------------------
async function verifyOtp(req, res, next) {
  const { email, code, purpose = "register_verify" } = req.body;
  if (!email || !code) return res.status(400).json({ error: "กรุณาระบุอีเมลและรหัส OTP" });

  try {
    const cleanEmail = email.toLowerCase().trim();
    const cleanCode = String(code).trim();
    const inputHash = hashOtp(cleanCode);

    // ดึง OTP ทั้งหมดของอีเมลนี้และ purpose นี้ที่ยังไม่ได้ถูกใช้
    const { data: rows, error: qErr } = await supabase
      .from("otp_codes")
      .select("*")
      .eq("email", cleanEmail)
      .eq("purpose", purpose)
      .is("consumed_at", null)
      .order("created_at", { ascending: false });

    if (qErr) throw qErr;

    if (!rows || rows.length === 0) {
      const err = new Error("ไม่พบรหัส OTP หรือรหัสถูกใช้งานไปแล้ว กรุณากดขอรหัสใหม่");
      err.statusCode = 400;
      logErrorToTerminal(err, req);
      return res.status(400).json({ error: err.message });
    }

    // ตรวจสอบว่ามี record ใดที่ code_hash ตรง และยังไม่หมดอายุ (อายุ 5 นาที) และยังไม่เกิน max_attempts
    const now = new Date();
    const matchingRecord = rows.find(
      (r) => r.code_hash === inputHash && new Date(r.expires_at) >= now && (r.attempt_count || 0) < r.max_attempts
    );

    if (!matchingRecord) {
      // ตรวจสอบว่าเพราะอะไร
      const latest = rows[0];
      if (new Date(latest.expires_at) < now) {
        const err = new Error("รหัส OTP หมดอายุแล้ว (อายุการใช้งาน 5 นาที) กรุณากดขอรหัสใหม่");
        err.statusCode = 400;
        logErrorToTerminal(err, req);
        return res.status(400).json({ error: err.message });
      }

      if ((latest.attempt_count || 0) >= latest.max_attempts) {
        const err = new Error("กรอกรหัสผิดเกิน 5 ครั้ง ระบบได้ล็อกชั่วคราว กรุณาขอรหัสใหม่");
        err.statusCode = 423;
        logErrorToTerminal(err, req);
        return res.status(423).json({ error: err.message });
      }

      // เพิ่มจำนวนครั้งที่กรอกผิดใน record ล่าสุด
      await supabase.from("otp_codes").update({ attempt_count: (latest.attempt_count || 0) + 1 }).eq("id", latest.id);
      const attemptsLeft = latest.max_attempts - ((latest.attempt_count || 0) + 1);
      const err = new Error(`รหัส OTP ไม่ถูกต้อง (เหลือโอกาสอีก ${Math.max(0, attemptsLeft)} ครั้ง)`);
      err.statusCode = 400;
      logErrorToTerminal(err, req);
      return res.status(400).json({ error: err.message, attemptsLeft: Math.max(0, attemptsLeft) });
    }

    // ทำเครื่องหมาย consumed_at สำหรับ record ที่ถูกต้อง
    await supabase.from("otp_codes").update({ consumed_at: new Date().toISOString() }).eq("id", matchingRecord.id);

    if (purpose === "register_verify") {
      await supabase
        .from("users")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("university_email", cleanEmail);
    }

    const { data: userRaw } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, avatar_url, profile_image_url,
        email_verified_at, faculties(name), majors(name)
      `)
      .eq("university_email", cleanEmail)
      .maybeSingle();

    const formatted = userRaw ? formatUser(userRaw) : null;

    // สร้าง resetToken สำหรับ password_reset
    let resetToken = null;
    if (purpose === "password_reset" && userRaw) {
      resetToken = jwt.sign(
        { sub: userRaw.id, email: cleanEmail, purpose: "password_reset" },
        JWT_SECRET,
        { expiresIn: "15m", issuer: "campus-market-user" }
      );
    }

    const token = userRaw
      ? jwt.sign({ sub: userRaw.id }, JWT_SECRET, { expiresIn: "7d", issuer: "campus-market-user" })
      : null;

    res.json({
      message: "ยืนยันตัวตนสำเร็จ",
      token,
      resetToken,
      user: formatted
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/auth/login
// ----------------------------------------------------------------
async function login(req, res, next) {
  const { identifier, email, password, deviceName, browser } = req.body;
  const loginInput = (identifier || email || "").trim();

  if (!loginInput || !password)
    return res.status(400).json({ error: "กรุณากรอกชื่อผู้ใช้/รหัสนักศึกษา/อีเมล และรหัสผ่าน" });

  try {
    // 1. Check Admin (email login only)
    if (loginInput.includes("@")) {
      const { data: adminRows } = await supabase
        .from("admins")
        .select("*")
        .eq("email", loginInput.toLowerCase())
        .limit(1);

      const admin = adminRows?.[0];
      if (admin && admin.is_active && (await bcrypt.compare(password, admin.password_hash))) {
        await supabase.from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);

        const refreshToken = crypto.randomBytes(48).toString("hex");
        const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

        await supabase.from("admin_sessions").insert({
          admin_id: admin.id,
          refresh_token_hash: refreshHash,
          ip_address: req.ip,
          user_agent: req.headers["user-agent"] || null,
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        });

        const accessToken = jwt.sign(
          { sub: admin.id, role: admin.role, email: admin.email, fullName: admin.full_name },
          ADMIN_JWT_SECRET,
          { expiresIn: "8h", issuer: "campus-market-admin" }
        );

        await logAdminAction(admin.id, "auth.login", "admin", admin.id, { email: admin.email }, req.ip);

        return res.json({
          isAdmin: true,
          accessToken,
          refreshToken,
          role: admin.role,
          fullName: admin.full_name,
          email: admin.email,
          mustChangePassword: admin.must_change_password,
        });
      }
    }

    // 2. Regular user login (studentId, email, or username)
    const isStudentId = isValidStudentId(loginInput);
    let userQuery = supabase.from("users").select(`
      id, username, full_name, university_email, student_id, faculty_id, major_id,
      phone, password_hash, role, trust_score, status, ban_reason, successful_deal_count,
      average_rating, review_count, avatar_url, profile_image_url, last_seen_at,
      email_verified_at, created_at, updated_at, faculties(id, name, code), majors(id, name, code)
    `);

    if (isStudentId) {
      userQuery = userQuery.eq("student_id", loginInput);
    } else if (loginInput.includes("@")) {
      userQuery = userQuery.eq("university_email", loginInput.toLowerCase());
    } else {
      userQuery = userQuery.eq("username", loginInput);
    }
    const { data: userRows } = await userQuery.limit(1);

    const user = userRows?.[0];
    const valid = user && (await bcrypt.compare(password, user.password_hash));

    await supabase.from("login_attempts").insert({ email: loginInput, ip_address: req.ip, success: !!valid });

    if (!valid) return res.status(401).json({ error: "ชื่อผู้ใช้/รหัสนักศึกษา/อีเมล หรือรหัสผ่านไม่ถูกต้อง" });
    if (user.status === "banned") return res.status(403).json({ error: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
    if (user.status && user.status !== "active") return res.status(403).json({ error: "บัญชีนี้ไม่ได้อยู่ในสถานะพร้อมใช้งาน" });

    const refreshToken = crypto.randomBytes(48).toString("hex");
    const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    await supabase.from("sessions").insert({
      user_id: user.id,
      refresh_token_hash: refreshHash,
      device_name: deviceName || "Web Browser",
      browser: browser || "Standard",
      ip_address: req.ip,
      is_new_device: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await supabase.from("users").update({
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq("id", user.id);

    // ดึงรายการหมวดหมู่ที่ผู้ใช้เคยเลือกไว้ (User Interests)
    const { data: interestRows } = await supabase
      .from("user_interests")
      .select("category_id")
      .eq("user_id", user.id);

    const userInterests = (interestRows || []).map((r) => r.category_id);

    const formattedUser = formatUser(user);

    const accessToken = jwt.sign(
      { sub: user.id, email: formattedUser.email, displayName: formattedUser.displayName, username: user.username },
      JWT_SECRET,
      { expiresIn: "7d", issuer: "campus-market-user" }
    );

    const isAdminUser = user.role === "admin";

    res.json({
      isAdmin: isAdminUser,
      accessToken,
      refreshToken,
      user: {
        ...formattedUser,
        interests: userInterests,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/auth/forgot-password
// ----------------------------------------------------------------
async function forgotPassword(req, res, next) {
  const safeMessage = "หากอีเมลนี้ลงทะเบียนไว้ เราได้ส่งรหัส OTP สำหรับรีเซ็ตรหัสผ่านไปให้แล้ว";
  const { email } = req.body;
  if (!email) return res.json({ message: safeMessage });

  try {
    const { data: rows } = await supabase
      .from("users")
      .select("id")
      .eq("university_email", email.toLowerCase().trim())
      .limit(1);

    if (rows?.[0]) {
      await throttleOtpRequests(email, req.ip);
      await issueOtp(email, rows[0].id, "password_reset");
    }
    res.json({ message: safeMessage });
  } catch {
    res.json({ message: safeMessage });
  }
}

// ----------------------------------------------------------------
// POST /api/auth/reset-password
// ----------------------------------------------------------------
async function resetPassword(req, res, next) {
  const token = req.body.token || req.body.resetToken;
  const { newPassword } = req.body;
  try {
    if (!token) return res.status(400).json({ error: "ต้องใช้โทเคนที่ได้จากการยืนยัน OTP" });
    if (!isStrongUserPassword(newPassword))
      return res.status(400).json({ error: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษรและประกอบด้วยตัวอักษรและตัวเลข" });

    let userId = null;

    // 1. ตรวจสอบโทเคนแบบ JWT
    try {
      const decoded = jwt.verify(token, JWT_SECRET, { issuer: "campus-market-user" });
      if (decoded && decoded.purpose === "password_reset" && decoded.sub) {
        userId = decoded.sub;
      }
    } catch (jwtErr) {
      // fallback
    }

    // 2. Fallback
    if (!userId) {
      try {
        const tokenHash = hashResetToken(token);
        const { data: rows } = await supabase
          .from("password_reset_tokens")
          .select("*")
          .eq("token_hash", tokenHash)
          .is("used_at", null)
          .limit(1);

        const record = rows?.[0];
        if (record && new Date(record.expires_at) >= new Date()) {
          userId = record.user_id;
          await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", record.id);
        }
      } catch (tableErr) {
        // table not present
      }
    }

    if (!userId) {
      return res.status(400).json({ error: "รหัสโทเคนรีเซ็ตหมดอายุหรือไม่ถูกต้อง กรุณาทำรายการขอ OTP ใหม่" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const { error: upErr } = await supabase.from("users").update({ password_hash: passwordHash }).eq("id", userId);
    if (upErr) throw upErr;

    // ยกเลิก session เดิมทั้งหมดเพื่อความปลอดภัย
    await supabase.from("sessions").update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId).is("revoked_at", null);

    res.json({ message: "ตั้งรหัสผ่านใหม่สำเร็จแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/auth/logout
// ----------------------------------------------------------------
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
      await supabase.from("sessions").update({ revoked_at: new Date().toISOString() })
        .eq("refresh_token_hash", refreshHash);
    }
    res.json({ message: "ออกจากระบบเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/auth/me (Protected)
// ----------------------------------------------------------------
async function getMe(req, res, next) {
  try {
    if (req.user?.role === "admin") {
      return res.json({
        user: {
          id: req.user.id,
          name: req.user.full_name || "ผู้ดูแลระบบ RMUTI",
          displayName: req.user.display_name || req.user.full_name || "ผู้ดูแลระบบ",
          fullName: req.user.full_name,
          email: req.user.email,
          role: "admin",
        },
      });
    }

    const { data: rawUser, error } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, ban_reason, successful_deal_count,
        average_rating, review_count, avatar_url, profile_image_url,
        last_seen_at, email_verified_at, created_at, updated_at,
        faculties(id, name, code), majors(id, name, code)
      `)
      .eq("id", req.user.id)
      .single();

    if (error) throw error;
    res.json({ user: formatUser(rawUser) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFacultiesAndMajors, register, resendOtp, verifyOtp,
  login, forgotPassword, resetPassword, logout, getMe,
};