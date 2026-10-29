const { supabase } = require("../config/db");
const { sendNotificationToUser } = require("../services/chatSocket");
const { formatUser, formatStatus, getStatusId } = require("../utils/statusHelper");

// ----------------------------------------------------------------
// Helper: ปรับคะแนนความน่าเชื่อถือ (Trust Score) และบันทึกลงประวัติ
// ----------------------------------------------------------------
async function recordPenalty(userId, actionType, reason) {
  try {
    const { data: rule } = await supabase
      .from("penalty_rules")
      .select("id, points_deducted")
      .eq("action_type", actionType)
      .eq("is_active", true)
      .maybeSingle();

    if (!rule) return;

    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", userId)
      .single();

    if (!user) return;

    const newScore = Math.max(0, (user.trust_score ?? 100) - rule.points_deducted);

    await supabase.from("users").update({ trust_score: newScore }).eq("id", userId);
    await supabase.from("user_penalties").insert({
      user_id: userId,
      penalty_rule_id: rule.id,
      reason: reason || actionType,
    });
    await supabase.from("user_score_history").insert({
      user_id: userId,
      change_amount: -rule.points_deducted,
      score_after: newScore,
      source_type: "PENALTY",
      reason: reason || actionType,
    });
  } catch (err) {
    console.error("[recordPenalty] error:", err);
  }
}

// ----------------------------------------------------------------
// Helper: คืนคะแนนความน่าเชื่อถือ (Trust Score) เมื่อปิดดีลสำเร็จ (+20 คะแนน สูงสุด 100)
// ----------------------------------------------------------------
async function recoverScoreOnDeal(sellerId, transactionId) {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", sellerId)
      .single();

    if (!user) return;

    const currentScore = user.trust_score ?? 100;
    if (currentScore < 100) {
      const newScore = Math.min(100, currentScore + 20);
      const pointsAdded = newScore - currentScore;

      await supabase.from("users").update({ trust_score: newScore }).eq("id", sellerId);
      const { error: histErr } = await supabase.from("user_score_history").insert({
        user_id: sellerId,
        change_amount: pointsAdded,
        score_after: newScore,
        source_type: "RECOVERY",
        reason: "SUCCESSFUL_DEAL",
      });
      if (histErr) {
        console.error("[recoverScoreOnDeal] user_score_history insert error:", histErr);
      }
    }
  } catch (err) {
    console.error("[recoverScoreOnDeal] error:", err);
  }
}

// ----------------------------------------------------------------
// GET /api/meetups/points  — จุดนัดรับทั้งหมด
// ----------------------------------------------------------------
async function getMeetupPoints(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name, description, latitude, longitude, created_at")
      .order("name");

    if (error) throw error;

    const points = (data || []).map((loc) => ({
      ...loc,
      latitude: parseFloat(loc.latitude),
      longitude: parseFloat(loc.longitude),
      is_active: true,
      isActive: true,
    }));

    res.json({ meetupPoints: points });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// Helper: Map Appointment to Frontend UI Model
// ----------------------------------------------------------------
function mapAppointment(a) {
  const apptStatus = formatStatus("appointment_status", a.appointment_status || a.status_id);
  const txn = a.transactions || {};
  const txnStatus = formatStatus("transaction_status", txn.transaction_status || txn.status_id);
  const prod = txn.products || {};
  const prodImgs = (prod.product_images || []).map((img, i) => ({
    id: img.id,
    url: img.image_url,
    imageUrl: img.image_url,
    is_cover: img.is_primary ?? (i === 0),
    isCover: img.is_primary ?? (i === 0),
  }));
  const primaryImg = prodImgs.find((img) => img.is_cover)?.url || prodImgs[0]?.url || null;

  const buyer = txn.buyer ? formatUser(txn.buyer) : {};
  const seller = txn.seller ? formatUser(txn.seller) : {};

  const scheduledAt = `${a.appointment_date}T${a.appointment_time}`;
  const price = parseFloat(prod.price || 0);

  return {
    id: a.id,
    transaction_id: a.transaction_id,
    transactionId: a.transaction_id,
    appointment_date: a.appointment_date,
    appointment_time: a.appointment_time,
    scheduledAt,
    scheduled_at: scheduledAt,
    location_id: a.location_id,
    locationId: a.location_id,
    location_detail: a.location_detail,
    locationDetail: a.location_detail,
    note: a.location_detail,
    status_id: a.status_id,
    status: apptStatus.ui,
    statusCode: apptStatus.code,
    statusName: apptStatus.name,
    buyer_checked_in: !!a.buyer_checked_in,
    seller_checked_in: !!a.seller_checked_in,
    buyerCheckedIn: !!a.buyer_checked_in,
    sellerCheckedIn: !!a.seller_checked_in,
    buyer_checked_in_at: a.buyer_checked_in_at,
    seller_checked_in_at: a.seller_checked_in_at,
    cancelled_at: a.cancelled_at,
    cancellation_reason: a.cancellation_reason,
    created_at: a.created_at,

    buyer_id: txn.buyer_id,
    seller_id: txn.seller_id,
    buyerId: txn.buyer_id,
    sellerId: txn.seller_id,
    product_id: txn.product_id,
    productId: txn.product_id,
    agreed_price: price,
    agreedPrice: price,
    price,

    location: a.locations ? {
      ...a.locations,
      latitude: parseFloat(a.locations.latitude),
      longitude: parseFloat(a.locations.longitude),
    } : null,
    meetupPoint: a.locations ? {
      ...a.locations,
      latitude: parseFloat(a.locations.latitude),
      longitude: parseFloat(a.locations.longitude),
    } : null,
    meetup_points: a.locations,

    transaction: {
      id: txn.id,
      buyer_id: txn.buyer_id,
      seller_id: txn.seller_id,
      product_id: txn.product_id,
      price,
      agreed_price: price,
      status: txnStatus.ui,
      statusCode: txnStatus.code,
      buyer_received: !!txn.buyer_received,
      seller_handed_over: !!txn.seller_handed_over,
    },

    product: {
      id: prod.id,
      title: prod.title || "สินค้า",
      price,
      image_url: primaryImg,
      imageUrl: primaryImg,
      images: prodImgs,
    },
    listing: {
      id: prod.id,
      title: prod.title || "สินค้า",
      price,
      image_url: primaryImg,
      imageUrl: primaryImg,
      images: prodImgs,
    },

    buyer,
    seller,
    buyerInfo: buyer,
    sellerInfo: seller,
  };
}

// ----------------------------------------------------------------
// GET /api/meetups  — นัดรับของฉัน
// ----------------------------------------------------------------
async function getMyMeetups(req, res, next) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data: txns } = await supabase
      .from("transactions")
      .select("id")
      .or(`buyer_id.eq.${req.user.id},seller_id.eq.${req.user.id}`);

    const txnIds = txns?.map((t) => t.id) || [];
    if (!txnIds.length) return res.json({ meetups: [], total: 0 });

    let query = supabase
      .from("appointments")
      .select(`
        id, transaction_id, appointment_date, appointment_time,
        location_id, location_detail, status_id,
        buyer_checked_in, seller_checked_in, buyer_checked_in_at, seller_checked_in_at,
        created_at, cancelled_at, cancellation_reason,
        appointment_status(id, name),
        locations(id, name, description, latitude, longitude),
        transactions(
          id, product_id, buyer_id, seller_id, status_id, buyer_received, seller_handed_over,
          transaction_status(id, name),
          products(id, title, price, product_images(id, image_url, is_primary)),
          buyer:users!buyer_id(id, username, full_name, avatar_url, profile_image_url),
          seller:users!seller_id(id, username, full_name, avatar_url, profile_image_url)
        )
      `, { count: "exact" })
      .in("transaction_id", txnIds);

    if (status) {
      const statusId = getStatusId("appointment_status", status);
      if (statusId) query = query.eq("status_id", statusId);
    }

    query = query
      .order("appointment_date", { ascending: true })
      .range(offset, offset + parseInt(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    const formatted = (data || []).map(mapAppointment);
    res.json({ meetups: formatted, total: count });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups  — นัดรับสินค้า
// ----------------------------------------------------------------
async function createMeetup(req, res, next) {
  try {
    let { transactionId, listingId, productId, sellerId, meetupPointId, locationId, scheduledAt, date, appointmentDate, time, appointmentTime, note, locationDetail } = req.body;

    const targetProductId = productId || listingId;
    const finalLocationRaw = locationId || meetupPointId;
    const finalDate = appointmentDate || date || (scheduledAt ? scheduledAt.split("T")[0] : new Date().toISOString().split("T")[0]);
    const finalTime = appointmentTime || time || (scheduledAt ? scheduledAt.split("T")[1]?.slice(0, 5) : "12:00");
    const finalDetail = locationDetail || note || null;

    let resolvedLocationId = parseInt(finalLocationRaw);
    if (isNaN(resolvedLocationId)) {
      const { data: firstLoc } = await supabase.from("locations").select("id").limit(1).single();
      resolvedLocationId = firstLoc?.id || 1;
    }

    let txn = null;
    if (transactionId) {
      const { data } = await supabase
        .from("transactions")
        .select("id, buyer_id, seller_id, status_id, product_id")
        .eq("id", transactionId)
        .single();
      txn = data;
    } else if (targetProductId) {
      const { data: product } = await supabase
        .from("products")
        .select("id, seller_id, price, title")
        .eq("id", targetProductId)
        .single();

      if (!product) return res.status(404).json({ error: "ไม่พบสินค้า" });
      if (product.seller_id === req.user.id) return res.status(400).json({ error: "ไม่สามารถซื้อสินค้าของตนเองได้" });

      const targetSellerId = sellerId ? parseInt(sellerId) : product.seller_id;

      // Find non-cancelled transaction
      const { data: existingTxns } = await supabase
        .from("transactions")
        .select("id, buyer_id, seller_id, status_id, product_id")
        .eq("product_id", targetProductId)
        .eq("buyer_id", req.user.id)
        .neq("status_id", 4) // 4 = ยกเลิก (CANCELLED)
        .limit(1);

      if (existingTxns?.length) {
        txn = existingTxns[0];
      } else {
        const { data: newTxn, error: tErr } = await supabase
          .from("transactions")
          .insert({
            product_id: targetProductId,
            buyer_id: req.user.id,
            seller_id: targetSellerId,
            status_id: 2, // 2 = ยืนยันแล้ว (CONFIRMED)
          })
          .select("id, buyer_id, seller_id, status_id, product_id")
          .single();

        if (tErr) throw tErr;
        txn = newTxn;

        // Mark product as RESERVED
        await supabase.from("products").update({ status_id: 2 }).eq("id", targetProductId);
      }
    }

    if (!txn) {
      return res.status(400).json({ error: "ไม่พบข้อมูลรายการซื้อขาย" });
    }

    // Insert Appointment
    const { data: appointment, error: aErr } = await supabase
      .from("appointments")
      .insert({
        transaction_id: txn.id,
        appointment_date: finalDate,
        appointment_time: finalTime,
        location_id: resolvedLocationId,
        location_detail: finalDetail,
        status_id: 1, // 1 = รอการยืนยัน (PENDING)
      })
      .select("id")
      .single();

    if (aErr) throw aErr;

    // Notify other party
    const partnerId = txn.buyer_id === req.user.id ? txn.seller_id : txn.buyer_id;
    const notifData = {
      user_id: partnerId,
      type: "meetup_scheduled",
      title: "มีการนัดหมายรับสินค้าใหม่ 📍",
      message: `นัดรับวันที่ ${finalDate} เวลา ${finalTime}`,
      reference_type: "meetup",
      reference_id: appointment.id,
    };
    const { data: insertedNotif } = await supabase.from("notifications").insert(notifData).select("*").single();
    sendNotificationToUser(partnerId, insertedNotif || notifData);

    res.status(201).json({
      message: "สร้างนัดรับสินค้าเรียบร้อยแล้ว",
      meetupId: appointment.id,
      appointment: { id: appointment.id },
      transactionId: txn.id,
    });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/accept  — ยืนยันนัดรับ
// ----------------------------------------------------------------
async function acceptMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transaction_id, transactions(buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });

    // Update appointment status to 2 = นัดหมายเรียบร้อย (CONFIRMED)
    await supabase.from("appointments").update({ status_id: 2 }).eq("id", id);
    // Update transaction status to 2 = ยืนยันแล้ว (CONFIRMED)
    await supabase.from("transactions").update({ status_id: 2 }).eq("id", appt.transaction_id);

    const partnerId = appt.transactions?.buyer_id === req.user.id
      ? appt.transactions?.seller_id
      : appt.transactions?.buyer_id;

    if (partnerId) {
      await supabase.from("notifications").insert({
        user_id: partnerId,
        type: "meetup_confirmed",
        title: "คู่ค้ายืนยันการนัดรับเรียบร้อยแล้ว 🎉",
        message: "การนัดหมายได้รับการยืนยันแล้ว สามารถไปตามจุดนัดหมายได้เลย",
        reference_type: "meetup",
        reference_id: id,
      });
    }

    res.json({ message: "ยืนยันการนัดรับเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/checkin  — เช็คอินจุดนัดรับ
// ----------------------------------------------------------------
async function checkInMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transaction_id, buyer_checked_in, seller_checked_in, transactions(buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });

    const isBuyer = appt.transactions?.buyer_id === req.user.id;
    const isSeller = appt.transactions?.seller_id === req.user.id;

    if (!isBuyer && !isSeller) return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });

    const now = new Date().toISOString();
    const updateData = isBuyer
      ? { buyer_checked_in: true, buyer_checked_in_at: now }
      : { seller_checked_in: true, seller_checked_in_at: now };

    const otherCheckedIn = isBuyer ? appt.seller_checked_in : appt.buyer_checked_in;
    if (otherCheckedIn) {
      updateData.status_id = 3; // 3 = นัดรับเสร็จ (COMPLETED)
    }

    await supabase.from("appointments").update(updateData).eq("id", id);

    res.json({ message: "เช็คอินจุดนัดรับสำเร็จ", bothCheckedIn: !!otherCheckedIn });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/complete  — จบการนัดรับ & ปิดดีลสำเร็จ
// ----------------------------------------------------------------
async function completeMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transaction_id, transactions(id, product_id, buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });

    const txn = appt.transactions;
    const now = new Date().toISOString();

    // Complete transaction
    let completedTxnId = txn.id;
    const { error: txUpdErr } = await supabase.from("transactions").update({
      status_id: 3, // 3 = ซื้อขายเสร็จ (COMPLETED)
      buyer_received: true,
      seller_handed_over: true,
      completed_at: now,
    }).eq("id", txn.id);

    if (txUpdErr && (txUpdErr.message?.includes("code") || txUpdErr.code === "42703")) {
      // Fallback if database trigger recover_score_on_deal failed due to missing 'code' column in transaction_status
      const { data: replacementTxn } = await supabase.from("transactions").insert({
        product_id: txn.product_id,
        buyer_id: txn.buyer_id,
        seller_id: txn.seller_id,
        status_id: 3,
        buyer_received: true,
        seller_handed_over: true,
        completed_at: now,
      }).select().single();

      if (replacementTxn) {
        completedTxnId = replacementTxn.id;
        await supabase.from("appointments").update({ transaction_id: replacementTxn.id, status_id: 3 }).eq("id", id);
        await supabase.from("transactions").delete().eq("id", txn.id);
      }
    } else {
      // Complete appointment
      await supabase.from("appointments").update({
        status_id: 3, // 3 = นัดรับเสร็จ (COMPLETED)
      }).eq("id", id);
    }

    // Complete product (mark SOLD)
    await supabase.from("products").update({
      status_id: 3, // 3 = ขายแล้ว (SOLD)
    }).eq("id", txn.product_id);

    // Increment successful_deal_count on buyer & seller and recover seller trust score
    if (txn.buyer_id) {
      const { data: bUser } = await supabase.from("users").select("successful_deal_count").eq("id", txn.buyer_id).single();
      await supabase.from("users").update({ successful_deal_count: (bUser?.successful_deal_count || 0) + 1 }).eq("id", txn.buyer_id);
    }
    if (txn.seller_id) {
      const { data: sUser } = await supabase.from("users").select("successful_deal_count").eq("id", txn.seller_id).single();
      await supabase.from("users").update({ successful_deal_count: (sUser?.successful_deal_count || 0) + 1 }).eq("id", txn.seller_id);
      await recoverScoreOnDeal(txn.seller_id, completedTxnId);
    }

    // Send notifications to both
    const notifMsg = {
      type: "deal_completed",
      title: "การซื้อขายเสร็จสมบูรณ์แล้ว! 🌟",
      message: "สินค้าส่งมอบเรียบร้อยแล้ว อย่าลืมให้คะแนนรีวิวเพื่อเพิ่มคะแนนความน่าเชื่อถือ",
      reference_type: "transaction",
      reference_id: completedTxnId,
    };
    if (txn.buyer_id) {
      await supabase.from("notifications").insert({ ...notifMsg, user_id: txn.buyer_id });
      sendNotificationToUser(txn.buyer_id, notifMsg);
    }
    if (txn.seller_id) {
      await supabase.from("notifications").insert({ ...notifMsg, user_id: txn.seller_id });
      sendNotificationToUser(txn.seller_id, notifMsg);
    }

    res.json({ message: "ปิดการซื้อขายเรียบร้อยแล้ว", transactionId: completedTxnId });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/cancel  — ยกเลิกนัดรับ
// ----------------------------------------------------------------
async function cancelMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const { reason = "ยกเลิกโดยผู้ใช้" } = req.body;

    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transaction_id, transactions(id, product_id, buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });

    const now = new Date().toISOString();

    // Cancel appointment
    await supabase.from("appointments").update({
      status_id: 4, // 4 = ยกเลิก (CANCELLED)
      cancelled_at: now,
      cancelled_by: req.user.id,
      cancellation_reason: reason,
    }).eq("id", id);

    // Cancel transaction
    await supabase.from("transactions").update({
      status_id: 4, // 4 = ยกเลิก (CANCELLED)
      cancelled_at: now,
    }).eq("id", appt.transaction_id);

    // Restore product to AVAILABLE
    if (appt.transactions?.product_id) {
      await supabase.from("products").update({
        status_id: 1, // 1 = ว่าง (AVAILABLE)
      }).eq("id", appt.transactions.product_id);
    }

    // Record penalty if cancellation reason warrants it
    if (reason.toLowerCase().includes("ไม่มา") || reason.toLowerCase().includes("no-show")) {
      await recordPenalty(req.user.id, "NO_SHOW", reason);
    }

    res.json({ message: "ยกเลิกนัดรับสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/reschedule  — เปลี่ยนวันเวลาหรือสถานที่
// ----------------------------------------------------------------
async function rescheduleMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const { appointmentDate, appointmentTime, date, time, scheduledAt, locationId, meetupPointId, locationDetail, note } = req.body;

    const finalDate = appointmentDate || date || (scheduledAt ? scheduledAt.split("T")[0] : undefined);
    const finalTime = appointmentTime || time || (scheduledAt ? scheduledAt.split("T")[1]?.slice(0, 5) : undefined);
    const finalLoc = locationId || meetupPointId;
    const finalDetail = locationDetail || note;

    const updates = {
      status_id: 1, // 1 = รอการยืนยัน (PENDING)
      buyer_checked_in: false,
      seller_checked_in: false,
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
    };
    if (finalDate) updates.appointment_date = finalDate;
    if (finalTime) updates.appointment_time = finalTime;
    if (finalLoc) updates.location_id = parseInt(finalLoc);
    if (finalDetail !== undefined) updates.location_detail = finalDetail;

    await supabase.from("appointments").update(updates).eq("id", id);

    res.json({ message: "เปลี่ยนแปลงการนัดหมายเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMeetupPoints,
  getMyMeetups,
  createMeetup,
  acceptMeetup,
  checkInMeetup,
  completeMeetup,
  cancelMeetup,
  rescheduleMeetup,
};