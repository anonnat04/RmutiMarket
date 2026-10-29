const { supabase } = require("../config/db");
const { deleteConversations } = require("./chatController");
const { formatUser } = require("../utils/statusHelper");

// ----------------------------------------------------------------
// POST /api/reports — ผู้ใช้รายงานสินค้าหรือโพสต์ตามหาที่ไม่เหมาะสม
// ----------------------------------------------------------------
async function createReport(req, res, next) {
  try {
    const {
      targetType, // 'product' | 'wanted_post'
      targetId,
      targetTitle,
      targetUserId,
      category,
      description,
    } = req.body;

    if (!category || !description) {
      return res.status(400).json({ error: "กรุณาระบุข้อมูลการรายงานให้ครบถ้วน (หัวข้อและรายละเอียด)" });
    }

    const type = targetType === "wanted_post" ? "wanted_post" : "product";
    const finalTargetId = parseInt(targetId) || Date.now();
    const reporterId = req.user?.id || null;
    const reporterName = req.user?.fullName || req.user?.username || "ผู้ใช้ในระบบ";
    const reporterEmail = req.user?.universityEmail || req.user?.email || "student@rmuti.ac.th";

    let resolvedTitle = targetTitle || "";
    let resolvedUserId = targetUserId ? parseInt(targetUserId) : null;

    if (!resolvedTitle || !resolvedUserId) {
      if (type === "product") {
        const { data: prod } = await supabase
          .from("products")
          .select("id, title, seller_id")
          .eq("id", finalTargetId)
          .maybeSingle();
        if (prod) {
          if (!resolvedTitle) resolvedTitle = prod.title;
          if (!resolvedUserId) resolvedUserId = prod.seller_id;
        }
      } else {
        const { data: wp } = await supabase
          .from("wanted_posts")
          .select("id, title, buyer_id")
          .eq("id", finalTargetId)
          .maybeSingle();
        if (wp) {
          if (!resolvedTitle) resolvedTitle = wp.title;
          if (!resolvedUserId) resolvedUserId = wp.buyer_id;
        }
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("reports")
      .insert({
        target_type: type,
        target_id: finalTargetId,
        target_title: resolvedTitle || (type === "product" ? `สินค้า #${finalTargetId}` : `โพสต์ #${finalTargetId}`),
        target_user_id: resolvedUserId,
        reporter_id: reporterId,
        reporter_name: reporterName,
        reporter_email: reporterEmail,
        category,
        description,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    res.status(201).json({
      message: "ส่งรายงานเรียบร้อยแล้ว ทีมผู้ดูแลระบบจะเร่งตรวจสอบ",
      report: inserted,
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/reports (หรือ GET /api/admin/reports) — ดึงรายการรายงาน
// ----------------------------------------------------------------
async function getReports(req, res, next) {
  try {
    const { status, targetType, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("reports")
      .select(`
        id, target_type, target_id, target_title, target_user_id,
        reporter_id, reporter_name, reporter_email, category, description,
        status, admin_note, resolved_by, resolved_at, created_at,
        target_user:users!target_user_id(id, username, full_name, avatar_url, profile_image_url),
        reporter:users!reporter_id(id, username, full_name, avatar_url, profile_image_url)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (targetType && targetType !== "all") {
      query = query.eq("target_type", targetType);
    }

    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const formatted = (data || []).map((r) => ({
      ...r,
      target_user_name: r.target_user ? (r.target_user.full_name || r.target_user.username) : null,
      targetUser: r.target_user ? formatUser(r.target_user) : null,
      reporterUser: r.reporter ? formatUser(r.reporter) : null,
    }));

    res.json({ reports: formatted, total: count || formatted.length });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PATCH /api/reports/:id/resolve — แอดมินจัดการสถานะรายงาน (resolved / dismissed)
// ----------------------------------------------------------------
async function resolveReport(req, res, next) {
  try {
    const { id } = req.params;
    const { status = "resolved", adminNote = "" } = req.body;

    const resolvedBy = req.admin?.id || req.user?.id || null;
    const now = new Date().toISOString();

    const finalStatus = (status === "resolved" || status === "dismissed") ? status : "resolved";

    const { error: repErr } = await supabase
      .from("reports")
      .update({
        status: finalStatus,
        admin_note: adminNote,
        resolved_by: resolvedBy,
        resolved_at: now,
      })
      .eq("id", id);

    if (repErr) throw repErr;

    res.json({ message: "อัปเดตสถานะรายงานเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/reports/:id/take-down — แอดมินสั่งปลด/ลบสินค้าหรือโพสต์ที่ถูกรายงาน
// ----------------------------------------------------------------
async function takeDownReportedItem(req, res, next) {
  try {
    const { id } = req.params;
    const { reason = "ละเมิดนโยบายความปลอดภัย / ไม่เหมาะสม" } = req.body;

    const { data: rep } = await supabase
      .from("reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!rep) {
      return res.status(404).json({ error: "ไม่พบข้อมูลรายการที่ถูกรายงาน" });
    }

    const { target_type, target_id } = rep;

    if (target_type === "product") {
      const prodId = parseInt(target_id);
      // ค้นหาและลบห้องแชท
      const { data: convs } = await supabase.from("conversations").select("id").eq("product_id", prodId);
      if (convs && convs.length > 0) {
        await deleteConversations(convs.map((c) => c.id));
      }
      await supabase.from("wishlists").delete().eq("listing_id", prodId);
      await supabase.from("product_images").delete().eq("product_id", prodId);
      await supabase.from("products").delete().eq("id", prodId);
    } else if (target_type === "wanted_post") {
      await supabase.from("wanted_posts").delete().eq("id", parseInt(target_id));
    }

    // Mark report as resolved
    await supabase
      .from("reports")
      .update({
        status: "resolved",
        admin_note: `ปลด/ลบ${target_type === "product" ? "สินค้า" : "โพสต์"}ออกจากระบบแล้ว (เหตุผล: ${reason})`,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id);

    res.json({ message: `ปลดและลบ${target_type === "product" ? "สินค้า" : "โพสต์"}ออกจากระบบเรียบร้อยแล้ว` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createReport,
  getReports,
  resolveReport,
  takeDownReportedItem,
};
