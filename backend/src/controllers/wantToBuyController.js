const { supabase } = require("../config/db");
const { resolveCategoryId } = require("../utils/categories");
const { formatCategory, formatUser, formatStatus, getStatusId } = require("../utils/statusHelper");

// ----------------------------------------------------------------
// Helper: Map Wanted Post to Frontend UI Model
// ----------------------------------------------------------------
function mapWantedPost(w) {
  const postStatus = formatStatus("wanted_post_status", w.wanted_post_status || w.status_id);
  const cat = formatCategory(w.categories);
  const buyer = w.users ? formatUser(w.users) : {};

  return {
    id: w.id,
    title: w.title,
    description: w.description || "",
    budget: w.budget_max || w.budget_min || 0,
    budgetMin: w.budget_min ? parseFloat(w.budget_min) : null,
    budgetMax: w.budget_max ? parseFloat(w.budget_max) : null,
    budget_min: w.budget_min ? parseFloat(w.budget_min) : null,
    budget_max: w.budget_max ? parseFloat(w.budget_max) : null,
    category_id: w.category_id,
    categoryId: cat?.slug || `cat-${w.category_id}`,
    categoryName: cat?.name || "ทั่วไป",
    categories: cat,
    status_id: w.status_id,
    status: postStatus.ui,
    statusCode: postStatus.code,
    statusName: postStatus.name,
    created_at: w.created_at,
    createdAt: w.created_at,
    updated_at: w.updated_at,
    buyer_id: w.buyer_id,
    buyer,
    users: buyer,
  };
}

// ----------------------------------------------------------------
// GET /api/want-to-buy  — โพสต์ "อยากได้"
// ----------------------------------------------------------------
async function getWantToBuyPosts(req, res, next) {
  try {
    const { q, category, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("wanted_posts")
      .select(`
        id, buyer_id, category_id, title, description, budget_min, budget_max, status_id, created_at, updated_at,
        categories(id, name),
        wanted_post_status(id, name),
        users!buyer_id(
          id, username, full_name, avatar_url, profile_image_url,
          faculty_id, major_id, email_verified_at, faculties(name), majors(name)
        )
      `, { count: "exact" })
      .neq("status_id", 3); // 3 = ยกเลิกโพสต์ (CANCELLED)

    if (q) {
      const cleanQ = q.trim();
      const numQ = parseFloat(cleanQ);
      if (!isNaN(numQ)) {
        query = query.or(`title.ilike.%${cleanQ}%,description.ilike.%${cleanQ}%,budget_max.eq.${numQ},budget_min.eq.${numQ}`);
      } else {
        query = query.or(`title.ilike.%${cleanQ}%,description.ilike.%${cleanQ}%`);
      }
    }

    if (category && category !== "all" && category !== "cat-1") {
      const catId = resolveCategoryId(category, null);
      if (catId) query = query.eq("category_id", catId);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const posts = (data || []).map(mapWantedPost);
    res.json({ posts, total: count ?? posts.length });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/want-to-buy  — สร้างโพสต์ "อยากได้"
// ----------------------------------------------------------------
async function createWantToBuyPost(req, res, next) {
  try {
    const { title, description, budgetMin, budgetMax, categoryId } = req.body;

    if (!title || !String(title).trim())
      return res.status(400).json({ error: "กรุณาระบุสิ่งที่ต้องการหา" });

    const { data, error } = await supabase
      .from("wanted_posts")
      .insert({
        buyer_id: req.user.id,
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        category_id: resolveCategoryId(categoryId, 8),
        status_id: 1, // 1 = กำลังตามหา (ACTIVE)
      })
      .select("id")
      .single();

    if (error) throw error;
    res.status(201).json({ message: "โพสต์สำเร็จ", postId: data.id, id: data.id });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PUT /api/want-to-buy/:id  — แก้ไขโพสต์ "อยากได้"
// ----------------------------------------------------------------
async function updateWantToBuyPost(req, res, next) {
  try {
    const { id } = req.params;
    const postId = parseInt(id);
    if (isNaN(postId)) return res.status(404).json({ error: "ไม่พบโพสต์" });

    const { title, description, budgetMin, budgetMax, categoryId, statusId } = req.body;
    const updates = { updated_at: new Date().toISOString() };

    if (title) updates.title = String(title).trim();
    if (description !== undefined) updates.description = description ? String(description).trim() : null;
    if (budgetMin !== undefined) updates.budget_min = budgetMin ? parseFloat(budgetMin) : null;
    if (budgetMax !== undefined) updates.budget_max = budgetMax ? parseFloat(budgetMax) : null;
    if (categoryId) updates.category_id = resolveCategoryId(categoryId, 8);
    if (statusId) updates.status_id = parseInt(statusId);

    const { data, error } = await supabase
      .from("wanted_posts")
      .update(updates)
      .eq("id", postId)
      .eq("buyer_id", req.user.id)
      .select("*")
      .single();

    if (error) throw error;
    res.json({ message: "แก้ไขโพสต์สำเร็จ", post: data ? mapWantedPost(data) : null });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// DELETE /api/want-to-buy/:id  — ลบ/ยกเลิกโพสต์ "อยากได้"
// ----------------------------------------------------------------
async function deleteWantToBuyPost(req, res, next) {
  try {
    const { id } = req.params;
    const postId = parseInt(id);
    if (isNaN(postId)) return res.status(404).json({ error: "ไม่พบโพสต์" });

    const { error } = await supabase
      .from("wanted_posts")
      .delete()
      .eq("id", postId)
      .eq("buyer_id", req.user.id);

    if (error) throw error;
    res.json({ message: "ลบโพสต์เรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWantToBuyPosts,
  createWantToBuyPost,
  updateWantToBuyPost,
  deleteWantToBuyPost,
};