const { supabase } = require("../config/db");
const { sendSuccess, sendError } = require("../utils/response");
const { deleteConversations } = require("./chatController");
const { formatUser, formatStatus, formatCategory, getStatusId } = require("../utils/statusHelper");

// Helper: บันทึกประวัติการทำงานของแอดมิน
async function logAdminAction(adminId, action, targetType, targetId, details, ip) {
  try {
    await supabase.from("admin_audit_log").insert({
      admin_id: adminId || null,
      action,
      target_type: targetType,
      target_id: String(targetId),
      details: typeof details === "object" ? details : { info: details },
      ip_address: ip || null,
    });
  } catch (err) {
    console.warn("[logAdminAction] error:", err.message);
  }
}

// ----------------------------------------------------------------
// GET /api/admin/stats
// ----------------------------------------------------------------
async function getStats(req, res, next) {
  try {
    const [
      { count: totalUsers },
      { count: bannedUsers },
      { count: verifiedUsers },
      { count: activeListings },
      { count: soldListings },
      { count: totalTransactions },
      { count: openReports },
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }).neq("role", "admin"),
      supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "banned"),
      supabase.from("users").select("*", { count: "exact", head: true }).not("email_verified_at", "is", null),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status_id", 1),
      supabase.from("products").select("*", { count: "exact", head: true }).eq("status_id", 3),
      supabase.from("transactions").select("*", { count: "exact", head: true }),
      supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
    ]);

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newUsers7d } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekAgo);

    res.json({
      stats: {
        totalUsers: totalUsers || 0,
        bannedUsers: bannedUsers || 0,
        verifiedUsers: verifiedUsers || 0,
        pendingVerifications: 0,
        activeListings: activeListings || 0,
        soldListings: soldListings || 0,
        totalTransactions: totalTransactions || 0,
        openReports: openReports || 0,
        newUsers7d: newUsers7d || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/admin/seller-stats
// ----------------------------------------------------------------
async function getSellerLeaderboard(req, res, next) {
  try {
    const { limit = 20 } = req.query;

    const completedStatusId = getStatusId("transaction_status", "COMPLETED") || 3;

    const { data: txns, error: txErr } = await supabase
      .from("transactions")
      .select("seller_id, products(price)")
      .eq("status_id", completedStatusId);
    if (txErr) throw txErr;

    const { data: users, error: uErr } = await supabase
      .from("users")
      .select("id, full_name, username, trust_score, status, faculties(name)")
      .neq("role", "admin");
    if (uErr) throw uErr;

    const salesMap = {};
    (txns || []).forEach((t) => {
      if (!salesMap[t.seller_id]) salesMap[t.seller_id] = { dealCount: 0, revenue: 0 };
      salesMap[t.seller_id].dealCount += 1;
      salesMap[t.seller_id].revenue += Number(t.products?.price) || 0;
    });

    const leaderboard = (users || [])
      .map((u) => ({
        id: u.id,
        name: u.full_name || u.username,
        faculty: u.faculties?.name || "",
        trustScore: u.trust_score ?? 100,
        status: u.status,
        dealCount: salesMap[u.id]?.dealCount || 0,
        revenue: salesMap[u.id]?.revenue || 0,
      }))
      .sort((a, b) => b.dealCount - a.dealCount || b.revenue - a.revenue)
      .slice(0, parseInt(limit));

    res.json({ topSellers: leaderboard });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/admin/users
// ----------------------------------------------------------------
async function getUsers(req, res, next) {
  try {
    const { q = "", status = "", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, ban_reason, successful_deal_count,
        average_rating, review_count, avatar_url, profile_image_url,
        last_seen_at, email_verified_at, created_at, updated_at,
        faculties(name), majors(name)
      `, { count: "exact" })
      .neq("role", "admin");

    if (q) {
      const cleanQ = q.trim();
      query = query.or(`username.ilike.%${cleanQ}%,full_name.ilike.%${cleanQ}%,student_id.ilike.%${cleanQ}%,university_email.ilike.%${cleanQ}%`);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const formattedUsers = (data || []).map(formatUser);
    res.json({ users: formattedUsers, total: count ?? formattedUsers.length, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/admin/users/:userId
// ----------------------------------------------------------------
async function getUserDetail(req, res, next) {
  try {
    const { userId } = req.params;
    const targetUid = parseInt(userId);
    if (isNaN(targetUid)) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const { data: userRaw, error } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, ban_reason, successful_deal_count,
        average_rating, review_count, avatar_url, profile_image_url,
        last_seen_at, email_verified_at, created_at, updated_at,
        faculties(name), majors(name)
      `)
      .eq("id", targetUid)
      .maybeSingle();

    if (error || !userRaw) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
    const user = formatUser(userRaw);

    // Products
    const { data: prods } = await supabase
      .from("products")
      .select(`
        id, title, price, status_id, condition_id, created_at,
        categories(id, name),
        product_images(id, image_url, is_primary)
      `)
      .eq("seller_id", targetUid)
      .order("created_at", { ascending: false });

    // Penalties & History
    const { data: penalties } = await supabase
      .from("user_penalties")
      .select(`id, reason, created_at, penalty_rules(action_type, points_deducted, description)`)
      .eq("user_id", targetUid)
      .order("created_at", { ascending: false });

    const { data: scoreHistory } = await supabase
      .from("user_score_history")
      .select("*")
      .eq("user_id", targetUid)
      .order("created_at", { ascending: false });

    res.json({
      user,
      products: prods || [],
      listings: prods || [],
      penalties: penalties || [],
      scoreHistory: scoreHistory || [],
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/admin/users/:userId/ban
// ----------------------------------------------------------------
async function banUser(req, res, next) {
  try {
    const { userId } = req.params;
    const targetUid = parseInt(userId);
    const { reason = "ระงับบัญชีโดยผู้ดูแลระบบ" } = req.body;

    const { error } = await supabase
      .from("users")
      .update({
        status: "banned",
        ban_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUid);

    if (error) throw error;

    await logAdminAction(req.admin?.id, "user.ban", "user", targetUid, { reason }, req.ip);

    res.json({ message: "ระงับบัญชีสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/admin/users/:userId/unban
// ----------------------------------------------------------------
async function unbanUser(req, res, next) {
  try {
    const { userId } = req.params;
    const targetUid = parseInt(userId);

    const { error } = await supabase
      .from("users")
      .update({
        status: "active",
        ban_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetUid);

    if (error) throw error;

    await logAdminAction(req.admin?.id, "user.unban", "user", targetUid, {}, req.ip);

    res.json({ message: "ปลดล็อกบัญชีสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// DELETE /api/admin/users/:userId
// ----------------------------------------------------------------
async function deleteUser(req, res, next) {
  try {
    const { userId } = req.params;
    const targetUid = parseInt(userId);
    const { reason = "ลบบัญชีโดยผู้ดูแลระบบ" } = req.body;

    await supabase.from("users").update({ status: "banned", ban_reason: reason }).eq("id", targetUid);
    await logAdminAction(req.admin?.id, "user.delete", "user", targetUid, { reason }, req.ip);

    res.json({ message: "ลบบัญชีผู้ใช้สำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/admin/listings
// ----------------------------------------------------------------
async function getAdminListings(req, res, next) {
  try {
    const { q = "", status = "", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("products")
      .select(`
        id, title, price, description, view_count, created_at, updated_at,
        category_id, condition_id, status_id, seller_id,
        categories(id, name),
        product_conditions(id, name),
        product_status(id, name),
        users!seller_id(
          id, username, full_name, profile_image_url, avatar_url,
          faculty_id, major_id, trust_score, faculties(name), majors(name)
        ),
        product_images(id, image_url, is_primary)
      `, { count: "exact" });

    if (q) {
      const cleanQ = q.trim();
      query = query.or(`title.ilike.%${cleanQ}%,description.ilike.%${cleanQ}%`);
    }

    if (status && status !== "all") {
      const statusId = getStatusId("product_status", status);
      if (statusId) query = query.eq("status_id", statusId);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const listings = (data || []).map((p) => {
      const seller = p.users ? formatUser(p.users) : {};
      const prodStatus = formatStatus("product_status", p.product_status || p.status_id);
      const cond = formatStatus("product_conditions", p.product_conditions || p.condition_id);
      const cat = formatCategory(p.categories);
      const images = (p.product_images || []).map((img, i) => ({
        id: img.id,
        url: img.image_url,
        imageUrl: img.image_url,
        is_cover: img.is_primary ?? (i === 0),
        isCover: img.is_primary ?? (i === 0),
      }));

      const conditionName = p.product_conditions?.name || cond.name || (p.condition_id === 1 ? "มือหนึ่ง" : "มือสอง");

      return {
        id: String(p.id),
        title: p.title,
        price: parseFloat(p.price || 0),
        description: p.description,
        status: prodStatus.ui,
        statusCode: prodStatus.code,
        statusName: prodStatus.name,
        condition: cond.name.includes("หนึ่ง") ? "new" : "used_good",
        condition_id: p.condition_id,
        conditionName,
        condition_name: conditionName,
        product_conditions: p.product_conditions || { id: p.condition_id, name: conditionName },
        category_id: p.category_id,
        categories: cat,
        view_count: p.view_count || 0,
        created_at: p.created_at,
        users: seller,
        seller,
        images,
        listing_images: images,
      };
    });

    res.json({ listings, total: count ?? listings.length, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// DELETE /api/admin/listings/:id
// ----------------------------------------------------------------
async function deleteListing(req, res, next) {
  try {
    const { id } = req.params;
    const prodId = parseInt(id);
    const { reason = "ลบโดยผู้ดูแลระบบ" } = req.body;

    const { data: convs } = await supabase.from("conversations").select("id").eq("product_id", prodId);
    if (convs?.length) await deleteConversations(convs.map((c) => c.id));

    await supabase.from("wishlists").delete().eq("listing_id", prodId);
    await supabase.from("reports").delete().eq("target_type", "product").eq("target_id", prodId);
    await supabase.from("product_images").delete().eq("product_id", prodId);

    const { error } = await supabase.from("products").delete().eq("id", prodId);
    if (error) throw error;

    await logAdminAction(req.admin?.id, "listing.delete", "product", prodId, { reason }, req.ip);

    res.json({ message: "ลบสินค้าสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

async function removeListing(req, res, next) {
  return deleteListing(req, res, next);
}

async function restoreListing(req, res, next) {
  try {
    const { id } = req.params;
    const prodId = parseInt(id);
    await supabase.from("products").update({ status_id: 1 }).eq("id", prodId);
    res.json({ message: "กู้คืนสินค้าสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/admin/reviews
// ----------------------------------------------------------------
async function getAdminReviews(req, res, next) {
  try {
    const { q = "", rating = "", page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("reviews")
      .select(`
        id, transaction_id, reviewer_id, reviewee_id, rating, comment, created_at, updated_at,
        reviewer:users!reviewer_id(id, username, full_name, avatar_url, profile_image_url),
        reviewee:users!reviewee_id(id, username, full_name, avatar_url, profile_image_url),
        images:review_images(id, image_url),
        transactions(id, buyer_id, seller_id, products(id, title, price))
      `, { count: "exact" });

    if (q) {
      query = query.ilike("comment", `%${q.trim()}%`);
    }

    if (rating) {
      query = query.eq("rating", parseInt(rating));
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const reviews = (data || []).map((r) => {
      const reviewer = r.reviewer ? formatUser(r.reviewer) : {};
      const reviewee = r.reviewee ? formatUser(r.reviewee) : {};
      const prod = r.transactions?.products || {};

      return {
        id: r.id,
        transaction_id: r.transaction_id,
        rating: r.rating,
        comment: r.comment || "",
        created_at: r.created_at,
        product_title: prod.title || "สินค้า",
        reviewer: {
          id: reviewer.id,
          display_name: reviewer.displayName || reviewer.username,
          avatar_url: reviewer.avatarUrl,
        },
        reviewee: {
          id: reviewee.id,
          display_name: reviewee.displayName || reviewee.username,
          avatar_url: reviewee.avatarUrl,
        },
        images: (r.images || []).map((img) => img.image_url),
      };
    });

    res.json({ reviews, total: count ?? reviews.length, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// DELETE /api/admin/reviews/:id
// ----------------------------------------------------------------
async function deleteReview(req, res, next) {
  try {
    const { id } = req.params;
    const revId = parseInt(id);
    const { reason = "ลบโดยผู้ดูแลระบบ" } = req.body;

    const { data: rev } = await supabase.from("reviews").select("id, reviewee_id").eq("id", revId).single();
    if (!rev) return res.status(404).json({ error: "ไม่พบรีวิว" });

    await supabase.from("review_images").delete().eq("review_id", revId);
    await supabase.from("reviews").delete().eq("id", revId);

    // Recalculate reviewee rating
    const { data: allRevs } = await supabase.from("reviews").select("rating").eq("reviewee_id", rev.reviewee_id);
    const avg = allRevs?.length ? allRevs.reduce((s, r) => s + r.rating, 0) / allRevs.length : 0;
    await supabase.from("users").update({
      average_rating: parseFloat(avg.toFixed(2)),
      review_count: allRevs?.length || 0,
    }).eq("id", rev.reviewee_id);

    await logAdminAction(req.admin?.id, "review.delete", "review", revId, { reason }, req.ip);

    res.json({ message: "ลบรีวิวสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// Reports
// ----------------------------------------------------------------
const reportCtrl = require("./reportController");
const getReports = reportCtrl.getReports;
const resolveReport = reportCtrl.resolveReport;

// ----------------------------------------------------------------
// GET /api/admin/audit-log
// ----------------------------------------------------------------
async function getAuditLog(req, res, next) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data, error, count } = await supabase
      .from("admin_audit_log")
      .select(`
        id, admin_id, action, target_type, target_id, details, ip_address, created_at,
        admins(id, full_name, email)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;
    res.json({ logs: data || [], total: count ?? (data?.length || 0) });
  } catch (err) {
    next(err);
  }
}

// Verifications stubs (student_card_verifications not in 39-table schema)
async function getPendingVerifications(req, res) {
  res.json({ verifications: [] });
}
async function approveVerification(req, res) {
  res.json({ message: "อนุมัติเรียบร้อยแล้ว" });
}
async function rejectVerification(req, res) {
  res.json({ message: "ปฏิเสธเรียบร้อยแล้ว" });
}

module.exports = {
  getStats,
  getSellerLeaderboard,
  getUsers,
  getUserDetail,
  banUser,
  unbanUser,
  deleteUser,
  getAdminListings,
  deleteListing,
  removeListing,
  restoreListing,
  getAdminReviews,
  deleteReview,
  getReports,
  resolveReport,
  getAuditLog,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
};