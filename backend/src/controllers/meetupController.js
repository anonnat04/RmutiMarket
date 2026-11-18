const { supabase } = require("../config/db");
const { sendNotificationToUser, emitMeetupUpdate } = require("../services/chatSocket");
const { formatUser, formatStatus, getStatusId } = require("../utils/statusHelper");

// ----------------------------------------------------------------
// ค่าคงที่ของระบบนัดรับ
// ----------------------------------------------------------------
// เวลานัดรับที่อนุญาต (นาทีนับจากเที่ยงคืน): 08:00 – 20:00 น.
const MEETUP_START_MIN = 8 * 60;
const MEETUP_END_MIN = 20 * 60;
const MEETUP_HOURS_TEXT = "นัดรับได้เฉพาะเวลา 08:00 – 20:00 น. เท่านั้น";

// ค่า fallback ถ้าอ่านกฎจากตาราง penalty_rules ไม่ได้ (ค่าจริงอยู่ในตาราง penalty_rules)
const NO_SHOW_GRACE_MINUTES = 45;
const LATE_CANCEL_THRESHOLD_MINUTES = 120;
const LATE_CANCEL_GRACE_MINUTES = 15;

// สถานะนัดหมาย: 1=PENDING 2=CONFIRMED 3=COMPLETED 4=CANCELLED 5=NO_SHOW
// สถานะธุรกรรม: 3=COMPLETED 4=CANCELLED

// ----------------------------------------------------------------
// Helper: วันที่/เวลาตามเขตเวลาไทย (เซิร์ฟเวอร์อาจใช้ UTC)
// ----------------------------------------------------------------
function todayInBangkok() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD
}

// แปลง "วันที่ + เวลา" ของนัดหมาย (เวลาไทย) เป็น Date ที่ถูกต้องไม่ว่าเซิร์ฟเวอร์จะอยู่เขตเวลาไหน
function appointmentToDate(dateStr, timeStr) {
  const t = String(timeStr || "").slice(0, 5);
  return new Date(`${dateStr}T${t}:00+07:00`);
}

function toMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isWithinMeetupHours(timeStr) {
  if (!timeStr || !/^\d{1,2}:\d{2}/.test(String(timeStr))) return false;
  const mins = toMinutes(timeStr);
  return mins >= MEETUP_START_MIN && mins <= MEETUP_END_MIN;
}

function isParticipant(txn, userId) {
  if (!txn) return false;
  return String(txn.buyer_id) === String(userId) || String(txn.seller_id) === String(userId);
}

// ----------------------------------------------------------------
// Helper: อ่านกฎจากตาราง penalty_rules (cache 30 วินาที แก้ใน DB แล้วมีผลเอง)
// ----------------------------------------------------------------
let _rulesCache = { at: 0, map: {} };
async function getPenaltyRule(actionType) {
  if (Date.now() - _rulesCache.at > 30000) {
    const { data, error } = await supabase
      .from("penalty_rules")
      .select("id, action_type, points_deducted, threshold_minutes, grace_minutes, is_active");
    if (!error && data) {
      const map = {};
      data.forEach((r) => { map[r.action_type] = r; });
      _rulesCache = { at: Date.now(), map };
    }
  }
  return _rulesCache.map[actionType] || null;
}

// ----------------------------------------------------------------
// Helper: ตัดคะแนนความน่าเชื่อถือ (Trust Score) ตามกฎในตาราง penalty_rules
// หมายเหตุ: ต้องรัน fix_source_id.sql (เพิ่มคอลัมน์ user_score_history.source_id) ก่อน
// ----------------------------------------------------------------
async function recordPenalty(userId, actionType, reason, sourceId = null) {
  try {
    const rule = await getPenaltyRule(actionType);
    if (!rule || !rule.is_active) return { penalized: false, pointsDeducted: 0 }; // ไม่มีกฎหรือปิดกฎ = ไม่ตัดคะแนน

    // Trigger ในฐานข้อมูลอาจบันทึกโทษรายการเดียวกันไปแล้ว ตรวจ source_id ก่อนกันหักซ้ำ
    if (sourceId != null) {
      const { data: existingPenalty, error: historyCheckErr } = await supabase
        .from("user_score_history")
        .select("id")
        .eq("user_id", userId)
        .eq("source_type", "PENALTY")
        .eq("source_id", sourceId)
        .maybeSingle();
      if (historyCheckErr) throw historyCheckErr;
      if (existingPenalty) return { penalized: true, alreadyApplied: true, pointsDeducted: rule.points_deducted };
    }
    const pointsDeducted = rule.points_deducted;

    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", userId)
      .single();

    // FIX: คืนค่าให้ครบรูปแบบ เพื่อไม่ให้ฝั่งที่เรียกอ่าน penalty.penalized แล้วพัง
    if (!user) return { penalized: false, pointsDeducted: 0 };

    const currentScore = user.trust_score ?? 100;
    const newScore = Math.max(0, currentScore - pointsDeducted);

    const { error: userUpdateErr } = await supabase.from("users").update({ trust_score: newScore }).eq("id", userId);
    if (userUpdateErr) throw userUpdateErr;

    const { error: penaltyInsertErr } = await supabase.from("user_penalties").insert({
      user_id: userId,
      penalty_rule_id: rule.id,
      reason: reason || actionType,
    });
    if (penaltyInsertErr) throw penaltyInsertErr;

    const { error: historyInsertErr } = await supabase.from("user_score_history").insert({
      user_id: userId,
      change_amount: -(currentScore - newScore),
      score_after: newScore,
      source_type: "PENALTY",
      source_id: sourceId,
      reason: reason || actionType,
    });
    if (historyInsertErr) throw historyInsertErr;
    console.log(`⚠️ [TrustScore Penalty] User ${userId} penalized -${pointsDeducted} pts for ${actionType} (New score: ${newScore})`);
    return { penalized: true, pointsDeducted: currentScore - newScore };
  } catch (err) {
    console.error("[recordPenalty] error:", err);
    return { penalized: false, pointsDeducted: 0, error: err?.message };
  }
}

async function persistAndSendNotification(userId, notification) {
  const payload = { ...notification, user_id: userId };
  try {
    const { data, error } = await supabase.from("notifications").insert(payload).select("*").single();
    if (error) throw error;
    sendNotificationToUser(userId, data || payload);
  } catch (err) {
    console.warn("[meetup notification] persist failed:", err?.message || err);
    sendNotificationToUser(userId, payload);
  }
}

// ----------------------------------------------------------------
// Helper: คืนคะแนนความน่าเชื่อถือ (Trust Score) เมื่อปิดดีลสำเร็จ (+20 คะแนน สูงสุด 100)
// FIX: บันทึกประวัติก่อน แล้วค่อยอัปเดต users.trust_score
// ----------------------------------------------------------------
async function recoverScoreOnDeal(sellerId, transactionId) {
  try {
    const { data: existingRecovery } = await supabase
      .from("user_score_history")
      .select("id")
      .eq("user_id", sellerId)
      .eq("source_type", "RECOVERY")
      .eq("source_id", transactionId)
      .maybeSingle();
    if (existingRecovery) return;

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

      const { error: histErr } = await supabase.from("user_score_history").insert({
        user_id: sellerId,
        change_amount: pointsAdded,
        score_after: newScore,
        source_type: "RECOVERY",
        source_id: transactionId,
        reason: "SUCCESSFUL_DEAL",
      });
      if (histErr) {
        console.error("[recoverScoreOnDeal] user_score_history insert error:", histErr);
        return; // ไม่อัปเดตคะแนนถ้าบันทึกประวัติไม่สำเร็จ
      }

      const { error: scoreErr } = await supabase
        .from("users")
        .update({ trust_score: newScore })
        .eq("id", sellerId);
      if (scoreErr) {
        console.error("[recoverScoreOnDeal] users update error:", scoreErr);
        return;
      }

      // ส่ง Notification แจ้งเตือนผู้ขาย
      await persistAndSendNotification(sellerId, {
        type: "score_recovery",
        title: "🎉 ได้รับ Trust Score คืน +20 คะแนน!",
        message: `คุณขายสินค้าสำเร็จ ระบบคืนคะแนนความน่าเชื่อถือให้ +${pointsAdded} คะแนน (คะแนนปัจจุบัน: ${newScore}/100)`,
        reference_type: "transaction",
        reference_id: transactionId,
      });
    }
  } catch (err) {
    console.error("[recoverScoreOnDeal] error:", err);
  }
}

// ----------------------------------------------------------------
// Background Job: คืนคะแนนความน่าเชื่อถือประจำวันอาทิตย์ (+5 คะแนน สูงสุด 100)
// สำหรับผู้ใช้งานทุกคนที่คะแนนยังไม่เต็ม 100
// ----------------------------------------------------------------
async function processWeeklySundayRecovery(force = false) {
  try {
    const now = new Date();
    // แปลงเวลาเป็นโซนเวลาประเทศไทย (Asia/Bangkok)
    const bkkString = now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" });
    const bkkDate = new Date(bkkString);
    const dayOfWeek = bkkDate.getDay(); // 0 = Sunday

    if (dayOfWeek !== 0 && !force) {
      return { executed: false, reason: "Today is not Sunday" };
    }

    // หาวันที่เริ่มต้นของวันอาทิตย์นี้ตามเวลาไทย (00:00:00)
    const year = bkkDate.getFullYear();
    const month = String(bkkDate.getMonth() + 1).padStart(2, "0");
    const day = String(bkkDate.getDate()).padStart(2, "0");
    const todayBangkokMidnight = new Date(`${year}-${month}-${day}T00:00:00+07:00`).toISOString();

    // ดึงผู้ใช้ทั้งหมดที่คะแนน trust_score ต่ำกว่า 100
    const { data: usersBelow100, error: usersErr } = await supabase
      .from("users")
      .select("id, username, trust_score, role")
      .lt("trust_score", 100);

    if (usersErr) {
      console.error("[processWeeklySundayRecovery] fetch users error:", usersErr);
      return { executed: false, error: usersErr.message };
    }

    if (!usersBelow100 || usersBelow100.length === 0) {
      return { executed: true, recoveredCount: 0, message: "No users need recovery" };
    }

    // ดึงประวัติว่าวันอาทิตย์นี้ผู้ใช้คนไหนได้รับ WEEKLY_RECOVERY ไปแล้วบ้าง
    const { data: alreadyRecovered, error: histCheckErr } = await supabase
      .from("user_score_history")
      .select("user_id")
      .eq("source_type", "RECOVERY")
      .eq("reason", "WEEKLY_RECOVERY")
      .gte("created_at", todayBangkokMidnight);

    if (histCheckErr) {
      console.error("[processWeeklySundayRecovery] check history error:", histCheckErr);
    }

    const processedSet = new Set((alreadyRecovered || []).map((r) => r.user_id));
    let recoveredCount = 0;

    for (const user of usersBelow100) {
      if (processedSet.has(user.id)) {
        continue;
      }

      const currentScore = user.trust_score ?? 100;
      if (currentScore >= 100) continue;

      const newScore = Math.min(100, currentScore + 5);
      const pointsAdded = newScore - currentScore;
      if (pointsAdded <= 0) continue;

      // บันทึกลง user_score_history (source_id = 2 ตามตาราง score_recovery_rules id 2: WEEKLY_RECOVERY)
      const { error: insErr } = await supabase.from("user_score_history").insert({
        user_id: user.id,
        change_amount: pointsAdded,
        score_after: newScore,
        source_type: "RECOVERY",
        source_id: 2,
        reason: "WEEKLY_RECOVERY",
      });

      if (insErr) {
        console.error(`[processWeeklySundayRecovery] history insert failed for user ${user.id}:`, insErr);
        continue;
      }

      // อัปเดต trust_score ของผู้ใช้
      const { error: upErr } = await supabase
        .from("users")
        .update({ trust_score: newScore })
        .eq("id", user.id);

      if (upErr) {
        console.error(`[processWeeklySundayRecovery] user score update failed for user ${user.id}:`, upErr);
        continue;
      }

      // ส่งการแจ้งเตือนเข้าแอป
      await persistAndSendNotification(user.id, {
        type: "score_recovery",
        title: "🎉 ได้รับ Trust Score คืน +5 คะแนน!",
        message: `ระบบคืนคะแนนความน่าเชื่อถือประจำวันอาทิตย์ให้คุณ +${pointsAdded} คะแนน (คะแนนปัจจุบัน: ${newScore}/100)`,
        reference_type: "system",
        reference_id: null,
      });

      recoveredCount++;
    }

    console.log(`[processWeeklySundayRecovery] Complete: restored scores for ${recoveredCount} users.`);
    return { executed: true, recoveredCount };
  } catch (err) {
    console.error("[processWeeklySundayRecovery] fatal error:", err);
    return { executed: false, error: err.message };
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
// Helper: ยกเลิกธุรกรรม + คืนสินค้าเป็นว่าง (AVAILABLE) พร้อมเช็ค error ไม่ให้พังเงียบ
// ----------------------------------------------------------------
async function cancelTransactionAndRelease(transactionId, productId, nowIso) {
  let ok = true;
  if (transactionId) {
    const { error } = await supabase
      .from("transactions")
      .update({ status_id: 4, cancelled_at: nowIso }) // 4 = CANCELLED
      .eq("id", transactionId)
      .in("status_id", [1, 2]); // ไม่แตะธุรกรรมที่เสร็จสิ้น/ยกเลิกไปแล้ว
    if (error) {
      ok = false;
      console.error(`[cancelTransactionAndRelease] cancel transaction #${transactionId} failed:`, error.message);
    }
  }
  if (productId) {
    const { error } = await supabase
      .from("products")
      .update({ status_id: 1 }) // 1 = AVAILABLE
      .eq("id", productId)
      .eq("status_id", 2); // คืนเฉพาะสินค้าที่ถูกจอง (RESERVED) ไม่ทับสถานะขายแล้ว
    if (error) {
      ok = false;
      console.error(`[cancelTransactionAndRelease] release product #${productId} failed:`, error.message);
    }
  }
  return ok;
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

  // ข้อมูลนัดหมายที่เหลือจากบัญชี/สินค้าเก่าซึ่งถูกลบไปแล้วต้องไม่ส่งให้
  // หน้าผู้ใช้ เพราะไม่มีคู่ค้าจริงให้ทำรายการต่อได้
  if (!txn.id || !prod.id || !txn.buyer || !txn.seller ||
      txn.buyer.status === "deleted" || txn.seller.status === "deleted") {
    return null;
  }

  const scheduledAt = `${a.appointment_date}T${a.appointment_time}`;
  const price = parseFloat(prod.price || 0);

  // locationName ต้องมาจาก locations.name และรายละเอียดเพิ่มเติมอยู่ใน meeting_detail
  const realLocName = a.locations?.name || "จุดนัดรับ มทร.อีสาน";
  const meetingDetail = a.meeting_detail ? String(a.meeting_detail).trim() : null;

  const locObj = a.locations ? {
    ...a.locations,
    name: realLocName,
    latitude: parseFloat(a.locations.latitude),
    longitude: parseFloat(a.locations.longitude),
  } : null;
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
    meeting_detail: meetingDetail,
    meetingDetail,
    note: meetingDetail || '',
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
    confirmed_at: a.confirmed_at || null,
    confirmedAt: a.confirmed_at || null,
    created_by: a.created_by || null,
    createdBy: a.created_by || null,

    buyer_id: txn.buyer_id,
    seller_id: txn.seller_id,
    buyerId: txn.buyer_id,
    sellerId: txn.seller_id,
    product_id: txn.product_id,
    productId: txn.product_id,
    product_title: prod.title || "สินค้า",
    productTitle: prod.title || "สินค้า",
    product_image: primaryImg,
    productImage: primaryImg,
    image_url: primaryImg,
    imageUrl: primaryImg,
    agreed_price: price,
    agreedPrice: price,
    price,

    location: locObj,
    meetupPoint: locObj,
    meetup_points: locObj,
    locationName: realLocName,

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
    reviews: txn.reviews || [],
  };
}

// ----------------------------------------------------------------
// Helper: ลบคำขอนัดที่ "เลยเวลานัดแล้วแต่ไม่มีใครกดยืนยัน" (PENDING = 1)
// ไม่ตัดคะแนนใคร ยกเลิกธุรกรรม คืนสินค้าเป็นว่าง และแจ้งทั้งสองฝ่าย
// ----------------------------------------------------------------
async function expireStalePendingAppointments() {
  try {
    const { data: pending, error } = await supabase
      .from("appointments")
      .select("id, appointment_date, appointment_time, transaction_id, transactions(id, product_id, buyer_id, seller_id)")
      .eq("status_id", 1)
      .lte("appointment_date", todayInBangkok());

    if (error || !pending?.length) return;

    const now = new Date();
    const nowIso = now.toISOString();

    for (const appt of pending) {
      const apptDate = appointmentToDate(appt.appointment_date, appt.appointment_time);
      if (isNaN(apptDate.getTime()) || apptDate > now) continue; // ยังไม่ถึงเวลานัด

      // "จอง" การลบ เฉพาะแถวที่ยังเป็น PENDING กันประมวลผลซ้ำ/ชนกับการกดยืนยัน
      const { data: removed } = await supabase
        .from("appointments")
        .delete()
        .eq("id", appt.id)
        .eq("status_id", 1)
        .select("id");
      if (!removed?.length) continue;

      const txn = appt.transactions || {};
      console.log(`🧹 [Expire Pending] Appointment #${appt.id} passed its time without confirmation — removed`);

      await cancelTransactionAndRelease(appt.transaction_id, txn.product_id, nowIso);

      for (const uid of [txn.buyer_id, txn.seller_id]) {
        if (!uid) continue;
        const notif = {
          user_id: uid,
          type: "meetup_cancelled",
          title: "คำขอนัดรับหมดอายุ",
          message: "คำขอนัดรับสินค้าถูกลบ เนื่องจากเลยเวลานัดโดยไม่มีการยืนยัน (ไม่มีการตัดคะแนน) สามารถขอนัดใหม่ได้",
          reference_type: "meetup",
          reference_id: appt.id,
        };
        try {
          const { data: ins } = await supabase.from("notifications").insert(notif).select("*").single();
          sendNotificationToUser(uid, ins || notif);
        } catch (_) {
          sendNotificationToUser(uid, notif);
        }
      }

      emitMeetupUpdate(appt.id, {
        meetupId: appt.id,
        status: "expired",
        statusCode: "EXPIRED",
        buyerId: txn.buyer_id,
        sellerId: txn.seller_id,
      });
    }
  } catch (err) {
    console.error("[expireStalePendingAppointments] error:", err.message);
  }
}

// ----------------------------------------------------------------
// Helper: ตรวจสอบและตัดจบนัดหมายที่เลยเวลา (threshold_minutes ของกฎ NO_SHOW) และตัดคะแนนคนไม่มาเช็คอิน
// ----------------------------------------------------------------
async function checkAndProcessNoShows() {
  try {
    await closeUnconfirmedDeliveries();
    await expireStalePendingAppointments();

    const noShowRule = await getPenaltyRule("NO_SHOW");
    const graceMin = noShowRule?.threshold_minutes ?? NO_SHOW_GRACE_MINUTES;

    const { data: confirmedAppts, error: fetchErr } = await supabase
      .from("appointments")
      .select(`
        id, appointment_date, appointment_time, transaction_id,
        buyer_checked_in, seller_checked_in, status_id,
        transactions(id, product_id, buyer_id, seller_id)
      `)
      .eq("status_id", 2); // 2 = CONFIRMED (นัดหมายเรียบร้อย)

    if (fetchErr || !confirmedAppts?.length) return;

    let noShowStatusId = 5;
    try {
      // appointment_status ไม่มีคอลัมน์ code จึงค้นจากชื่ออย่างเดียว
      const { data: noShowDb } = await supabase
        .from("appointment_status")
        .select("id")
        .ilike("name", "%ไม่มา%")
        .limit(1)
        .maybeSingle();
      if (noShowDb?.id) noShowStatusId = noShowDb.id;
    } catch (_) {}

    const now = new Date();

    for (const appt of confirmedAppts) {
      if (!appt.appointment_date || !appt.appointment_time) continue;

      const apptDate = appointmentToDate(appt.appointment_date, appt.appointment_time);
      if (isNaN(apptDate.getTime())) continue;

      // เส้นตาย: เวลานัด + graceMin
      const deadline = new Date(apptDate.getTime() + graceMin * 60 * 1000);

      if (now > deadline) {
        const buyerCheckedIn = Boolean(appt.buyer_checked_in);
        const sellerCheckedIn = Boolean(appt.seller_checked_in);

        // ถ้าทั้งสองฝ่ายเช็คอินครบแล้ว ไม่ถือเป็น No-show
        if (buyerCheckedIn && sellerCheckedIn) continue;

        const txn = appt.transactions || {};
        const nowIso = now.toISOString();

        // 1. "จอง" นัดหมายนี้ด้วยการเปลี่ยนสถานะเฉพาะแถวที่ยังเป็น CONFIRMED กันตัดคะแนนซ้ำ
        const { data: claimed } = await supabase
          .from("appointments")
          .update({
            status_id: noShowStatusId,
            cancelled_at: nowIso,
            cancellation_reason: `หมดเวลาเช็คอิน (เกินเวลานัด ${graceMin} นาที ไม่มาตามนัด)`,
          })
          .eq("id", appt.id)
          .eq("status_id", 2)
          .select("id");

        if (!claimed?.length) continue; // มีคนประมวลผลไปแล้ว

        console.log(`🚨 [NO_SHOW Auto-Close] Appointment #${appt.id} passed ${graceMin}m deadline. Buyer checked in: ${buyerCheckedIn}, Seller checked in: ${sellerCheckedIn}`);

        // 2. ยกเลิก Transaction และนำสินค้ากลับมาวางขายใหม่ (AVAILABLE)
        await cancelTransactionAndRelease(appt.transaction_id, txn.product_id, nowIso);

        // 3. ตัดคะแนนความน่าเชื่อถือของผู้ที่ไม่มาเช็คอิน
        if (!buyerCheckedIn && txn.buyer_id) {
          const penalty = await recordPenalty(
            txn.buyer_id,
            "NO_SHOW",
            `ผู้ซื้อไม่มาตามนัดรับสินค้า (เกินเวลา ${graceMin} นาที) - นัดหมาย #${appt.id}`,
            appt.id
          );
          await persistAndSendNotification(txn.buyer_id, {
            type: penalty.penalized ? "penalty" : "meetup_cancelled",
            title: penalty.penalized ? "⚠️ คุณถูกตัดคะแนนเนื่องจากไม่มาตามนัด" : "นัดรับสิ้นสุดเนื่องจากไม่เช็คอิน",
            message: penalty.penalized
              ? `ระบบหัก ${penalty.pointsDeducted} คะแนนความน่าเชื่อถือ เนื่องจากไม่มาเช็คอินภายใน ${graceMin} นาที`
              : `นัดสิ้นสุดหลังเลยเวลาเช็คอิน ${graceMin} นาที โดยกฎคะแนนปัจจุบันไม่ได้บันทึกการหักคะแนน`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        }

        if (!sellerCheckedIn && txn.seller_id) {
          const penalty = await recordPenalty(
            txn.seller_id,
            "NO_SHOW",
            `ผู้ขายไม่มาตามนัดรับสินค้า (เกินเวลา ${graceMin} นาที) - นัดหมาย #${appt.id}`,
            appt.id
          );
          await persistAndSendNotification(txn.seller_id, {
            type: penalty.penalized ? "penalty" : "meetup_cancelled",
            title: penalty.penalized ? "⚠️ คุณถูกตัดคะแนนเนื่องจากไม่มาตามนัด" : "นัดรับสิ้นสุดเนื่องจากไม่เช็คอิน",
            message: penalty.penalized
              ? `ระบบหัก ${penalty.pointsDeducted} คะแนนความน่าเชื่อถือ เนื่องจากไม่มาเช็คอินภายใน ${graceMin} นาที`
              : `นัดสิ้นสุดหลังเลยเวลาเช็คอิน ${graceMin} นาที โดยกฎคะแนนปัจจุบันไม่ได้บันทึกการหักคะแนน`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        }

        // แจ้งเตือนคู่ค้าที่มาเช็คอินตามนัด
        if (buyerCheckedIn && !sellerCheckedIn && txn.buyer_id) {
          await persistAndSendNotification(txn.buyer_id, {
            type: "meetup_cancelled",
            title: "นัดหมายถูกตัดจบ (ผู้ขายไม่มาตามนัด)",
            message: `เนื่องจากผู้ขายไม่ได้มาเช็คอินภายใน ${graceMin} นาที ระบบจึงตัดจบนัดหมายและตัดคะแนนผู้ขาย`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        } else if (sellerCheckedIn && !buyerCheckedIn && txn.seller_id) {
          await persistAndSendNotification(txn.seller_id, {
            type: "meetup_cancelled",
            title: "นัดหมายถูกตัดจบ (ผู้ซื้อไม่มาตามนัด)",
            message: `เนื่องจากผู้ซื้อไม่ได้มาเช็คอินภายใน ${graceMin} นาที ระบบจึงตัดจบนัดหมายและนำสินค้ากลับสู่สถานะว่างขายใหม่`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        }

        // 4. บรอดแคสต์ socket อัปเดตแบบ Realtime
        emitMeetupUpdate(appt.id, {
          meetupId: appt.id,
          status: "no_show",
          statusCode: "NO_SHOW",
          buyerId: txn.buyer_id,
          sellerId: txn.seller_id,
        });
      }
    }
  } catch (err) {
    console.error("[checkAndProcessNoShows] error:", err.message);
  }
}

// A deal gets 24 hours from the second check-in for BOTH delivery confirmations
// and BOTH reviews. Until then it remains CONFIRMED and no score is awarded.
async function closeUnconfirmedDeliveries() {
  const { data: rows, error } = await supabase.from("appointments")
    .select("id, transaction_id, status_id, buyer_checked_in_at, seller_checked_in_at, transactions(id, product_id, buyer_id, seller_id, buyer_received, seller_handed_over, status_id, reviews(reviewer_id))")
    .in("status_id", [2, 3]).eq("buyer_checked_in", true).eq("seller_checked_in", true);
  if (error || !rows?.length) return;
  const { data: status } = await supabase.from("transaction_status").select("id, name").ilike("name", "%UNCONFIRMED%").maybeSingle();
  const unconfirmedId = status?.id || 6;
  const now = Date.now();
  for (const appt of rows) {
    const checkedAt = [appt.buyer_checked_in_at, appt.seller_checked_in_at].map((v) => Date.parse(v)).filter(Number.isFinite);
    if (checkedAt.length !== 2 || now - Math.max(...checkedAt) < 24 * 60 * 60 * 1000) continue;
    const txn = appt.transactions;
    if (!txn || Number(txn.status_id) !== 2) continue;
    const reviewers = new Set((txn.reviews || []).map((review) => String(review.reviewer_id)));
    const missingConfirmation = !txn.buyer_received || !txn.seller_handed_over;
    const missingReview = !reviewers.has(String(txn.buyer_id)) || !reviewers.has(String(txn.seller_id));
    if (!missingConfirmation && !missingReview) continue;
    const reason = `UNCONFIRMED: ${missingConfirmation ? "ยืนยันรับ/ส่งสินค้าไม่ครบ" : ""}${missingConfirmation && missingReview ? " และ " : ""}${missingReview ? "รีวิวไม่ครบทั้งสองฝ่าย" : ""} ภายใน 24 ชั่วโมงหลังเช็คอินครบ`;
    const { data: claimed } = await supabase.from("appointments").update({ status_id: 4, cancelled_at: new Date().toISOString(), cancellation_reason: reason }).eq("id", appt.id).in("status_id", [2, 3]).select("id");
    if (!claimed?.length) continue;
    await supabase.from("transactions").update({ status_id: unconfirmedId, cancelled_at: new Date().toISOString() }).eq("id", txn.id).eq("status_id", 2);
    await supabase.from("products").update({ status_id: 1 }).eq("id", txn.product_id).eq("status_id", 2);
    for (const userId of [txn.buyer_id, txn.seller_id]) if (userId) await persistAndSendNotification(userId, {
      type: "deal_unconfirmed", title: "ปิดรายการเนื่องจากดำเนินการไม่ครบ", message: `${reason} จึงปิดดีล ไม่สามารถรีวิว และไม่มีการปรับ Trust Score`,
      reference_type: "meetup", reference_id: appt.id,
    });
    emitMeetupUpdate(appt.id, { meetupId: appt.id, status: "unconfirmed", statusCode: "UNCONFIRMED", buyerId: txn.buyer_id, sellerId: txn.seller_id });
  }
}

// กันไม่ให้ตรวจ No-show ถี่เกินไป (หน้าเช็คอินเรียก getMyMeetups ทุก 4 วินาที)
let lastNoShowCheck = 0;
async function maybeCheckNoShows() {
  const nowMs = Date.now();
  if (nowMs - lastNoShowCheck < 20000) return;
  lastNoShowCheck = nowMs;
  await checkAndProcessNoShows();
}

// ----------------------------------------------------------------
// GET /api/meetups  — นัดรับของฉัน
// ----------------------------------------------------------------
async function getMyMeetups(req, res, next) {
  try {
    // ตรวจสอบและตัดจบนัดหมายที่เลยเวลาอัตโนมัติก่อนดึงข้อมูล
    await maybeCheckNoShows();

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
        location_id, location_detail, meeting_detail, status_id,
        buyer_checked_in, seller_checked_in, buyer_checked_in_at, seller_checked_in_at,
        created_at, confirmed_at, created_by, cancelled_at, cancellation_reason,
        appointment_status(id, name),
        locations(id, name, description, latitude, longitude),
        transactions(
          id, product_id, buyer_id, seller_id, status_id, buyer_received, seller_handed_over,
          transaction_status(id, name),
          products(id, title, price, product_images(id, image_url, is_primary)),
          buyer:users!buyer_id(id, username, full_name, avatar_url, profile_image_url, status),
          seller:users!seller_id(id, username, full_name, avatar_url, profile_image_url, status),
          reviews(id, reviewer_id, reviewee_id, rating, comment, created_at)
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

    const { data, error } = await query;
    if (error) throw error;

    // กรองข้อมูลตกค้างที่อาจเกิดก่อนตั้งค่า foreign key แบบ cascade
    const formatted = (data || []).map(mapAppointment).filter(Boolean);
    res.json({ meetups: formatted, total: formatted.length });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// Helper: เปิดธุรกรรมใหม่ (สินค้าคงสถานะว่าง status_id = 1 ไม่เปลี่ยนเป็นจอง)
// ผู้ซื้อคนเดิมนัดสินค้าเดิมซ้อนได้แค่ 1 รายการที่ยังไม่จบ (คนละคนนัดซ้อนกันได้)
// ----------------------------------------------------------------
async function openNewTransaction(productId, buyerId, sellerId) {
  // ตรวจสอบสินค้า: ต้องมีอยู่จริงและยังไม่ขาย (3 = SOLD)
  const { data: prod, error: pErr } = await supabase
    .from("products")
    .select("id, status_id")
    .eq("id", productId)
    .single();

  if (pErr || !prod) {
    return { error: "ไม่พบสินค้า" };
  }
  if (Number(prod.status_id) === 3) {
    return { error: "สินค้านี้ขายแล้ว ไม่สามารถนัดรับได้" };
  }

  // ผู้ซื้อคนเดิมนัดสินค้าเดิมซ้อนได้แค่ 1 รายการที่ยังไม่จบ
  const { data: existingTxn } = await supabase
    .from("transactions")
    .select("id, buyer_id, seller_id, status_id, product_id")
    .eq("product_id", productId)
    .eq("buyer_id", buyerId)
    .is("cancelled_at", null)
    .is("completed_at", null)
    .in("status_id", [1, 2])
    .maybeSingle();

  if (existingTxn) {
    return { txn: existingTxn };
  }

  // สร้างธุรกรรมใหม่ในสถานะ PENDING (1) โดยสินค้ายังคงสถานะว่าง (1 = AVAILABLE)
  const { data: newTxn, error: tErr } = await supabase
    .from("transactions")
    .insert({
      product_id: productId,
      buyer_id: buyerId,
      seller_id: sellerId,
      status_id: 1, // 1 = PENDING (รอยืนยันนัดหมาย)
    })
    .select("id, buyer_id, seller_id, status_id, product_id")
    .single();

  if (tErr) throw tErr;
  return { txn: newTxn };
}

// ----------------------------------------------------------------
// POST /api/meetups  — นัดรับสินค้า
// ----------------------------------------------------------------
async function createMeetup(req, res, next) {
  let newlyCreatedTxn = null;
  try {
    let { transactionId, listingId, productId, sellerId, meetupPointId, locationId, scheduledAt, date, appointmentDate, time, appointmentTime, meetingDetail, locationName, locationLat, locationLng } = req.body;

    const targetProductId = productId || listingId;
    const finalLocationRaw = locationId || meetupPointId;
    const finalDate = appointmentDate || date || (scheduledAt ? scheduledAt.split("T")[0] : todayInBangkok());
    const finalTime = appointmentTime || time || (scheduledAt ? scheduledAt.split("T")[1]?.slice(0, 5) : "12:00");
    const finalMeetingDetail = meetingDetail == null ? null : String(meetingDetail).trim().slice(0, 300);

    // ── ตรวจเวลานัดรับต้องอยู่ในช่วง 08:00 – 20:00 และไม่ใช่เวลาที่ผ่านมาแล้ว ──
    if (!isWithinMeetupHours(finalTime)) {
      return res.status(400).json({ error: MEETUP_HOURS_TEXT });
    }
    if (!finalDate || String(finalDate) < todayInBangkok()) {
      return res.status(400).json({ error: "ไม่สามารถนัดรับย้อนหลังได้ กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป" });
    }
    if (appointmentToDate(finalDate, finalTime) <= new Date()) {
      return res.status(400).json({ error: "เวลานัดต้องเป็นเวลาในอนาคต" });
    }

    // ── ค้นหา location id: ลอง parseInt ก่อน ถ้าไม่ใช่ตัวเลขให้ค้นจากชื่อใน DB ──
    let resolvedLocationId = parseInt(finalLocationRaw);
    if (isNaN(resolvedLocationId) && (finalLocationRaw || locationName)) {
      const locationKeyMap = {
        'canteen39': 'โรงอาหาร 39',
        'library-cl': 'CL',
        'civil-eng': 'โยธา',
        'ee-building18': 'ตึก 18',
        'sci-arts': 'วิทยาศาสตร์',
        'student-center': 'กิจกรรม',
        'sports-complex': 'กีฬา',
        'admin-building': 'อาคารอำนวยการ',
        'it-building': 'IT',
        'mechanic-eng': 'เครื่องกล',
        'seven-eleven': '7-Eleven',
        'stadium': 'สนามกีฬา',
        'business-admin': 'บริหารธุรกิจ',
        'dormitory': 'หอพัก',
        'student-dev': 'พัฒนานักศึกษา',
        'eng-tech': 'วิศวกรรมศาสตร์',
        'boxing-gym': 'สนามมวย',
      };
      const searchName = locationKeyMap[finalLocationRaw] || locationName || finalLocationRaw;
      const { data: foundLoc } = await supabase
        .from("locations")
        .select("id, name")
        .ilike("name", `%${searchName}%`)
        .limit(1)
        .maybeSingle();
      if (foundLoc) {
        resolvedLocationId = foundLoc.id;
      }
    }
    // ถ้ายังหาไม่ได้ให้ใช้ location แรกสุดเป็น fallback
    if (isNaN(resolvedLocationId) || !resolvedLocationId) {
      const { data: firstLoc } = await supabase.from("locations").select("id").order("id").limit(1).maybeSingle();
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
      if (!txn) {
        return res.status(404).json({ error: "ไม่พบข้อมูลรายการซื้อขาย" });
      }
      // ต้องเป็นผู้ซื้อหรือผู้ขายของรายการนี้เท่านั้น
      if (!isParticipant(txn, req.user.id)) {
        return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในรายการซื้อขายนี้" });
      }
      const { data: linkedProduct, error: linkedProductErr } = await supabase
        .from("products")
        .select("status_id")
        .eq("id", txn.product_id)
        .maybeSingle();
      if (linkedProductErr) throw linkedProductErr;
      if (Number(linkedProduct?.status_id) === 3) {
        return res.status(409).json({ error: "สินค้านี้ขายแล้ว ไม่สามารถนัดรับได้" });
      }
      // ดีลที่ขายสำเร็จแล้ว (3) ห้ามนัดซ้ำ
      if (Number(txn.status_id) === 3) {
        return res.status(400).json({ error: "รายการซื้อขายนี้เสร็จสิ้นแล้ว ไม่สามารถสร้างนัดใหม่ได้" });
      }
      // ดีลที่ถูกยกเลิก/ตัดจบ (4) -> เปิดธุรกรรมใหม่ของสินค้าชิ้นเดิม ผู้ซื้อ-ผู้ขายคู่เดิม
      if ([4, 5].includes(Number(txn.status_id))) {
        const r = await openNewTransaction(txn.product_id, txn.buyer_id, txn.seller_id);
        if (r.error) return res.status(400).json({ error: r.error });
        txn = r.txn;
        newlyCreatedTxn = txn;
      } else if (![1, 2].includes(Number(txn.status_id))) {
        return res.status(409).json({ error: "รายการนี้ไม่อยู่ในสถานะที่นัดรับได้" });
      }
    } else if (targetProductId) {
      const { data: product } = await supabase
        .from("products")
        .select("id, seller_id, price, title, status_id")
        .eq("id", targetProductId)
        .single();

      if (!product) return res.status(404).json({ error: "ไม่พบสินค้า" });
      if (product.seller_id === req.user.id) return res.status(400).json({ error: "ไม่สามารถซื้อสินค้าของตนเองได้" });
      if (Number(product.status_id) === 3) {
        return res.status(409).json({ error: "สินค้านี้ขายแล้ว ไม่สามารถนัดรับได้" });
      }

      const targetSellerId = sellerId ? parseInt(sellerId) : product.seller_id;
      if (String(targetSellerId) !== String(product.seller_id)) {
        return res.status(400).json({ error: "ผู้ขายไม่ตรงกับเจ้าของสินค้าจริง" });
      }

      // หาธุรกรรมที่ยังไม่ถูกยกเลิก (ยกเลิกแล้วจะไม่เจอ -> เปิดใหม่ได้)
      const { data: existingTxns } = await supabase
        .from("transactions")
        .select("id, buyer_id, seller_id, status_id, product_id")
        .eq("product_id", targetProductId)
        .eq("buyer_id", req.user.id)
        .in("status_id", [1, 2]) // only open transactions can be used for a new appointment
        .limit(1);

      if (existingTxns?.length) {
        txn = existingTxns[0];
      } else {
        const r = await openNewTransaction(targetProductId, req.user.id, targetSellerId);
        if (r.error) return res.status(400).json({ error: r.error });
        txn = r.txn;
        newlyCreatedTxn = txn;
      }
    }

    if (!txn) {
      return res.status(400).json({ error: "ไม่พบข้อมูลรายการซื้อขาย" });
    }

    // ตรวจสอบว่าผู้ขายมี Trust Score ต่ำกว่า 50 หรือไม่ (ถ้าต่ำกว่า 50 จะไม่สามารถทำธุรกรรมได้)
    if (txn.seller_id) {
      const { data: sellerUser } = await supabase
        .from("users")
        .select("trust_score")
        .eq("id", txn.seller_id)
        .maybeSingle();
      if (sellerUser && (sellerUser.trust_score ?? 100) < 50) {
        if (newlyCreatedTxn) {
          await cancelTransactionAndRelease(txn.id, txn.product_id, new Date().toISOString());
          newlyCreatedTxn = null;
        }
        return res.status(403).json({
          error: "ผู้ขายรายนี้มีคะแนน Trust Score ต่ำกว่า 50 คะแนน จึงถูกระงับการทำธุรกรรมชั่วคราว",
          code: "SELLER_TRUST_SCORE_TOO_LOW",
        });
      }
    }

    // ผู้ซื้อคนเดิมนัดสินค้าเดิมซ้อนกันไม่ได้ถ้านัดเดิมยืนยันไปแล้ว
    const { data: confirmedAppointment, error: confirmedApptErr } = await supabase
      .from("appointments")
      .select("id")
      .eq("transaction_id", txn.id)
      .eq("status_id", 2)
      .limit(1)
      .maybeSingle();
    if (confirmedApptErr) throw confirmedApptErr;
    if (confirmedAppointment) {
      if (newlyCreatedTxn) {
        await cancelTransactionAndRelease(txn.id, txn.product_id, new Date().toISOString());
        newlyCreatedTxn = null;
      }
      return res.status(409).json({ error: "คุณมีนัดรับที่ยืนยันแล้วสำหรับสินค้านี้อยู่ ไม่สามารถนัดซ้อนเพิ่มได้" });
    }

    // Replace old pending proposals only after all validation passes, so a bad
    // replacement request cannot cancel a valid pending request.
    const { data: existingPending, error: pendingErr } = await supabase
      .from("appointments")
      .select("id")
      .eq("transaction_id", txn.id)
      .eq("status_id", 1);
    if (pendingErr) throw pendingErr;
    if (existingPending?.length) {
      const { error: cancelPendingErr } = await supabase.from("appointments").update({
        status_id: 4,
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.user.id,
        cancellation_reason: "replaced_by_new_request",
      }).in("id", existingPending.map((a) => a.id)).eq("status_id", 1);
      if (cancelPendingErr) throw cancelPendingErr;
    }

    // Insert Appointment (บันทึก created_by เพื่อกันผู้สร้างนัดกดยืนยันนัดตัวเอง)
    const { data: appointment, error: aErr } = await supabase
      .from("appointments")
      .insert({
        transaction_id: txn.id,
        appointment_date: finalDate,
        appointment_time: finalTime,
        location_id: resolvedLocationId,
        location_detail: locationName || null,
        meeting_detail: finalMeetingDetail || null,
        status_id: 1, // 1 = รอการยืนยัน (PENDING)
        created_by: req.user.id,
      })
      .select("id")
      .single();

    if (aErr) throw aErr;
    newlyCreatedTxn = null;

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

    // แจ้งเตือนแบบเรียลไทม์ผ่าน Socket.IO ทั้งสองฝ่าย
    emitMeetupUpdate(appointment.id, {
      meetupId: appointment.id,
      status: "pending",
      statusCode: "PENDING",
      buyerId: txn.buyer_id,
      sellerId: txn.seller_id,
      productId: txn.product_id,
      appointmentDate: finalDate,
      appointmentTime: finalTime,
    });

    // ส่งข้อความแจ้งในห้องแชทอัตโนมัติ เป็น MEETUP_SUMMARY (ถ้ามีห้องแชทของคู่นี้อยู่)
    try {
      const { data: convs } = await supabase
        .from("conversations")
        .select("id")
        .eq("product_id", txn.product_id);
      if (convs?.length) {
        for (const c of convs) {
          const { data: mems } = await supabase
            .from("conversation_members")
            .select("user_id")
            .eq("conversation_id", c.id);
          const uids = (mems || []).map((m) => String(m.user_id));
          if (uids.includes(String(txn.buyer_id)) && uids.includes(String(txn.seller_id))) {
            // ดึง username ของผู้ซื้อและผู้ขาย
            const { data: participants } = await supabase
              .from("users")
              .select("id, username, full_name")
              .in("id", [txn.buyer_id, txn.seller_id]);
            const buyerUser = (participants || []).find((u) => String(u.id) === String(txn.buyer_id));
            const sellerUser = (participants || []).find((u) => String(u.id) === String(txn.seller_id));

            // ดึงราคาสินค้า
            const { data: productData } = await supabase
              .from("products")
              .select("title, price")
              .eq("id", txn.product_id)
              .maybeSingle();

            const summaryPayload = {
              meetupId: appointment.id,
              status: "pending",
              productTitle: productData?.title || "สินค้า",
              price: productData?.price || txn.agreed_price || 0,
              date: finalDate,
              time: finalTime,
              locationName: locationName || "จุดนัดรับ มทร.อีสาน",
              note: finalMeetingDetail || null,
              buyerId: txn.buyer_id,
              buyerName: buyerUser?.username || buyerUser?.full_name || "ผู้ซื้อ",
              sellerId: txn.seller_id,
              sellerName: sellerUser?.username || sellerUser?.full_name || "ผู้ขาย",
            };

            const { data: insertedMsg } = await supabase.from("messages").insert({
              conversation_id: c.id,
              sender_id: req.user.id,
              content: JSON.stringify(summaryPayload),
              message_type: "MEETUP_SUMMARY",
            }).select("*").single();

            if (insertedMsg) {
              const { emitNewMessage } = require("../services/chatSocket");
              emitNewMessage(c.id, insertedMsg);
            }
            break;
          }
        }
      }
    } catch (chatMsgErr) {
      console.warn("[createMeetup] auto post chat message error:", chatMsgErr?.message);
    }

    res.status(201).json({
      message: "สร้างนัดรับสินค้าเรียบร้อยแล้ว",
      meetupId: appointment.id,
      appointment: { id: appointment.id },
      transactionId: txn.id,
    });
  } catch (err) {
    if (newlyCreatedTxn) {
      await cancelTransactionAndRelease(newlyCreatedTxn.id, newlyCreatedTxn.product_id, new Date().toISOString());
    }
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
      .select("id, status_id, created_by, appointment_date, appointment_time, transaction_id, transactions(buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

    // ผู้สร้างนัดกดยืนยันนัดของตัวเองไม่ได้ ต้องให้อีกฝ่ายยืนยัน
    // (นัดเก่าที่ created_by เป็น null ข้ามการเช็คนี้)
    if (appt.created_by && String(appt.created_by) === String(req.user.id)) {
      return res.status(403).json({ error: "คุณเป็นผู้สร้างนัดนี้ ต้องให้อีกฝ่ายเป็นผู้ยืนยัน" });
    }

    // ยืนยันได้เฉพาะนัดที่รอยืนยัน (PENDING) เท่านั้น
    if (appt.status_id !== 1) {
      return res.status(400).json({ error: "นัดนี้ไม่อยู่ในสถานะรอยืนยัน" });
    }

    // เลยเวลานัดแล้วห้ามยืนยัน
    if (appointmentToDate(appt.appointment_date, appt.appointment_time) <= new Date()) {
      return res.status(400).json({ error: "เลยเวลานัดแล้ว ไม่สามารถยืนยันได้ กรุณาสร้างนัดใหม่" });
    }

    // "จอง" การยืนยัน เฉพาะแถวที่ยังเป็น PENDING กันกดซ้ำ/ชนกัน และบันทึกเวลายืนยัน (ใช้คำนวณช่วงยกเลิกฟรี)
    const { data: acc } = await supabase
      .from("appointments")
      .update({ status_id: 2, confirmed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status_id", 1)
      .select("id");
    if (!acc?.length) {
      return res.status(400).json({ error: "นัดนี้ถูกดำเนินการไปแล้ว" });
    }

    // Update transaction status to 2 = ยืนยันแล้ว (CONFIRMED)
    await supabase.from("transactions").update({ status_id: 2 }).eq("id", appt.transaction_id);
    const { data: acceptedTxn } = await supabase.from("transactions").select("product_id").eq("id", appt.transaction_id).maybeSingle();
    if (acceptedTxn?.product_id) await supabase.from("products").update({ status_id: 2 }).eq("id", acceptedTxn.product_id).eq("status_id", 1);

    const partnerId = appt.transactions?.buyer_id === req.user.id
      ? appt.transactions?.seller_id
      : appt.transactions?.buyer_id;

    if (partnerId) {
      try {
        const notifData = {
          user_id: partnerId,
          type: "meetup_confirmed",
          title: "คู่ค้ายืนยันการนัดรับเรียบร้อยแล้ว 🎉",
          message: "การนัดหมายได้รับการยืนยันแล้ว สามารถไปตามจุดนัดหมายได้เลย",
          reference_type: "meetup",
          reference_id: id,
        };
        const { data: insertedNotif } = await supabase.from("notifications").insert(notifData).select("*").single();
        sendNotificationToUser(partnerId, insertedNotif || notifData);
      } catch (nErr) {
        console.warn("[acceptMeetup] notification warning:", nErr.message);
      }
    }

    // Realtime broadcast update
    emitMeetupUpdate(id, {
      meetupId: Number(id),
      status: 'confirmed',
      statusCode: 'CONFIRMED',
      buyerId: appt.transactions?.buyer_id,
      sellerId: appt.transactions?.seller_id,
    });

    res.json({ message: "ยืนยันการนัดรับเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/checkin  — เช็คอินจุดนัดรับ (ตรวจระยะ 200 ม./เวลา/สิทธิ์ ใน DB)
// ----------------------------------------------------------------
function checkInErrorMessage(msg = "") {
  if (msg.includes("TOO_FAR")) {
    const m = msg.match(/TOO_FAR:\s*(\d+)/);
    return `คุณอยู่ไกลจากจุดนัดรับ${m ? ` ${Number(m[1]).toLocaleString()} เมตร` : ""} (ต้องอยู่ภายใน 200 เมตร) จึงเช็คอินไม่ได้`;
  }
  if (msg.includes("OUTSIDE_CHECKIN_WINDOW")) return "ยังไม่ถึงหรือเลยช่วงเวลาเช็คอินของนัดนี้";
  if (msg.includes("INVALID_COORDINATES")) return "ไม่พบพิกัด GPS กรุณาเปิด GPS แล้วลองใหม่";
  if (msg.includes("APPOINTMENT_NOT_ACTIVE")) return "นัดหมายนี้ยังไม่ได้ยืนยันหรือสิ้นสุดแล้ว";
  if (msg.includes("NOT_PARTICIPANT")) return "คุณไม่ได้มีส่วนร่วมในนัดรับนี้";
  if (msg.includes("APPOINTMENT_NOT_FOUND")) return "ไม่พบนัดรับ";
  return null;
}

async function checkInMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const lat = parseFloat(req.body?.lat ?? req.body?.latitude);
    const lng = parseFloat(req.body?.lng ?? req.body?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "ไม่พบพิกัด GPS กรุณาเปิด GPS แล้วลองใหม่" });
    }

    const { data: r, error } = await supabase.rpc("check_in_appointment", {
      p_appointment_id: Number(id),
      p_user_id: req.user.id,
      p_lat: lat,
      p_lng: lng,
    });
    if (error) {
      const friendly = checkInErrorMessage(error.message);
      if (friendly) return res.status(400).json({ error: friendly });
      throw error;
    }

    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transactions(buyer_id, seller_id)")
      .eq("id", id)
      .single();

    const isBuyer = appt.transactions?.buyer_id === req.user.id;
    const partnerId = isBuyer ? appt.transactions?.seller_id : appt.transactions?.buyer_id;

    const checkInData = {
      meetupId: Number(id),
      userId: req.user.id,
      role: isBuyer ? "buyer" : "seller",
      checkedInRole: isBuyer ? "buyer" : "seller",
      buyerCheckedIn: !!r.buyer_checked_in,
      sellerCheckedIn: !!r.seller_checked_in,
      buyerCheckedInAt: r.buyer_checked_in_at,
      sellerCheckedInAt: r.seller_checked_in_at,
      buyerId: appt.transactions?.buyer_id,
      sellerId: appt.transactions?.seller_id,
    };
    emitMeetupUpdate(id, checkInData);

    if (partnerId) {
      try {
        const notifData = {
          user_id: partnerId,
          type: "meetup_checkin",
          title: "คู่ค้านัดรับเดินทางมาถึงแล้ว 📍",
          message: `${isBuyer ? "ผู้ซื้อ" : "ผู้ขาย"} เช็คอินที่จุดนัดรับแล้ว`,
          reference_type: "meetup",
          reference_id: id,
        };
        const { data: insertedNotif } = await supabase.from("notifications").insert(notifData).select("*").single();
        sendNotificationToUser(partnerId, insertedNotif || notifData);
      } catch (nErr) {
        console.warn("[checkInMeetup] notification warning:", nErr.message);
      }
    }

    res.json({
      message: "เช็คอินจุดนัดรับสำเร็จ",
      distanceM: r.distance_m,
      bothCheckedIn: !!(r.buyer_checked_in && r.seller_checked_in),
      checkInData,
    });
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
      .select("id, transaction_id, status_id, buyer_checked_in, seller_checked_in, buyer_checked_in_at, seller_checked_in_at, transactions(id, product_id, buyer_id, seller_id, status_id, buyer_received, seller_handed_over)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

    // ต้องเช็คอินครบทั้งสองฝ่ายและนัดต้องอยู่ในสถานะ CONFIRMED ก่อนจึงจะปิดดีลได้
    if (Number(appt.status_id) !== 2 || !appt.buyer_checked_in || !appt.seller_checked_in || Number(appt.transactions?.status_id) !== 2) {
      return res.status(400).json({ error: "ต้องเช็คอินที่จุดนัดรับให้ครบทั้งสองฝ่ายก่อน จึงจะยืนยันส่งมอบสินค้าได้" });
    }

    const txn = appt.transactions;
    const isBuyer = String(txn.buyer_id) === String(req.user.id);
    const ownConfirmation = isBuyer ? txn.buyer_received : txn.seller_handed_over;
    if (ownConfirmation) return res.status(409).json({ error: "คุณยืนยันส่งมอบรายการนี้ไปแล้ว กำลังรออีกฝ่ายยืนยัน" });
    const now = new Date().toISOString();

    // Each participant records their own confirmation. The deal only completes
    // after both sides confirm; this makes repeated taps harmless.
    const ownColumn = isBuyer ? "buyer_received" : "seller_handed_over";
    const { data: confirmationRows, error: confirmErr } = await supabase.from("transactions")
      .update({ [ownColumn]: true }).eq("id", txn.id).eq("status_id", 2).eq(ownColumn, false).select("id");
    if (confirmErr) throw confirmErr;
    if (!confirmationRows?.length) return res.status(409).json({ error: "ยืนยันรายการนี้ไปแล้ว กรุณารีเฟรชสถานะ" });
    if (!txn[isBuyer ? "seller_handed_over" : "buyer_received"]) {
      return res.json({ message: "บันทึกการยืนยันแล้ว กำลังรออีกฝ่ายยืนยัน", pendingOtherParty: true,
        buyerReceived: isBuyer, sellerHandedOver: !isBuyer });
    }

    // Both delivery confirmations are now recorded. Keep the transaction in
    // CONFIRMED until both reciprocal reviews are received, so a timeout cannot
    // accidentally award a successful-deal count or Trust Score.
    const { data: reviewReadyAppt, error: reviewReadyErr } = await supabase.from("appointments").update({
      status_id: 3, // delivery complete; transaction remains pending reviews
    }).eq("id", id).eq("status_id", 2).select("id");
    if (reviewReadyErr) throw reviewReadyErr;
    if (!reviewReadyAppt?.length) throw new Error("ไม่สามารถบันทึกสถานะรอรีวิวได้ กรุณาติดต่อผู้ดูแลระบบ");

    const notifMsg = {
      type: "deal_review_required",
      title: "ยืนยันส่งมอบครบแล้ว — รอรีวิวทั้งสองฝ่าย",
      message: "สามารถให้คะแนนรีวิวคู่ค้าได้แล้ว ดีลจะเสร็จสมบูรณ์และได้คะแนนเมื่อรีวิวครบทั้งสองฝ่ายภายใน 24 ชั่วโมง",
      reference_type: "transaction",
      reference_id: txn.id,
    };
    for (const userId of [txn.buyer_id, txn.seller_id]) {
      if (!userId) continue;
      await supabase.from("notifications").insert({ ...notifMsg, user_id: userId });
      sendNotificationToUser(userId, notifMsg);
    }
    return res.json({ message: "ยืนยันส่งมอบครบแล้ว กรุณารีวิวทั้งสองฝ่ายภายใน 24 ชั่วโมง", transactionId: txn.id, readyForReview: true });

    /* Legacy immediate-completion flow retained below as unreachable reference.
    // Complete transaction
    let completedTxnId = txn.id;
    const { data: completedRows, error: txUpdErr } = await supabase.from("transactions").update({
      status_id: 3, // 3 = ซื้อขายเสร็จ (COMPLETED)
      buyer_received: true,
      seller_handed_over: true,
      completed_at: now,
    }).eq("id", txn.id).eq("status_id", 2).eq("buyer_received", true).eq("seller_handed_over", true).select("id");

    if (txUpdErr && (txUpdErr.message?.includes("code") || txUpdErr.code === "42703")) {
      // Fallback if database trigger recover_score_on_deal failed due to missing 'code' column in transaction_status
      const { data: replacementTxn, error: replacementErr } = await supabase.from("transactions").insert({
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
        const { data: closedAppt } = await supabase.from("appointments").update({ transaction_id: replacementTxn.id, status_id: 3 }).eq("id", id).eq("status_id", 2).select("id");
        if (!closedAppt?.length) throw new Error("ไม่สามารถปิดสถานะนัดรับได้ กรุณารีเฟรชแล้วลองใหม่");
        await supabase.from("transactions").delete().eq("id", txn.id);
      } else {
        throw replacementErr || new Error("ปิดรายการซื้อขายไม่สำเร็จ");
      }
    } else {
      if (txUpdErr) throw txUpdErr;
      if (!completedRows?.length) return res.status(409).json({ error: "รายการนี้ถูกปิดการขายไปแล้ว" });
      // Complete appointment
      const { data: closedAppt, error: closeApptErr } = await supabase.from("appointments").update({
        status_id: 3, // 3 = นัดรับเสร็จ (COMPLETED)
      }).eq("id", id).eq("status_id", 2).select("id");
      if (closeApptErr) throw closeApptErr;
      if (!closedAppt?.length) throw new Error("ปิดสถานะนัดรับไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ");
    }

    // Complete product (mark SOLD)
    await supabase.from("products").update({
      status_id: 3, // 3 = ขายแล้ว (SOLD)
    }).eq("id", txn.product_id);

    // ปิด/ยกเลิกนัดหมายและธุรกรรมอื่นๆ ของสินค้านี้ที่ยังค้างอยู่ เนื่องจากมีผู้ซื้อคนนี้ซื้อสำเร็จไปแล้ว
    try {
      const { data: otherTxns } = await supabase
        .from("transactions")
        .select("id, buyer_id")
        .eq("product_id", txn.product_id)
        .neq("id", completedTxnId)
        .in("status_id", [1, 2]);

      if (otherTxns?.length) {
        const otherTxnIds = otherTxns.map((t) => t.id);
        await supabase.from("transactions").update({
          status_id: 4,
          cancelled_at: now,
        }).in("id", otherTxnIds);

        await supabase.from("appointments").update({
          status_id: 4,
          cancelled_at: now,
          cancellation_reason: "สินค้ารายการนี้ถูกปิดการขายให้ผู้ซื้อรายอื่นแล้ว",
        }).in("transaction_id", otherTxnIds).in("status_id", [1, 2]);

        for (const ot of otherTxns) {
          if (ot.buyer_id) {
            const soldOtherNotif = {
              user_id: ot.buyer_id,
              type: "meetup_cancelled",
              title: "สินค้าถูกปิดการขายแล้ว 📦",
              message: "สินค้ารายการนี้ถูกส่งมอบสำเร็จให้กับผู้ซื้อรายอื่นแล้ว คำขอนัดรับของคุณจึงถูกยกเลิก",
              reference_type: "product",
              reference_id: txn.product_id,
            };
            await supabase.from("notifications").insert(soldOtherNotif);
            sendNotificationToUser(ot.buyer_id, soldOtherNotif);
          }
        }
      }
    } catch (cancelOtherErr) {
      console.warn("[completeMeetup] auto cancel other deals warning:", cancelOtherErr?.message);
    }

    // Increment successful_deal_count on buyer & seller and recover seller trust score
    if (txn.buyer_id) {
      const { data: bUser } = await supabase.from("users").select("successful_deal_count").eq("id", txn.buyer_id).single();
      await supabase.from("users").update({ successful_deal_count: (bUser?.successful_deal_count || 0) + 1 }).eq("id", txn.buyer_id);
    }
    if (txn.seller_id) {
      // successful_deal_count ฝั่งผู้ขายนับโดย DB trigger ตอน transaction เปลี่ยนเป็น COMPLETED
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

    res.json({ message: "ปิดการซื้อขายเรียบร้อยแล้ว", transactionId: completedTxnId }); */
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/meetups/:id/cancel  — ยกเลิกนัดรับ
//
// กฎตัดคะแนน LATE_CANCEL (อ่านจากตาราง penalty_rules ทั้งหมด):
//  - ตัดเฉพาะ "คนที่กดยกเลิก" เท่านั้น
//  - ตัดเฉพาะนัดที่ยืนยันแล้ว (CONFIRMED) และเหลือเวลาก่อนนัด < threshold_minutes
//  - ไม่ตัดถ้ายกเลิกภายใน grace_minutes หลังกดยืนยันนัด (เผื่อกดผิด)
//  - ไม่ตัดถ้าคนที่ยกเลิกเช็คอินที่จุดนัดแล้ว (มาตามนัดแล้ว)
//  - ถ้าจะโดนตัด ต้องส่ง confirmPenalty: true มาด้วย (ผู้ใช้กดยอมรับ) ไม่งั้นตอบ 409 ให้หน้าบ้านถามก่อน
// ----------------------------------------------------------------
async function cancelMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || "ยกเลิกโดยผู้ใช้");
    const confirmPenalty = req.body?.confirmPenalty === true || req.body?.confirmPenalty === "true";

    const { data: appt } = await supabase
      .from("appointments")
      .select(`
        id, status_id, appointment_date, appointment_time, transaction_id,
        confirmed_at, buyer_checked_in, seller_checked_in,
        transactions(id, product_id, buyer_id, seller_id)
      `)
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }
    // 3 = COMPLETED, 4 = CANCELLED, 5 = NO_SHOW
    if ([3, 4, 5].includes(appt.status_id)) {
      return res.status(400).json({ error: "นัดหมายนี้สิ้นสุดแล้ว ไม่สามารถยกเลิกได้" });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // ── ตัดสินว่าคนที่กดยกเลิกจะโดนตัดคะแนนหรือไม่ ──
    let lateRule = null;
    let minutesLeft = null;
    if (appt.status_id === 2) {
      const rule = await getPenaltyRule("LATE_CANCEL");
      if (rule && rule.is_active) {
        const isBuyer = String(appt.transactions.buyer_id) === String(req.user.id);
        const iCheckedIn = isBuyer ? appt.buyer_checked_in : appt.seller_checked_in;
        minutesLeft = (appointmentToDate(appt.appointment_date, appt.appointment_time).getTime() - now.getTime()) / 60000;
        const sinceConfirm = appt.confirmed_at
          ? (now.getTime() - new Date(appt.confirmed_at).getTime()) / 60000
          : Infinity;

        const threshold = rule.threshold_minutes ?? LATE_CANCEL_THRESHOLD_MINUTES;
        const grace = rule.grace_minutes ?? LATE_CANCEL_GRACE_MINUTES;

        if (!iCheckedIn && sinceConfirm > grace && minutesLeft < threshold) {
          lateRule = rule;
        }
      }
    }

    // ── ต้องให้ผู้ใช้กดยอมรับก่อน ถ้าจะโดนตัดคะแนน ──
    if (lateRule && !confirmPenalty) {
      const threshold = lateRule.threshold_minutes ?? LATE_CANCEL_THRESHOLD_MINUTES;
      return res.status(409).json({
        error: `การยกเลิกนัดที่ยืนยันแล้วก่อนเวลานัดน้อยกว่า ${threshold} นาที จะถูกตัด ${lateRule.points_deducted} คะแนนความน่าเชื่อถือ`,
        requiresConfirm: true,
        pointsDeducted: lateRule.points_deducted,
        thresholdMinutes: threshold,
        minutesLeft: Math.max(0, Math.round(minutesLeft)),
      });
    }

    // ── "จอง" การยกเลิก เฉพาะแถวที่ยังไม่สิ้นสุด กันกดซ้ำ/ชนกับ cron แล้วตัดคะแนนซ้ำ ──
    const { data: claimed } = await supabase
      .from("appointments")
      .update({
        status_id: 4,
        cancelled_at: nowIso,
        // ให้ DB trigger ตัดคะแนนเฉพาะเมื่อ backend คำนวณแล้วว่าตรงตาม LATE_CANCEL
        cancelled_by: lateRule ? req.user.id : null,
        cancellation_reason: reason,
      })
      .eq("id", id)
      .in("status_id", [1, 2])
      .select("id");
    if (!claimed?.length) {
      return res.status(400).json({ error: "นัดหมายนี้สิ้นสุดแล้ว ไม่สามารถยกเลิกได้" });
    }

    await cancelTransactionAndRelease(appt.transaction_id, appt.transactions?.product_id, nowIso);

    // ── ตัดคะแนนเฉพาะคนที่กดยกเลิก + แจ้งเตือน ──
    let penaltyResult = { penalized: false, pointsDeducted: 0 };
    if (lateRule) {
      const threshold = lateRule.threshold_minutes ?? LATE_CANCEL_THRESHOLD_MINUTES;
      penaltyResult = await recordPenalty(
        req.user.id,
        "LATE_CANCEL",
        `ยกเลิกนัด #${id} ก่อนเวลานัดน้อยกว่า ${threshold} นาที: ${reason}`,
        Number(id)
      );
      await persistAndSendNotification(req.user.id, {
        type: penaltyResult.penalized ? "penalty" : "meetup_cancelled",
        title: penaltyResult.penalized ? "⚠️ คุณถูกตัดคะแนนจากการยกเลิกนัดกระชั้นชิด" : "ยกเลิกนัดรับแล้ว",
        message: penaltyResult.penalized
          ? `คุณยกเลิกนัดที่ยืนยันแล้วก่อนเวลานัดน้อยกว่า ${threshold} นาที ระบบหัก ${penaltyResult.pointsDeducted} คะแนนตามกฎคะแนน`
          : "ระบบไม่สามารถยืนยันการบันทึกคะแนนได้ กรุณาตรวจสอบประวัติคะแนนหรือติดต่อผู้ดูแลระบบ",
        reference_type: "meetup",
        reference_id: Number(id),
      });
    }

    // ── แจ้งคู่ค้า (ไม่โดนตัดคะแนน) ──
    const partnerId = String(appt.transactions.buyer_id) === String(req.user.id)
      ? appt.transactions.seller_id
      : appt.transactions.buyer_id;
    if (partnerId) {
      await persistAndSendNotification(partnerId, {
        type: "meetup_cancelled",
        title: "คู่ค้ายกเลิกนัดรับ",
        message: `เหตุผล: ${reason}`,
        reference_type: "meetup",
        reference_id: Number(id),
      });
    }

    emitMeetupUpdate(id, {
      meetupId: Number(id),
      status: "cancelled",
      statusCode: "CANCELLED",
      buyerId: appt.transactions.buyer_id,
      sellerId: appt.transactions.seller_id,
    });

    res.json({
      message: "ยกเลิกนัดรับสำเร็จ",
      penalized: penaltyResult.penalized,
      pointsDeducted: penaltyResult.pointsDeducted,
    });
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
  checkAndProcessNoShows,
  closeUnconfirmedDeliveries,
  processWeeklySundayRecovery,
  recoverScoreOnDeal,
};
