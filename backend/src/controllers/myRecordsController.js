const { supabase } = require("../config/db");

// ----------------------------------------------------------------
// ค่าคงที่ (ให้ตรงกับส่วนอื่นของระบบ)
// ----------------------------------------------------------------
// คะแนนขั้นต่ำที่ทำธุรกรรมได้ (ตรงกับ middleware trustGuard / กติกาของระบบ)
const TRUST_MIN_TO_TRANSACT = 50;
// คะแนนที่ผู้ขายได้เมื่อปิดดีลสำเร็จ (ตรงกับ recoverScoreOnDeal ใน meetupController)
const DEAL_REWARD_POINTS = 20;

const SOURCE_TYPE_BY_FILTER = {
  penalty: "PENALTY",
  recovery: "RECOVERY",
  admin: "ADMIN_ADJUST",
};

const PENALTY_LABELS = {
  NO_SHOW: "ไม่มาตามนัด",
  LATE_CANCEL: "ยกเลิกนัดกระชั้นชิด",
  OTHER: "ความผิดอื่นๆ",
};

const REPORT_CATEGORY_LABELS = {
  SCAM: "โกง/มิจฉาชีพ",
  FAKE_ITEM: "สินค้าปลอม",
  HARASSMENT: "คุกคาม/ก่อกวน",
  SPAM: "สแปม",
  INAPPROPRIATE: "เนื้อหาไม่เหมาะสม",
  OTHER: "อื่นๆ",
};

const REPORT_TARGET_LABELS = {
  product: "สินค้า",
  wanted_post: "โพสตามหาสินค้า",
};

function firstOf(v) {
  return Array.isArray(v) ? v[0] : v;
}

// แปลงรายการในสมุดคะแนนให้เป็นข้อความที่ผู้ใช้อ่านเข้าใจ
function describeScoreEntry(row) {
  const reason = String(row.reason || "").trim();
  const type = row.source_type;

  if (type === "RECOVERY") {
    if (reason === "SUCCESSFUL_DEAL") {
      return { title: "ปิดดีลสำเร็จ", detail: "ได้รับคะแนนจากการขายสินค้าสำเร็จ" };
    }
    if (reason === "WEEKLY_RECOVERY") {
      return { title: "คืนคะแนนรายสัปดาห์", detail: "ระบบคืนคะแนนให้ตามกฎการฟื้นฟูคะแนน" };
    }
    return { title: "ได้รับคะแนนคืน", detail: reason || null };
  }

  if (type === "ADMIN_ADJUST") {
    return { title: "แอดมินปรับคะแนน", detail: reason || null };
  }

  // PENALTY
  if (reason === "NO_SHOW" || reason.includes("ไม่มา") || /no-?show/i.test(reason)) {
    return { title: "ไม่มาตามนัด", detail: reason === "NO_SHOW" ? null : reason };
  }
  if (reason === "LATE_CANCEL" || reason.startsWith("ยกเลิกนัด")) {
    return {
      title: "ยกเลิกนัดกระชั้นชิด",
      detail: reason === "LATE_CANCEL" ? "ยกเลิกนัดที่ยืนยันแล้วก่อนเวลานัดไม่นาน" : reason,
    };
  }
  return { title: "ถูกหักคะแนน", detail: reason || null };
}

// ทำให้สถานะ ticket เป็น pending / in_progress / resolved / dismissed ไม่ว่า code ใน DB จะตั้งชื่อว่าอะไร
// (OPEN -> pending, IN_PROGRESS -> in_progress, RESOLVED -> resolved)
function normalizeTicketStatus(code, name) {
  const s = `${code || ""} ${name || ""}`.toLowerCase();
  if (/(dismiss|ignor|reject|เพิกเฉย|ปฏิเสธ)/.test(s)) return "dismissed";
  if (/(in_progress|in-progress|progress|กำลัง)/.test(s)) return "in_progress";
  if (/(resolv|done|complete|closed|แล้ว|เสร็จ|ปิด)/.test(s)) return "resolved";
  return "pending";
}

const TICKET_STATUS_LABELS = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  resolved: "แก้ไขแล้ว",
  dismissed: "เพิกเฉย",
};

const REPORT_STATUS_LABELS = {
  pending: "รอดำเนินการ",
  resolved: "จัดการแล้ว",
  dismissed: "เพิกเฉย",
};

function toTime(v) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

// ----------------------------------------------------------------
// GET /api/me/score — คะแนนความน่าเชื่อถือของฉัน + ประวัติการได้/เสียคะแนน
// query: page, limit, type = all | penalty | recovery | admin
// ----------------------------------------------------------------
async function getMyScore(req, res, next) {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const type = String(req.query.type || "all").toLowerCase();

    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("trust_score, status, ban_reason")
      .eq("id", userId)
      .single();
    if (uErr || !user) {
      return res.status(404).json({ error: "ไม่พบผู้ใช้" });
    }

    let historyQuery = supabase
      .from("user_score_history")
      .select("id, change_amount, score_after, source_type, reason, created_at", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    if (SOURCE_TYPE_BY_FILTER[type]) {
      historyQuery = historyQuery.eq("source_type", SOURCE_TYPE_BY_FILTER[type]);
    }

    const [historyRes, totalsRes, penaltyRulesRes, recoveryRulesRes] = await Promise.all([
      historyQuery,
      supabase
        .from("user_score_history")
        .select("change_amount, source_type")
        .eq("user_id", userId)
        .limit(5000),
      supabase.from("penalty_rules").select("*").eq("is_active", true).order("id"),
      supabase.from("recovery_rules").select("*").eq("is_active", true).order("id"),
    ]);

    if (historyRes.error) throw historyRes.error;

    // สรุปยอดรวมทั้งหมด (ไม่ขึ้นกับตัวกรอง)
    let totalGained = 0;
    let totalLost = 0;
    let penaltyCount = 0;
    for (const r of totalsRes.data || []) {
      const n = Number(r.change_amount) || 0;
      if (n > 0) totalGained += n;
      else totalLost += -n;
      if (r.source_type === "PENALTY") penaltyCount += 1;
    }

    const penalties = (penaltyRulesRes.data || []).map((r) => ({
      id: r.id,
      actionType: r.action_type,
      label: PENALTY_LABELS[r.action_type] || r.action_type,
      pointsDeducted: r.points_deducted,
      thresholdMinutes: r.threshold_minutes ?? null,
      description: r.description || null,
    }));

    const recoveries = (recoveryRulesRes.data || []).map((r) => ({
      id: r.id,
      name: r.rule_name,
      daysRequired: r.days_required,
      dealsRequired: r.deals_required,
      pointsRecovered: r.points_recovered,
      description: r.description || null,
    }));

    const rows = historyRes.data || [];
    const total = historyRes.count ?? rows.length;
    const score = user.trust_score ?? 100;

    res.json({
      trustScore: score,
      status: user.status,
      banReason: user.ban_reason || null,
      minToTransact: TRUST_MIN_TO_TRANSACT,
      canTransact: user.status === "active" && score >= TRUST_MIN_TO_TRANSACT,
      summary: { totalGained, totalLost, penaltyCount },
      rules: { penalties, recoveries, dealRewardPoints: DEAL_REWARD_POINTS },
      history: rows.map((r) => {
        const d = describeScoreEntry(r);
        return {
          id: r.id,
          changeAmount: r.change_amount,
          scoreAfter: r.score_after,
          sourceType: r.source_type,
          title: d.title,
          detail: d.detail,
          createdAt: r.created_at,
        };
      }),
      pagination: { page, limit, total, hasMore: offset + rows.length < total },
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/me/reports — สิ่งที่ฉันเคยแจ้งแอดมิน (ศูนย์ช่วยเหลือ + รายงานประกาศ)
// เก็บถาวร: แอดมินจัดการแล้วก็ยังอยู่ในประวัติ
// ----------------------------------------------------------------
async function getMyReports(req, res, next) {
  try {
    const userId = req.user.id;

    const [ticketsRes, reportsRes] = await Promise.all([
      supabase
        .from("support_tickets")
        .select(
          "id, subject, message, created_at, updated_at, resolved_at, support_categories(name), support_ticket_status(code, name)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("reports")
        .select(
          "id, target_type, target_id, target_title, category, description, status, admin_note, resolved_at, created_at"
        )
        .eq("reporter_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (ticketsRes.error) throw ticketsRes.error;
    if (reportsRes.error) throw reportsRes.error;

    const tickets = (ticketsRes.data || []).map((t) => {
      const cat = firstOf(t.support_categories);
      const st = firstOf(t.support_ticket_status);
      const status = normalizeTicketStatus(st?.code, st?.name);
      return {
        key: `support-${t.id}`,
        kind: "support",
        id: t.id,
        category: cat?.name || null,
        title: t.subject,
        message: t.message,
        targetLabel: null,
        status,
        statusLabel: st?.name || TICKET_STATUS_LABELS[status],
        adminNote: null,
        createdAt: t.created_at,
        updatedAt: t.updated_at || null,
        resolvedAt: t.resolved_at,
      };
    });

    const reports = (reportsRes.data || []).map((r) => {
      const status = ["pending", "resolved", "dismissed"].includes(r.status) ? r.status : "pending";
      const targetLabel = REPORT_TARGET_LABELS[r.target_type] || "ประกาศ";
      return {
        key: `report-${r.id}`,
        kind: "report",
        id: r.id,
        category: REPORT_CATEGORY_LABELS[r.category] || r.category || null,
        title: r.target_title || `${targetLabel} #${r.target_id}`,
        message: r.description,
        targetLabel,
        status,
        statusLabel: REPORT_STATUS_LABELS[status],
        adminNote: r.admin_note || null,
        createdAt: r.created_at,
        updatedAt: null,
        resolvedAt: r.resolved_at,
      };
    });

    const items = [...tickets, ...reports].sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));

    const counts = { total: items.length, pending: 0, in_progress: 0, resolved: 0, dismissed: 0 };
    for (const it of items) counts[it.status] += 1;

    res.json({ items, counts });
  } catch (err) {
    next(err);
  }
}

module.exports = { getMyScore, getMyReports };