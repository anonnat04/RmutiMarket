const { supabase } = require("../config/db");
const bcrypt = require("bcrypt");
const { formatUser, formatCategory, formatStatus } = require("../utils/statusHelper");

const DEFAULT_CAMPUS = "มทร.อีสาน นครราชสีมา";

// คะแนนรีวิวจากตาราง reviews (reviewee_id = ผู้ถูกรีวิว)
async function getReviewStats(userId) {
  const { data } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", userId);
  const rows = data || [];
  const n = rows.length;
  const avg = n ? rows.reduce((s, r) => s + Number(r.rating || 0), 0) / n : 0;
  return { reviewCount: n, averageRating: Number(avg.toFixed(2)) };
}

// ธุรกรรมทั้งหมดของ user (ผู้ซื้อหรือผู้ขาย) พร้อมสถานะ
async function getUserTransactions(userId) {
  const { data } = await supabase
    .from("transactions")
    .select("id, status_id")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
  return data || [];
}

function stripSecrets(user) {
  if (!user) return user;
  // eslint-disable-next-line no-unused-vars
  const { password_hash, ...safe } = user;
  return safe;
}

// ----------------------------------------------------------------
// GET /api/profile/me  — โปรไฟล์ตนเอง
// ----------------------------------------------------------------
async function getMyProfile(req, res, next) {
  try {
    const uid = req.user.id;

    const { data: userRaw, error } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, ban_reason, successful_deal_count,
        average_rating, review_count, avatar_url, profile_image_url,
        last_seen_at, email_verified_at, created_at, updated_at,
        faculties(id, name, code), majors(id, name, code)
      `)
      .eq("id", uid)
      .single();

    if (error || !userRaw) {
      return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });
    }

    const user = formatUser(userRaw);

    // สินค้าของฉัน (ตาราง products)
    const { count: listingsCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", uid);

    // ธุรกรรม + นัดรับ
    const txns = await getUserTransactions(uid);
    const txnIds = txns.map((t) => t.id);
    const successfulDeals = (user.successful_deal_count != null && user.successful_deal_count > 0)
      ? user.successful_deal_count
      : txns.filter((t) => t.status_id === 3).length;

    let meetupsCount = 0;
    if (txnIds.length) {
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .in("transaction_id", txnIds);
      meetupsCount = count || 0;
    }

    const { reviewCount, averageRating } = await getReviewStats(uid);

    res.json({
      user: {
        ...user,
        campus: DEFAULT_CAMPUS,
        campusId: 1,
      },
      stats: {
        listingsCount: listingsCount || 0,
        meetupsCount,
        transactionCount: txns.length,
        successfulDeals,
        averageRating: averageRating || user.average_rating || 0,
        reviewCount: reviewCount || user.review_count || 0,
        trustScore: user.trust_score ?? 100,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/profile/:userId  — โปรไฟล์สาธารณะของผู้ใช้อื่น
// ----------------------------------------------------------------
async function getPublicProfile(req, res, next) {
  try {
    const { userId } = req.params;
    const targetUid = parseInt(userId);
    if (isNaN(targetUid)) return res.status(404).json({ error: "ไม่พบผู้ใช้" });

    const { data: rawUser, error } = await supabase
      .from("users")
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, ban_reason, successful_deal_count,
        average_rating, review_count, avatar_url, profile_image_url,
        last_seen_at, email_verified_at, created_at, updated_at,
        faculties(id, name, code), majors(id, name, code)
      `)
      .eq("id", targetUid)
      .single();

    if (error || !rawUser) return res.status(404).json({ error: "ไม่พบผู้ใช้" });
    const user = formatUser(rawUser);

    // สินค้าของผู้ใช้นี้
    const { data: prods } = await supabase
      .from("products")
      .select(`
        id, title, price, description, view_count, created_at, status_id, condition_id,
        categories(id, name),
        product_conditions(id, name),
        product_status(id, name),
        product_images(id, image_url, is_primary)
      `)
      .eq("seller_id", targetUid)
      .order("created_at", { ascending: false });

    const listings = (prods || []).map((p) => {
      const cond = formatStatus("product_conditions", p.product_conditions || p.condition_id);
      const st = formatStatus("product_status", p.product_status || p.status_id);
      const images = (p.product_images || []).map((img, i) => ({
        id: img.id,
        url: img.image_url,
        imageUrl: img.image_url,
        is_cover: img.is_primary ?? (i === 0),
        isCover: img.is_primary ?? (i === 0),
      }));
      const conditionName = p.product_conditions?.name || cond.name || (p.condition_id === 1 ? "มือหนึ่ง" : "มือสอง");
      return {
        id: p.id,
        title: p.title,
        price: parseFloat(p.price) || 0,
        condition: cond.name.includes("หนึ่ง") ? "new" : "used_good",
        condition_id: p.condition_id,
        conditionName,
        condition_name: conditionName,
        product_conditions: p.product_conditions || { id: p.condition_id, name: conditionName },
        status: st.ui,
        created_at: p.created_at,
        images,
        listing_images: images,
      };
    });

    // โพสต์ตามหาสินค้าของผู้ใช้นี้
    const { data: wantedPosts } = await supabase
      .from("wanted_posts")
      .select(`
        id, title, description, budget_min, budget_max, category_id, created_at, updated_at, status_id,
        categories(id, name),
        wanted_post_status(id, name)
      `)
      .eq("buyer_id", targetUid)
      .neq("status_id", 3) // 3 = ยกเลิกโพสต์
      .order("created_at", { ascending: false });

    const formattedWantedPosts = (wantedPosts || []).map((w) => {
      const cat = formatCategory(w.categories);
      const st = formatStatus("wanted_post_status", w.wanted_post_status || w.status_id);
      return {
        id: w.id,
        title: w.title,
        description: w.description,
        budget: w.budget_max || w.budget_min || 0,
        budgetMin: w.budget_min,
        budgetMax: w.budget_max,
        categoryId: cat?.slug || `cat-${w.category_id}`,
        categoryName: cat?.name || "ทั่วไป",
        createdAt: w.created_at,
        status: st.ui,
        statusCode: st.code,
        statusName: st.name,
      };
    });

    // รีวิวล่าสุด
    const { data: reviewsRaw } = await supabase
      .from("reviews")
      .select(`
        id, rating, comment, created_at,
        reviewer:users!reviewer_id(id, username, full_name, avatar_url, profile_image_url)
      `)
      .eq("reviewee_id", targetUid)
      .order("created_at", { ascending: false })
      .limit(10);

    const reviews = (reviewsRaw || []).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment || "",
      created_at: r.created_at,
      reviewer: r.reviewer ? formatUser(r.reviewer) : null,
    }));

    const { reviewCount, averageRating } = await getReviewStats(targetUid);
    const txns = await getUserTransactions(targetUid);
    const successfulDeals = (user.successful_deal_count != null && user.successful_deal_count > 0)
      ? user.successful_deal_count
      : txns.filter((t) => t.status_id === 3).length;

    res.json({
      user: {
        ...user,
        average_rating: averageRating || user.average_rating || 0,
        review_count: reviewCount || user.review_count || 0,
        successful_deal_count: successfulDeals,
        campus: DEFAULT_CAMPUS,
        campuses: { name: DEFAULT_CAMPUS, code: "korat" },
      },
      listings,
      reviews,
      wanted_posts: formattedWantedPosts,
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PUT /api/profile/me  — อัปเดตโปรไฟล์ (auth required)
// ----------------------------------------------------------------
async function updateProfile(req, res, next) {
  try {
    const {
      username, phone, avatarUrl, avatar_url, profileImageUrl, profile_image_url,
      displayName, display_name, fullName, full_name, faculty, major, facultyId, majorId,
    } = req.body;

    const updates = { updated_at: new Date().toISOString() };

    const avatar = avatarUrl ?? avatar_url ?? profileImageUrl ?? profile_image_url;
    if (avatar !== undefined) {
      updates.avatar_url = avatar;
      updates.profile_image_url = avatar;
    }

    if (username) updates.username = String(username).trim();
    if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;

    const resolvedName = fullName || full_name || displayName || display_name;
    if (resolvedName) updates.full_name = String(resolvedName).trim();

    if (facultyId) {
      updates.faculty_id = parseInt(facultyId);
    } else if (faculty) {
      if (!isNaN(parseInt(faculty))) updates.faculty_id = parseInt(faculty);
      else {
        const { data: fMatch } = await supabase.from("faculties").select("id").ilike("name", `%${faculty}%`).limit(1);
        if (fMatch?.[0]) updates.faculty_id = fMatch[0].id;
      }
    }

    if (majorId) {
      updates.major_id = parseInt(majorId);
    } else if (major) {
      if (!isNaN(parseInt(major))) updates.major_id = parseInt(major);
      else {
        const { data: mMatch } = await supabase.from("majors").select("id").ilike("name", `%${major}%`).limit(1);
        if (mMatch?.[0]) updates.major_id = mMatch[0].id;
      }
    }

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", req.user.id)
      .select(`
        id, username, full_name, university_email, student_id, faculty_id, major_id,
        phone, role, trust_score, status, avatar_url, profile_image_url,
        faculties(name), majors(name)
      `)
      .single();

    if (error) throw error;
    res.json({ message: "อัปเดตโปรไฟล์สำเร็จ", user: formatUser(data) });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PUT /api/profile/password  — เปลี่ยนรหัสผ่าน
// ----------------------------------------------------------------
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่" });
    if (newPassword.length < 8)
      return res.status(400).json({ error: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร" });

    const { data: user } = await supabase
      .from("users").select("password_hash").eq("id", req.user.id).single();

    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash)))
      return res.status(401).json({ error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });

    const newHash = await bcrypt.hash(newPassword, 12);
    await supabase.from("users").update({ password_hash: newHash, updated_at: new Date().toISOString() }).eq("id", req.user.id);

    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// Wishlist APIs
// ----------------------------------------------------------------
async function getWishlist(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("wishlists")
      .select(`
        listing_id, created_at,
        products!listing_id(
          id, title, price, description, condition_id, status_id,
          categories(id, name),
          product_conditions(id, name),
          product_status(id, name),
          product_images(id, image_url, is_primary),
          users!seller_id(id, username, full_name, avatar_url, profile_image_url)
        )
      `)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const formatted = (data || []).map((w) => {
      const p = w.products || {};
      const seller = p.users ? formatUser(p.users) : {};
      const images = (p.product_images || []).map((img, i) => ({
        id: img.id,
        url: img.image_url,
        imageUrl: img.image_url,
        is_cover: img.is_primary ?? (i === 0),
        isCover: img.is_primary ?? (i === 0),
      }));
      const primaryImg = images.find((i) => i.is_cover)?.url || images[0]?.url || null;

      const conditionName = p.product_conditions?.name || ((p.condition_id === 1 || (p.product_conditions?.name || "").includes("หนึ่ง")) ? "มือหนึ่ง" : "มือสอง");

      return {
        id: p.id || w.listing_id,
        listing_id: w.listing_id,
        title: p.title || "สินค้า",
        price: parseFloat(p.price || 0),
        condition: conditionName.includes("หนึ่ง") ? "new" : "used_good",
        condition_id: p.condition_id,
        conditionName,
        condition_name: conditionName,
        product_conditions: p.product_conditions || { id: p.condition_id, name: conditionName },
        status: (p.product_status?.name || "") === "ว่าง" ? "active" : "sold",
        image_url: primaryImg,
        images,
        listing_images: images,
        seller,
        users: seller,
        created_at: w.created_at,
      };
    });

    res.json({ wishlist: formatted });
  } catch (err) {
    next(err);
  }
}

async function addToWishlist(req, res, next) {
  try {
    const { listingId } = req.params;
    const prodId = parseInt(listingId);
    if (isNaN(prodId)) return res.status(400).json({ error: "รหัสสินค้าไม่ถูกต้อง" });

    const { error } = await supabase.from("wishlists").insert({
      user_id: req.user.id,
      listing_id: prodId,
    });

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "สินค้านี้อยู่ในรายการโปรดแล้ว" });
      throw error;
    }
    res.status(201).json({ message: "เพิ่มในรายการโปรดแล้ว" });
  } catch (err) {
    next(err);
  }
}

async function removeFromWishlist(req, res, next) {
  try {
    const { listingId } = req.params;
    const prodId = parseInt(listingId);

    await supabase.from("wishlists")
      .delete()
      .eq("user_id", req.user.id)
      .eq("listing_id", prodId);

    res.json({ message: "ลบออกจากรายการโปรดแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PUT /api/profile/interests  — อัปเดตความสนใจ
// ----------------------------------------------------------------
async function updateInterests(req, res, next) {
  try {
    const { categoryIds = [] } = req.body;
    const userId = req.user.id;

    // Delete existing
    await supabase.from("user_interests").delete().eq("user_id", userId);

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const rows = categoryIds.map((cid) => {
        let catId = typeof cid === "number" ? cid : parseInt(String(cid).replace(/^cat-/, ""));
        return {
          user_id: userId,
          category_id: !isNaN(catId) ? catId : 1,
        };
      });
      await supabase.from("user_interests").insert(rows);
    }

    res.json({ message: "บันทึกหมวดหมู่ที่สนใจเรียบร้อยแล้ว", interests: categoryIds });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/profile/verify-student-card  — ยืนยันบัตรนักศึกษา
// ----------------------------------------------------------------
async function submitStudentCard(req, res, next) {
  try {
    const { studentId, student_id } = req.body;
    const sId = studentId || student_id;
    if (sId) {
      await supabase.from("users").update({ student_id: String(sId).trim() }).eq("id", req.user.id);
    }
    res.json({ message: "ส่งข้อมูลยืนยันตัวตนเรียบร้อยแล้ว", success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyProfile,
  getPublicProfile,
  updateProfile,
  changePassword,
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  updateInterests,
  submitStudentCard,
};