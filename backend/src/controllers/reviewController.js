const { supabase } = require("../config/db");
const { formatUser } = require("../utils/statusHelper");
const { recoverScoreOnDeal } = require("./meetupController");

// ----------------------------------------------------------------
// GET /api/reviews/user/:userId  — รีวิวของผู้ใช้
// ----------------------------------------------------------------
async function getUserReviews(req, res, next) {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data, error, count } = await supabase
      .from("reviews")
      .select(
        `
        id, transaction_id, reviewer_id, reviewee_id, rating, comment, created_at, updated_at,
        reviewer:users!reviewer_id(
          id, username, full_name, avatar_url, profile_image_url,
          faculty_id, major_id, email_verified_at, faculties(name), majors(name)
        ),
        images:review_images(id, image_url),
        transactions!inner(
          id, buyer_id, seller_id,
          products(id, title, price, product_images(image_url, is_primary))
        )
      `,
        { count: "exact" }
      )
      .eq("reviewee_id", userId)
      .eq("transactions.status_id", 3)
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    const reviews = (data || []).map((r) => {
      const u = r.reviewer ? formatUser(r.reviewer) : {};
      const txn = r.transactions || {};
      const prod = txn.products || {};
      const prodImgs = prod.product_images || [];
      const primaryImg = prodImgs.find((img) => img.is_primary)?.image_url || prodImgs[0]?.image_url || null;

      const reviewer_role =
        r.reviewer_id && txn.buyer_id
          ? Number(r.reviewer_id) === Number(txn.buyer_id)
            ? "ผู้ซื้อ"
            : "ผู้ขาย"
          : null;

      return {
        id: r.id,
        rating: r.rating,
        comment: r.comment || "",
        created_at: r.created_at,
        reviewer_role,
        images: (r.images || []).map((img) => img.image_url),
        product_title: prod.title || null,
        product_image: primaryImg,
        reviewer: {
          id: u.id,
          display_name: u.displayName || u.username || "ผู้ใช้งาน",
          displayName: u.displayName || u.username || "ผู้ใช้งาน",
          avatar_url: u.avatarUrl,
          avatarUrl: u.avatarUrl,
          verification_level: u.verificationLevel,
        },
      };
    });

    res.json({ reviews, total: count || 0 });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/reviews  — เขียนรีวิว
// ----------------------------------------------------------------
async function createReview(req, res, next) {
  try {
    const { transactionId, rating, comment, images = [] } = req.body;

    if (!transactionId || !rating)
      return res.status(400).json({ error: "กรุณาระบุ transaction และคะแนน" });

    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5)
      return res.status(400).json({ error: "คะแนนต้องอยู่ระหว่าง 1-5" });

    const { data: txn } = await supabase
      .from("transactions")
      .select("id, product_id, buyer_id, seller_id, status_id, buyer_received, seller_handed_over")
      .eq("id", transactionId)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการซื้อขาย" });

    // แปลงเป็น Number ทุกตัว กันเทียบ bigint/string ผิดชนิด
    const uid = Number(req.user.id);
    const buyerId = Number(txn.buyer_id);
    const sellerId = Number(txn.seller_id);

    const isBuyer = buyerId === uid;
    const isSeller = sellerId === uid;
    if (!isBuyer && !isSeller)
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในรายการนี้" });

    // รีวิวได้เมื่อ "ฝั่งตัวเอง" กดยืนยันรับ/ส่งมอบแล้วเท่านั้น
    const myConfirmed = isBuyer ? txn.buyer_received : txn.seller_handed_over;
    if (!myConfirmed) {
      console.log("[review] not confirmed", {
        uid, isBuyer, isSeller,
        buyer_received: txn.buyer_received,
        seller_handed_over: txn.seller_handed_over,
      });
      return res.status(400).json({ error: "คุณต้องกดยืนยันรับ/ส่งมอบสินค้าก่อน จึงจะสามารถรีวิวได้" });
    }

    // ผู้ถูกรีวิวคือ "อีกฝ่าย" เสมอ ไม่เชื่อค่าจาก client
    const revieweeId = isBuyer ? sellerId : buyerId;

    const { data: review, error } = await supabase
      .from("reviews")
      .insert({
        transaction_id: txn.id,
        reviewer_id: uid,
        reviewee_id: revieweeId,
        rating: numRating,
        comment: comment ? String(comment).trim() : null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "คุณรีวิวรายการนี้ไปแล้ว" });
      throw error;
    }

    if (images && Array.isArray(images) && images.length > 0) {
      const imgRows = images.filter(Boolean).map((url) => ({
        review_id: review.id,
        image_url: typeof url === "string" ? url : (url.url || url.imageUrl),
      }));
      if (imgRows.length > 0) {
        await supabase.from("review_images").insert(imgRows);
      }
    }

    const { data: revUser } = await supabase
      .from("users")
      .select("successful_deal_count")
      .eq("id", uid)
      .single();

    await supabase
      .from("users")
      .update({ successful_deal_count: (revUser?.successful_deal_count || 0) + 1 })
      .eq("id", uid);

    await recoverScoreOnDeal(uid, txn.id);

    const { data: ratings } = await supabase
      .from("reviews")
      .select("rating")
      .eq("reviewee_id", revieweeId);
    const count = ratings?.length || 0;
    if (count > 0) {
      const average = ratings.reduce((sum, item) => sum + item.rating, 0) / count;
      await supabase
        .from("users")
        .update({ average_rating: Number(average.toFixed(2)), review_count: count })
        .eq("id", revieweeId);
    }

    const safeComment = comment ? String(comment) : "";
    await supabase.from("notifications").insert({
      user_id: revieweeId,
      type: "review_received",
      title: `ได้รับรีวิวใหม่ ${"⭐".repeat(numRating)}`,
      message: safeComment
        ? `"${safeComment.substring(0, 60)}${safeComment.length > 60 ? "..." : ""}"`
        : `ได้รับ ${numRating} ดาว`,
      reference_type: "review",
      reference_id: review.id,
    });

    res.status(201).json({
      message: "ส่งรีวิวสำเร็จและได้รับคะแนนความสำเร็จเรียบร้อยแล้ว",
      reviewId: review.id,
      successAwarded: true,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUserReviews, createReview };