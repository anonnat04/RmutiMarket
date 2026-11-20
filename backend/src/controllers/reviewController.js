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
          ? r.reviewer_id === txn.buyer_id
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
    const { transactionId, revieweeId, rating, comment, images = [] } = req.body;

    if (!transactionId || !revieweeId || !rating)
      return res.status(400).json({ error: "กรุณาระบุ transaction ผู้ถูกรีวิว และคะแนน" });

    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5)
      return res.status(400).json({ error: "คะแนนต้องอยู่ระหว่าง 1-5" });

    // Verify transaction
    const { data: txn } = await supabase
      .from("transactions")
      .select("id, product_id, buyer_id, seller_id, status_id, buyer_received, seller_handed_over, appointments(id, buyer_checked_in_at, seller_checked_in_at)")
      .eq("id", transactionId)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการซื้อขาย" });

    const isBuyer = String(txn.buyer_id) === String(req.user.id);
    const isSeller = String(txn.seller_id) === String(req.user.id);
    if (!isBuyer && !isSeller)
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในรายการนี้" });

    // รีวิวสามารถรีวิวได้ก็ต่อเมื่อกดปุ่มยืนยันได้รับสินค้า/ส่งมอบสินค้าแล้วเท่านั้น
    const myConfirmed = isBuyer ? txn.buyer_received : txn.seller_handed_over;
    if (!myConfirmed)
      return res.status(400).json({ error: "คุณต้องกดยืนยันรับ/ส่งมอบสินค้าก่อน จึงจะสามารถรีวิวได้" });

    if (parseInt(revieweeId) !== txn.buyer_id && parseInt(revieweeId) !== txn.seller_id)
      return res.status(400).json({ error: "ผู้ถูกรีวิวไม่ได้อยู่ในรายการนี้" });
    if (parseInt(revieweeId) === req.user.id)
      return res.status(400).json({ error: "ไม่สามารถรีวิวตัวเองได้" });

    // Insert Review
    const { data: review, error } = await supabase
      .from("reviews")
      .insert({
        transaction_id: transactionId,
        reviewer_id: req.user.id,
        reviewee_id: parseInt(revieweeId),
        rating: numRating,
        comment: comment ? String(comment).trim() : null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "คุณรีวิวรายการนี้ไปแล้ว" });
      throw error;
    }

    // Insert Review Images
    if (images && Array.isArray(images) && images.length > 0) {
      const imgRows = images.filter(Boolean).map((url) => ({
        review_id: review.id,
        image_url: typeof url === "string" ? url : (url.url || url.imageUrl),
      }));
      if (imgRows.length > 0) {
        await supabase.from("review_images").insert(imgRows);
      }
    }

    // ใครรีวิวจะได้คะแนนว่าสำเร็จ:
    // เพิ่ม successful_deal_count ให้กับผู้ส่งรีวิวทันที + คืนคะแนนความน่าเชื่อถือ Trust Score
    const { data: revUser } = await supabase
      .from("users")
      .select("successful_deal_count")
      .eq("id", req.user.id)
      .single();

    await supabase
      .from("users")
      .update({ successful_deal_count: (revUser?.successful_deal_count || 0) + 1 })
      .eq("id", req.user.id);

    await recoverScoreOnDeal(req.user.id, transactionId);

    // อัปเดต average_rating และ review_count ให้แก่ reviewee ทันที
    const { data: ratings } = await supabase
      .from("reviews")
      .select("rating")
      .eq("reviewee_id", parseInt(revieweeId));
    const count = ratings?.length || 0;
    if (count > 0) {
      const average = ratings.reduce((sum, item) => sum + item.rating, 0) / count;
      await supabase
        .from("users")
        .update({ average_rating: Number(average.toFixed(2)), review_count: count })
        .eq("id", parseInt(revieweeId));
    }

    // Notify reviewee
    await supabase.from("notifications").insert({
      user_id: parseInt(revieweeId),
      type: "review_received",
      title: `ได้รับรีวิวใหม่ ${"⭐".repeat(numRating)}`,
      message: comment ? `"${comment.substring(0, 60)}${comment.length > 60 ? "..." : ""}"` : `ได้รับ ${numRating} ดาว`,
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
