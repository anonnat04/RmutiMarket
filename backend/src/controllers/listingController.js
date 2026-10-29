const { supabase } = require("../config/db");
const { resolveCategoryId } = require("../utils/categories");
const { deleteConversations } = require("./chatController");
const { formatCategory, formatUser, formatStatus, getStatusId } = require("../utils/statusHelper");

// Helper: แปลงข้อมูลจาก products (schema 39 ตาราง) ให้ตรงกับ Frontend UI Model
function mapProductToListing(p) {
  if (!p) return null;
  const seller = p.users ? formatUser(p.users) : {};
  const images = (p.product_images || []).map((img, idx) => ({
    id: img.id,
    url: img.image_url,
    imageUrl: img.image_url,
    is_cover: img.is_primary ?? (idx === 0),
    isCover: img.is_primary ?? (idx === 0),
    sort_order: idx,
  }));

  const conditionStatus = formatStatus("product_conditions", p.product_conditions || p.condition_id);
  const prodStatus = formatStatus("product_status", p.product_status || p.status_id);

  // ดึงชื่อสภาพสินค้าโดยตรงจากตาราง product_conditions (เช่น มือหนึ่ง, มือสอง)
  const conditionName = p.product_conditions?.name || conditionStatus.name || (p.condition_id === 1 ? "มือหนึ่ง" : "มือสอง");
  const isNew = conditionName.includes("หนึ่ง") || p.condition_id === 1;
  const uiCondition = isNew ? "new" : "used_good";
  const uiStatus = prodStatus.code === "AVAILABLE" ? "active" : (prodStatus.code === "RESERVED" ? "reserved" : (prodStatus.code === "SOLD" ? "sold" : "active"));

  const formattedCat = p.categories ? formatCategory(p.categories) : null;
  const sellerUsername = (seller.username || p.users?.username || "").replace(/^@+/, "").trim();

  return {
    id: String(p.id),
    title: p.title,
    price: parseFloat(p.price) || 0,
    original_price: undefined,
    originalPrice: undefined,
    description: p.description || "",
    condition: uiCondition,
    condition_id: p.condition_id,
    conditionName,
    condition_name: conditionName,
    product_conditions: p.product_conditions || { id: p.condition_id, name: conditionName },
    listing_type: "sell",
    listingType: "sell",
    status: uiStatus,
    status_id: p.status_id,
    statusCode: prodStatus.code,
    statusName: prodStatus.name,
    view_count: p.view_count || 0,
    viewCount: p.view_count || 0,
    wishlist_count: p.wishlist_count || 0,
    interestedCount: p.wishlist_count || 0,
    created_at: p.created_at,
    createdAt: p.created_at,
    updated_at: p.updated_at,
    category_id: p.category_id,
    categories: formattedCat,
    campuses: { name: "มทร.อีสาน นครราชสีมา", code: "korat" },
    location: "มทร.อีสาน นครราชสีมา",
    users: {
      id: seller.id || p.seller_id,
      username: sellerUsername,
      fullName: seller.fullName || p.users?.full_name,
      full_name: seller.fullName || p.users?.full_name,
      displayName: sellerUsername || seller.displayName || "นักศึกษา มทร.อีสาน",
      display_name: sellerUsername || seller.displayName || "นักศึกษา มทร.อีสาน",
      avatar_url: seller.avatarUrl,
      avatarUrl: seller.avatarUrl,
      verification_level: seller.verificationLevel || "student_id_verified",
      verificationLevel: seller.verificationLevel || "student_id_verified",
      average_rating: seller.averageRating || "5.0",
      trustScore: seller.trustScore || 100,
      faculty: seller.faculty,
      major: seller.major,
    },
    seller: {
      id: seller.id || p.seller_id,
      username: sellerUsername,
      fullName: seller.fullName || p.users?.full_name,
      full_name: seller.fullName || p.users?.full_name,
      displayName: sellerUsername || seller.displayName || "นักศึกษา มทร.อีสาน",
      display_name: sellerUsername || seller.displayName || "นักศึกษา มทร.อีสาน",
      avatarUrl: seller.avatarUrl,
      avatar_url: seller.avatarUrl,
      trustScore: seller.trustScore || 100,
      reviewCount: seller.reviewCount || 0,
      verificationLevel: seller.verificationLevel || "student_id_verified",
      location: "มทร.อีสาน นครราชสีมา",
    },
    listing_images: images,
    images: images,
  };
}

// ----------------------------------------------------------------
// GET /api/listings  — รายการสินค้าทั้งหมด (with filters)
// ----------------------------------------------------------------
async function getListings(req, res, next) {
  try {
    const {
      q = "",
      category,
      condition,
      min_price,
      max_price,
      sort = "newest",
      page = 1,
      limit = 20,
    } = req.query;

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
      const numQ = parseFloat(cleanQ);
      if (!isNaN(numQ)) {
        query = query.or(`title.ilike.%${cleanQ}%,description.ilike.%${cleanQ}%,price.eq.${numQ}`);
      } else {
        query = query.or(`title.ilike.%${cleanQ}%,description.ilike.%${cleanQ}%`);
      }
    }

    if (category && category !== "all" && category !== "cat-1") {
      const catId = resolveCategoryId(category, null);
      if (catId) {
        query = query.eq("category_id", catId);
      }
    }

    if (condition) {
      const condId = (condition === "new" || condition === "like_new" || condition === "1" || condition === "มือหนึ่ง") ? 1 : 2;
      query = query.eq("condition_id", condId);
    }

    if (min_price) query = query.gte("price", parseFloat(min_price));
    if (max_price) query = query.lte("price", parseFloat(max_price));

    if (sort === "newest") query = query.order("created_at", { ascending: false });
    else if (sort === "price_asc") query = query.order("price", { ascending: true });
    else if (sort === "price_desc") query = query.order("price", { ascending: false });
    else if (sort === "popular") query = query.order("view_count", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const listings = (data || []).map(mapProductToListing);
    res.json({ listings, total: count ?? listings.length, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/listings/:id  — รายละเอียดสินค้า
// ----------------------------------------------------------------
async function getListingById(req, res, next) {
  try {
    const { id } = req.params;
    const prodId = parseInt(id);

    if (isNaN(prodId)) {
      return res.status(404).json({ error: "ไม่พบสินค้า" });
    }

    const { data: prod, error } = await supabase
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
      `)
      .eq("id", prodId)
      .single();

    if (error || !prod) {
      return res.status(404).json({ error: "ไม่พบสินค้า" });
    }

    supabase.from("products").update({ view_count: (prod.view_count || 0) + 1 }).eq("id", prod.id).then(() => {});

    const mapped = mapProductToListing(prod);
    res.json({ listing: mapped });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/listings  — สร้างสินค้าใหม่ (auth required)
// ----------------------------------------------------------------
async function createListing(req, res, next) {
  try {
    const {
      title, description, price, condition, condition_id, categoryId, images = [],
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "กรุณากรอกชื่อและรายละเอียดสินค้า" });
    }

    const catId = resolveCategoryId(categoryId, 1);
    let condId = condition_id ? parseInt(condition_id) : null;
    if (!condId || isNaN(condId)) {
      condId = (condition === "new" || condition === "like_new" || condition === "1" || condition === "มือหนึ่ง") ? 1 : 2;
    }

    const { data: prod, error: pErr } = await supabase
      .from("products")
      .insert({
        seller_id: req.user.id,
        category_id: catId,
        condition_id: condId,
        status_id: 1, // 1 = ว่าง (AVAILABLE)
        title: String(title).trim(),
        description: String(description).trim(),
        price: parseFloat(price) || 0,
      })
      .select("id")
      .single();

    if (pErr) throw pErr;

    if (images && images.length) {
      const imgRows = images.map((img, i) => ({
        product_id: prod.id,
        image_url: typeof img === "string" ? img : (img.url || img.imageUrl),
        is_primary: i === 0,
      }));
      await supabase.from("product_images").insert(imgRows);
    }

    res.status(201).json({ message: "ลงสินค้าสำเร็จ", listingId: prod.id, id: prod.id });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PUT /api/listings/:id  — แก้ไขสินค้า (owner only)
// ----------------------------------------------------------------
async function updateListing(req, res, next) {
  try {
    const { id } = req.params;
    const prodId = parseInt(id);
    if (isNaN(prodId)) return res.status(404).json({ error: "ไม่พบสินค้า" });

    const { title, description, price, categoryId, condition, condition_id, images, status } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = String(title).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (price !== undefined) updates.price = parseFloat(price);
    if (categoryId !== undefined) updates.category_id = resolveCategoryId(categoryId);
    if (condition_id !== undefined && !isNaN(parseInt(condition_id))) {
      updates.condition_id = parseInt(condition_id);
    } else if (condition !== undefined) {
      updates.condition_id = (condition === "new" || condition === "like_new" || condition === "1" || condition === "มือหนึ่ง") ? 1 : 2;
    }
    if (status !== undefined) {
      const sid = getStatusId("product_status", status);
      if (sid) updates.status_id = sid;
    }

    // ตรวจสอบสินค้าที่มีอยู่ก่อน
    const { data: existing, error: findErr } = await supabase
      .from("products")
      .select("id, seller_id")
      .eq("id", prodId)
      .maybeSingle();

    if (findErr || !existing) {
      return res.status(404).json({ error: "ไม่พบสินค้าที่ต้องการแก้ไข" });
    }

    const isOwner = String(existing.seller_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์แก้ไขสินค้านี้ (ไม่ใช่เจ้าของประกาศ)" });
    }

    const { data: updatedProd, error } = await supabase
      .from("products")
      .update(updates)
      .eq("id", prodId)
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
      `)
      .single();

    if (error) throw error;

    if (images && Array.isArray(images) && images.length > 0) {
      await supabase.from("product_images").delete().eq("product_id", prodId);
      const imgRows = images.map((img, i) => {
        const url = typeof img === "string" ? img : (img.imageUrl || img.url || img.previewUrl);
        const isPrimary = typeof img === "object" && img.isCover !== undefined ? Boolean(img.isCover) : (i === 0);
        return {
          product_id: prodId,
          image_url: url,
          is_primary: isPrimary,
        };
      });
      await supabase.from("product_images").insert(imgRows);
    }

    const mapped = mapProductToListing(updatedProd);
    res.json({ message: "แก้ไขสินค้าสำเร็จ", listing: mapped });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// DELETE /api/listings/:id  — ลบสินค้า (owner only)
// ----------------------------------------------------------------
async function deleteListing(req, res, next) {
  try {
    const { id } = req.params;
    const prodId = parseInt(id);
    if (isNaN(prodId)) return res.status(404).json({ error: "ไม่พบสินค้า" });

    // ตรวจสอบสินค้าและสิทธิ์การลบ
    const { data: existing, error: findErr } = await supabase
      .from("products")
      .select("id, seller_id")
      .eq("id", prodId)
      .maybeSingle();

    if (findErr || !existing) {
      return res.status(404).json({ error: "ไม่พบสินค้าที่ต้องการลบ" });
    }

    const isOwner = String(existing.seller_id) === String(req.user.id);
    const isAdmin = req.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "คุณไม่มีสิทธิ์ลบสินค้านี้" });
    }

    // 1. ค้นหาและลบห้องแชท
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .eq("product_id", prodId);

    if (convs && convs.length > 0) {
      await deleteConversations(convs.map((c) => c.id));
    }

    // 2. ลบ wishlists
    await supabase.from("wishlists").delete().eq("listing_id", prodId);

    // 3. ลบ appointments และ transactions
    const { data: txns } = await supabase
      .from("transactions")
      .select("id")
      .eq("product_id", prodId);

    if (txns && txns.length > 0) {
      const txnIds = txns.map((t) => t.id);
      await supabase.from("reviews").delete().in("transaction_id", txnIds);
      await supabase.from("appointments").delete().in("transaction_id", txnIds);
      await supabase.from("transactions").delete().eq("product_id", prodId);
    }

    // 4. ลบ reports
    await supabase.from("reports").delete().eq("target_type", "product").eq("target_id", prodId);

    // 5. ลบรูปสินค้า
    await supabase.from("product_images").delete().eq("product_id", prodId);

    // 6. ลบสินค้า
    const { error: dErr } = await supabase.from("products").delete().eq("id", prodId);
    if (dErr) throw dErr;

    res.json({ message: "ลบสินค้าและข้อมูลที่เกี่ยวข้องสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/listings/user/my  — สินค้าของฉัน
// ----------------------------------------------------------------
async function getMyListings(req, res, next) {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    let query = supabase
      .from("products")
      .select(`
        id, seller_id, title, price, description, view_count, created_at, updated_at,
        category_id, condition_id, status_id,
        categories(id, name),
        product_status(id, name),
        product_conditions(id, name),
        product_images(id, image_url, is_primary)
      `)
      .eq("seller_id", userId);

    if (status) {
      const statusId = getStatusId("product_status", status);
      if (statusId) query = query.eq("status_id", statusId);
    }

    query = query.order("created_at", { ascending: false });

    const { data: prods, error } = await query;
    if (error) throw error;

    const mapped = (prods || []).map(mapProductToListing);
    res.json({ listings: mapped, total: mapped.length });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/listings/:id/report  — รายงานสินค้า
// ----------------------------------------------------------------
async function reportListing(req, res, next) {
  try {
    const { id } = req.params;
    const prodId = parseInt(id);
    const { type, category, description } = req.body;

    const { data: prod } = await supabase
      .from("products")
      .select("id, title, seller_id")
      .eq("id", prodId)
      .maybeSingle();

    await supabase.from("reports").insert({
      target_type: "product",
      target_id: prodId,
      target_title: prod?.title || `สินค้า #${prodId}`,
      target_user_id: prod?.seller_id || null,
      reporter_id: req.user.id,
      reporter_name: req.user.fullName || req.user.username,
      reporter_email: req.user.universityEmail || req.user.email,
      category: category || type || "สินค้าไม่เหมาะสม",
      description: description || "ไม่มีรายละเอียด",
      status: "pending",
    });

    res.json({ message: "รายงานส่งเรียบร้อยแล้ว ทีมงานจะตรวจสอบโดยเร็ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/listings/categories  — หมวดหมู่ทั้งหมด
// ----------------------------------------------------------------
async function getCategories(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("id");

    if (error) throw error;
    const formatted = (data || []).map(formatCategory);
    res.json({ categories: formatted });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/listings/conditions  — สภาพสินค้าทั้งหมดจากตาราง product_conditions
// ----------------------------------------------------------------
async function getConditions(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("product_conditions")
      .select("id, name")
      .order("id");

    if (error) throw error;
    res.json({ conditions: data || [] });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getListings, getListingById, createListing, updateListing,
  deleteListing, getMyListings, reportListing, getCategories, getConditions,
};
