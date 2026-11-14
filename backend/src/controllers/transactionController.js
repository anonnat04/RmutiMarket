const { supabase } = require("../config/db");
const { sendNotificationToUser } = require("../services/chatSocket");
const { formatUser, formatStatus, getStatusId } = require("../utils/statusHelper");

function mapTransaction(t) {
  const txnStatus = formatStatus("transaction_status", t.transaction_status || t.status_id);
  const prod = t.products || {};
  const images = (prod.product_images || []).map((img, i) => ({
    id: img.id,
    url: img.image_url,
    imageUrl: img.image_url,
    is_cover: img.is_primary ?? (i === 0),
    isCover: img.is_primary ?? (i === 0),
  }));
  const primaryImg = images.find((img) => img.is_cover)?.url || images[0]?.url || null;

  const buyer = t.buyer ? formatUser(t.buyer) : {};
  const seller = t.seller ? formatUser(t.seller) : {};

  const price = parseFloat(prod.price || 0);

  return {
    id: t.id,
    product_id: t.product_id,
    listing_id: t.product_id,
    price,
    agreed_price: price,
    agreedPrice: price,
    status: txnStatus.ui,
    statusCode: txnStatus.code,
    statusName: txnStatus.name,
    status_id: t.status_id,
    buyer_id: t.buyer_id,
    seller_id: t.seller_id,
    buyer_confirmed: !!t.buyer_received,
    seller_confirmed: !!t.seller_handed_over,
    buyer_received: !!t.buyer_received,
    seller_handed_over: !!t.seller_handed_over,
    created_at: t.created_at,
    completed_at: t.completed_at,
    cancelled_at: t.cancelled_at,

    // Listings / Products compatibility
    products: {
      ...prod,
      price,
      title: prod.title || "สินค้า",
      images,
    },
    listings: {
      id: prod.id,
      title: prod.title || "สินค้า",
      price,
      listing_images: images,
      images,
      image_url: primaryImg,
    },

    buyer,
    seller,
    users: buyer,
    users_buyer_id: buyer,
    users_seller_id: seller,

    appointments: t.appointments || [],
    meetups: (t.appointments || []).map((a) => {
      const apptStatus = formatStatus("appointment_status", a.appointment_status || a.status_id);
      return {
        id: a.id,
        status: apptStatus.ui,
        statusCode: apptStatus.code,
        statusName: apptStatus.name,
        scheduled_at: `${a.appointment_date} ${a.appointment_time}`,
        scheduledAt: `${a.appointment_date}T${a.appointment_time}`,
        meetup_points: a.locations || { name: a.location_detail || "จุดนัดรับ มทร.อีสาน" },
        locations: a.locations || { name: a.location_detail || "จุดนัดรับ มทร.อีสาน" },
      };
    }),
  };
}

// ----------------------------------------------------------------
// GET /api/transactions  — ประวัติการซื้อขายของฉัน
// ----------------------------------------------------------------
async function getMyTransactions(req, res, next) {
  try {
    const { role = "all", status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = supabase
      .from("transactions")
      .select(
        `
        id, product_id, buyer_id, seller_id, buyer_received, seller_handed_over,
        status_id, created_at, completed_at, cancelled_at,
        transaction_status(id, name),
        products(id, title, price, product_images(id, image_url, is_primary)),
        buyer:users!buyer_id(id, username, full_name, avatar_url, profile_image_url, phone),
        seller:users!seller_id(id, username, full_name, avatar_url, profile_image_url, phone),
        appointments(
          id, appointment_date, appointment_time, location_id, location_detail, status_id,
          appointment_status(id, name),
          locations(id, name, description, latitude, longitude)
        )
      `,
        { count: "exact" }
      );

    if (role === "buyer") query = query.eq("buyer_id", req.user.id);
    else if (role === "seller") query = query.eq("seller_id", req.user.id);
    else query = query.or(`buyer_id.eq.${req.user.id},seller_id.eq.${req.user.id}`);

    if (status) {
      const statusId = getStatusId("transaction_status", status);
      if (statusId) query = query.eq("status_id", statusId);
    }

    query = query.order("created_at", { ascending: false }).range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const formatted = (data || []).map(mapTransaction);
    res.json({ transactions: formatted, total: count });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/transactions/:id  — รายละเอียดธุรกรรม
// ----------------------------------------------------------------
async function getTransactionById(req, res, next) {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        id, product_id, buyer_id, seller_id, buyer_received, seller_handed_over,
        status_id, created_at, completed_at, cancelled_at,
        transaction_status(id, name),
        products(id, title, price, product_images(id, image_url, is_primary)),
        buyer:users!buyer_id(id, username, full_name, avatar_url, profile_image_url, phone),
        seller:users!seller_id(id, username, full_name, avatar_url, profile_image_url, phone),
        appointments(
          id, appointment_date, appointment_time, location_id, location_detail, status_id,
          appointment_status(id, name),
          locations(id, name, description, latitude, longitude)
        )
      `
      )
      .eq("id", id)
      .single();

    if (error || !data) return res.status(404).json({ error: "ไม่พบรายการซื้อขาย" });

    if (data.buyer_id !== req.user.id && data.seller_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงรายการนี้" });

    res.json({ transaction: mapTransaction(data) });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/transactions  — สร้างคำขอซื้อ (buyer)
// ----------------------------------------------------------------
async function createTransaction(req, res, next) {
  try {
    const { productId, listingId } = req.body;
    const targetProductId = productId || listingId;

    if (!targetProductId)
      return res.status(400).json({ error: "กรุณาระบุสินค้าที่ต้องการซื้อ" });

    const { data: product } = await supabase
      .from("products")
      .select("id, seller_id, price, title, status_id")
      .eq("id", targetProductId)
      .single();

    if (!product) return res.status(404).json({ error: "ไม่พบสินค้า" });
    if (product.seller_id === req.user.id) return res.status(400).json({ error: "ไม่สามารถซื้อสินค้าของตนเองได้" });

    // Check duplicate non-cancelled transaction
    const { data: existing } = await supabase
      .from("transactions")
      .select("id")
      .eq("product_id", targetProductId)
      .eq("buyer_id", req.user.id)
      .in("status_id", [1, 2]) // บล็อกเฉพาะรายการที่ยังดำเนินการอยู่
      .limit(1);

    if (existing?.length) return res.status(409).json({ error: "คุณมีรายการซื้อขายสินค้านี้อยู่แล้ว" });

    // จองสินค้าแบบ compare-and-set ก่อนสร้าง transaction เพื่อกันผู้ซื้อหลายคนแย่งซื้อพร้อมกัน
    const { data: claimed, error: claimErr } = await supabase
      .from("products")
      .update({ status_id: 2 })
      .eq("id", targetProductId)
      .eq("status_id", 1)
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimed?.length) return res.status(409).json({ error: "สินค้านี้ถูกจองหรือขายไปแล้ว" });

    const { data: txn, error } = await supabase
      .from("transactions")
      .insert({
        product_id: targetProductId,
        buyer_id: req.user.id,
        seller_id: product.seller_id,
        status_id: 1, // 1 = รอยืนยัน (PENDING)
      })
      .select("id")
      .single();

    if (error) {
      // ปล่อยจองกลับเฉพาะสินค้าที่ยังเป็น RESERVED
      await supabase.from("products").update({ status_id: 1 }).eq("id", targetProductId).eq("status_id", 2);
      throw error;
    }

    // Notify seller
    const notifData = {
      user_id: product.seller_id,
      type: "transaction_update",
      title: "มีคำขอซื้อสินค้าใหม่! 🎉",
      message: `"${product.title}" มีผู้ขอซื้อในราคา ฿${parseFloat(product.price).toLocaleString()}`,
      reference_type: "transaction",
      reference_id: txn.id,
    };
    const { data: insertedNotif } = await supabase.from("notifications").insert(notifData).select("*").single();
    sendNotificationToUser(product.seller_id, insertedNotif || notifData);

    res.status(201).json({ message: "ส่งคำขอซื้อแล้ว กรุณารอการยืนยันจากผู้ขาย", transactionId: txn.id });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/transactions/:id/confirm  — ยืนยันดีล (seller)
// ----------------------------------------------------------------
async function confirmTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { data: txn } = await supabase
      .from("transactions")
      .select("id, buyer_id, seller_id, status_id")
      .eq("id", id)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการ" });
    if (txn.seller_id !== req.user.id) return res.status(403).json({ error: "เฉพาะผู้ขายเท่านั้น" });
    if (txn.status_id !== 1) return res.status(400).json({ error: "รายการนี้ไม่อยู่ในสถานะรอยืนยัน" });

    const { data: accepted, error: acceptErr } = await supabase
      .from("transactions")
      .update({ status_id: 2 }) // 2 = ยืนยันแล้ว (CONFIRMED)
      .eq("id", id)
      .eq("status_id", 1)
      .select("id");
    if (acceptErr) throw acceptErr;
    if (!accepted?.length) return res.status(409).json({ error: "รายการนี้ถูกดำเนินการไปแล้ว" });

    const notifData = {
      user_id: txn.buyer_id,
      type: "transaction_update",
      title: "ผู้ขายยืนยันการซื้อขายแล้ว ✅",
      message: "ผู้ขายตอบรับคำขอซื้อของคุณแล้ว กรุณานัดหมายวันเวลาและจุดรับสินค้า",
      reference_type: "transaction",
      reference_id: id,
    };
    const { data: insertedNotif } = await supabase.from("notifications").insert(notifData).select("*").single();
    sendNotificationToUser(txn.buyer_id, insertedNotif || notifData);

    res.json({ message: "ยืนยันการซื้อขายแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/transactions/:id/complete  — ยืนยันรับของแล้ว
// ----------------------------------------------------------------
async function completeTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { data: txn } = await supabase
      .from("transactions")
      .select("id, buyer_id, seller_id, status_id")
      .eq("id", id)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการ" });
    if (txn.buyer_id !== req.user.id && txn.seller_id !== req.user.id)
      return res.status(403).json({ error: "ไม่มีสิทธิ์" });
    // Legacy endpoint once let either participant close the deal without checking in.
    // Closing must go through the appointment flow, which validates both check-ins and
    // applies score/recovery exactly once.
    if (Number(txn.status_id) !== 2) {
      return res.status(409).json({ error: "รายการนี้ไม่ได้อยู่ระหว่างนัดรับ" });
    }
    return res.status(400).json({ error: "กรุณายืนยันรับสินค้าจากหน้านัดรับหลังทั้งสองฝ่ายเช็คอินแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/transactions/:id/cancel  — ยกเลิกรายการ
// ----------------------------------------------------------------
async function cancelTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: txn } = await supabase
      .from("transactions")
      .select("id, product_id, buyer_id, seller_id, status_id")
      .eq("id", id)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการ" });
    if (txn.buyer_id !== req.user.id && txn.seller_id !== req.user.id && req.user.role !== "admin")
      return res.status(403).json({ error: "ไม่มีสิทธิ์" });
    if ([3, 4, 5].includes(Number(txn.status_id))) {
      return res.status(400).json({ error: "รายการนี้สิ้นสุดแล้ว ไม่สามารถยกเลิกซ้ำได้" });
    }
    const { data: activeAppointments, error: apptErr } = await supabase
      .from("appointments")
      .select("id, status_id")
      .eq("transaction_id", id)
      .in("status_id", [1, 2]);
    if (apptErr) throw apptErr;
    if ((activeAppointments || []).some((appt) => Number(appt.status_id) === 2)) {
      return res.status(400).json({ error: "นัดรับได้รับการยืนยันแล้ว กรุณายกเลิกจากหน้านัดรับเพื่อให้ระบบตรวจเงื่อนไขการตัดคะแนน" });
    }

    const now = new Date().toISOString();

    const { data: cancelled, error: cancelErr } = await supabase.from("transactions").update({
      status_id: 4, // 4 = ยกเลิก (CANCELLED)
      cancelled_at: now,
    }).eq("id", id).in("status_id", [1, 2]).select("id");
    if (cancelErr) throw cancelErr;
    if (!cancelled?.length) return res.status(409).json({ error: "รายการนี้ถูกดำเนินการไปแล้ว" });

    // Cancel related appointments
    await supabase.from("appointments").update({
      status_id: 4,
      cancelled_at: now,
      cancellation_reason: reason || "ยกเลิกการซื้อขาย",
    }).eq("transaction_id", id).eq("status_id", 1);

    // Release product back to AVAILABLE
    await supabase.from("products").update({ status_id: 1 }).eq("id", txn.product_id).eq("status_id", 2);

    res.json({ message: "ยกเลิกรายการซื้อขายแล้ว" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMyTransactions,
  getTransactionById,
  createTransaction,
  confirmTransaction,
  completeTransaction,
  cancelTransaction,
};
