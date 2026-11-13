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

// เลยเวลานัดกี่นาทีถึงนับว่าไม่มาตามนัด (ต้องตรงกับข้อความบนหน้าเว็บและ cron ใน DB ถ้ายังเปิดอยู่)
const NO_SHOW_GRACE_MINUTES = 45;

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

    const pointsDeducted = rule?.points_deducted || 30;

    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", userId)
      .single();

    if (!user) return;

    const currentScore = user.trust_score ?? 100;
    const newScore = Math.max(0, currentScore - pointsDeducted);

    await supabase.from("users").update({ trust_score: newScore }).eq("id", userId);

    if (rule?.id) {
      await supabase.from("user_penalties").insert({
        user_id: userId,
        penalty_rule_id: rule.id,
        reason: reason || actionType,
      });
    }

    await supabase.from("user_score_history").insert({
      user_id: userId,
      change_amount: -pointsDeducted,
      score_after: newScore,
      source_type: "PENALTY",
      reason: reason || actionType,
    });
    console.log(`⚠️ [TrustScore Penalty] User ${userId} penalized -${pointsDeducted} pts for ${actionType} (New score: ${newScore})`);
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

  // locationName ต้องมาจาก locations.name เท่านั้น — location_detail เป็นหมายเหตุของผู้ใช้ ไม่ใช่ชื่อจุด
  const realLocName = a.locations?.name || "จุดนัดรับ มทร.อีสาน";
  const cleanNote = a.location_detail ? a.location_detail.replace(/^จุดนัด:\s*/, "").trim() : null;

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
    note: cleanNote || '',
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
// Helper: ตรวจสอบและตัดจบนัดหมายที่เลยเวลา (NO_SHOW_GRACE_MINUTES) และตัดคะแนนคนไม่มาเช็คอิน
// ----------------------------------------------------------------
async function checkAndProcessNoShows() {
  try {
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

      // เส้นตาย: เวลานัด + NO_SHOW_GRACE_MINUTES
      const deadline = new Date(apptDate.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000);

      if (now > deadline) {
        const buyerCheckedIn = Boolean(appt.buyer_checked_in);
        const sellerCheckedIn = Boolean(appt.seller_checked_in);

        // ถ้าทั้งสองฝ่ายเช็คอินครบแล้ว ไม่ถือเป็น No-show
        if (buyerCheckedIn && sellerCheckedIn) continue;

        const txn = appt.transactions || {};
        const nowIso = now.toISOString();

        // 1. "จอง" นัดหมายนี้ด้วยการเปลี่ยนสถานะเฉพาะแถวที่ยังเป็น CONFIRMED
        //    ถ้ามีคำขออื่นเข้ามาประมวลผลนัดเดียวกันพร้อมกัน จะมีแค่คำขอเดียวที่ได้แถวกลับมา
        //    กันการตัดคะแนนซ้ำสองรอบ
        const { data: claimed } = await supabase
          .from("appointments")
          .update({
            status_id: noShowStatusId,
            cancelled_at: nowIso,
            cancellation_reason: `หมดเวลาเช็คอิน (เกินเวลานัด ${NO_SHOW_GRACE_MINUTES} นาที ไม่มาตามนัด)`,
          })
          .eq("id", appt.id)
          .eq("status_id", 2)
          .select("id");

        if (!claimed?.length) continue; // มีคนประมวลผลไปแล้ว

        console.log(`🚨 [NO_SHOW Auto-Close] Appointment #${appt.id} passed ${NO_SHOW_GRACE_MINUTES}m deadline. Buyer checked in: ${buyerCheckedIn}, Seller checked in: ${sellerCheckedIn}`);

        // 2. ยกเลิก Transaction และนำสินค้ากลับมาวางขายใหม่ (AVAILABLE)
        if (appt.transaction_id) {
          await supabase.from("transactions").update({
            status_id: 4, // CANCELLED
            cancelled_at: nowIso,
          }).eq("id", appt.transaction_id);
        }

        if (txn.product_id) {
          await supabase.from("products").update({
            status_id: 1, // AVAILABLE
          }).eq("id", txn.product_id);
        }

        // 3. ตัดคะแนนความน่าเชื่อถือของผู้ที่ไม่มาเช็คอิน
        if (!buyerCheckedIn && txn.buyer_id) {
          await recordPenalty(
            txn.buyer_id,
            "NO_SHOW",
            `ผู้ซื้อไม่มาตามนัดรับสินค้า (เกินเวลา ${NO_SHOW_GRACE_MINUTES} นาที) - นัดหมาย #${appt.id}`
          );
          sendNotificationToUser(txn.buyer_id, {
            user_id: txn.buyer_id,
            type: "penalty",
            title: "⚠️ คุณถูกตัดคะแนนเนื่องจากไม่มาตามนัด",
            message: `ระบบตัดคะแนนความน่าเชื่อถือของคุณเนื่องจากไม่มาเช็คอินตามจุดนัดพบภายใน ${NO_SHOW_GRACE_MINUTES} นาที`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        }

        if (!sellerCheckedIn && txn.seller_id) {
          await recordPenalty(
            txn.seller_id,
            "NO_SHOW",
            `ผู้ขายไม่มาตามนัดรับสินค้า (เกินเวลา ${NO_SHOW_GRACE_MINUTES} นาที) - นัดหมาย #${appt.id}`
          );
          sendNotificationToUser(txn.seller_id, {
            user_id: txn.seller_id,
            type: "penalty",
            title: "⚠️ คุณถูกตัดคะแนนเนื่องจากไม่มาตามนัด",
            message: `ระบบตัดคะแนนความน่าเชื่อถือของคุณเนื่องจากไม่มาเช็คอินตามจุดนัดพบภายใน ${NO_SHOW_GRACE_MINUTES} นาที`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        }

        // แจ้งเตือนคู่ค้าที่มาเช็คอินตามนัด
        if (buyerCheckedIn && !sellerCheckedIn && txn.buyer_id) {
          sendNotificationToUser(txn.buyer_id, {
            user_id: txn.buyer_id,
            type: "meetup_cancelled",
            title: "นัดหมายถูกตัดจบ (ผู้ขายไม่มาตามนัด)",
            message: `เนื่องจากผู้ขายไม่ได้มาเช็คอินภายใน ${NO_SHOW_GRACE_MINUTES} นาที ระบบจึงตัดจบนัดหมายและตัดคะแนนผู้ขาย`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        } else if (sellerCheckedIn && !buyerCheckedIn && txn.seller_id) {
          sendNotificationToUser(txn.seller_id, {
            user_id: txn.seller_id,
            type: "meetup_cancelled",
            title: "นัดหมายถูกตัดจบ (ผู้ซื้อไม่มาตามนัด)",
            message: `เนื่องจากผู้ซื้อไม่ได้มาเช็คอินภายใน ${NO_SHOW_GRACE_MINUTES} นาที ระบบจึงตัดจบนัดหมายและนำสินค้ากลับสู่สถานะว่างขายใหม่`,
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
          seller:users!seller_id(id, username, full_name, avatar_url, profile_image_url),
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
    let { transactionId, listingId, productId, sellerId, meetupPointId, locationId, scheduledAt, date, appointmentDate, time, appointmentTime, note, locationDetail, locationName, locationLat, locationLng } = req.body;

    const targetProductId = productId || listingId;
    const finalLocationRaw = locationId || meetupPointId;
    const finalDate = appointmentDate || date || (scheduledAt ? scheduledAt.split("T")[0] : todayInBangkok());
    const finalTime = appointmentTime || time || (scheduledAt ? scheduledAt.split("T")[1]?.slice(0, 5) : "12:00");
    const finalDetail = note || locationDetail || null;  // หมายเหตุ/note เท่านั้น ไม่เอา locationName

    // ── ตรวจเวลานัดรับต้องอยู่ในช่วง 08:00 – 20:00 และไม่ใช่วันที่ผ่านมาแล้ว ──
    if (!isWithinMeetupHours(finalTime)) {
      return res.status(400).json({ error: MEETUP_HOURS_TEXT });
    }
    if (!finalDate || String(finalDate) < todayInBangkok()) {
      return res.status(400).json({ error: "ไม่สามารถนัดรับย้อนหลังได้ กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป" });
    }

    // ── ค้นหา location id: ลอง parseInt ก่อน ถ้าไม่ใช่ตัวเลขให้ค้นจากชื่อใน DB ──
    let resolvedLocationId = parseInt(finalLocationRaw);
    if (isNaN(resolvedLocationId) && (finalLocationRaw || locationName)) {
      // อาจเป็น string key เช่น 'canteen39', 'library-cl' หรือชื่อจุดนัดรับ — ค้นหาจากชื่อที่คล้ายกัน
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
      // ต้องเป็นผู้ซื้อหรือผู้ขายของรายการนี้เท่านั้น
      if (txn && !isParticipant(txn, req.user.id)) {
        return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในรายการซื้อขายนี้" });
      }
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


    // ── ตรวจสอบว่ามีนัดหมาย pending อยู่แล้วสำหรับ transaction นี้ — ถ้ามีให้ยกเลิกอันเก่าก่อน ──
    const { data: existingPending } = await supabase
      .from('appointments')
      .select('id')
      .eq('transaction_id', txn.id)
      .in('status_id', [1]) // 1 = pending
      .limit(5);
    if (existingPending?.length) {
      const oldIds = existingPending.map((a) => a.id);
      await supabase.from('appointments').update({ status_id: 5, cancellation_reason: 'replaced_by_new_request' }).in('id', oldIds);
    }

    // ── ตรวจสอบเวลานัดหมายซ้ำ/ทับซ้อน (Overlap Check) ──
    // ห้ามมีนัดหมายอื่นในช่วงเวลาเดียวกัน (ห่างกันน้อยกว่า 30 นาที) สำหรับผู้ซื้อ ผู้ขาย หรือสินค้านี้
    const targetMin = toMinutes(finalTime);

    const { data: dayAppts } = await supabase
      .from("appointments")
      .select(`
        id, appointment_date, appointment_time, status_id,
        transactions!inner(id, buyer_id, seller_id, product_id)
      `)
      .eq("appointment_date", finalDate)
      .in("status_id", [1, 2]);

    if (dayAppts?.length) {
      const conflict = dayAppts.find((a) => {
        const t = a.transactions;
        if (!t) return false;
        // เช็คว่าเกี่ยวข้องกับผู้ซื้อ ผู้ขาย หรือสินค้านี้
        const involvesParty =
          t.buyer_id === txn.buyer_id ||
          t.seller_id === txn.buyer_id ||
          t.buyer_id === txn.seller_id ||
          t.seller_id === txn.seller_id ||
          t.product_id === txn.product_id;

        if (!involvesParty) return false;

        const apptMin = toMinutes(a.appointment_time);
        return Math.abs(apptMin - targetMin) < 30; // ถือว่าทับซ้อนถ้าเวลาห่างกันน้อยกว่า 30 นาที
      });

      if (conflict) {
        return res.status(400).json({
          error: `เวลานัดหมาย ${finalTime} น. ซ้อนทับกับนัดรับอื่นที่มีอยู่แล้ว กรุณาเลือกเวลาอื่น`,
        });
      }
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
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

    // Update appointment status to 2 = นัดหมายเรียบร้อย (CONFIRMED)
    await supabase.from("appointments").update({ status_id: 2 }).eq("id", id);
    // Update transaction status to 2 = ยืนยันแล้ว (CONFIRMED)
    await supabase.from("transactions").update({ status_id: 2 }).eq("id", appt.transaction_id);

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
// POST /api/meetups/:id/checkin  — เช็คอินจุดนัดรับ
// ----------------------------------------------------------------
async function checkInMeetup(req, res, next) {
  try {
    const { id } = req.params;
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transaction_id, buyer_checked_in, seller_checked_in, buyer_checked_in_at, seller_checked_in_at, transactions(buyer_id, seller_id)")
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

    // คงสถานะให้อยู่ในขั้นตอนนัดหมาย (CONFIRMED) เพื่อให้ดำเนินการตรวจรับส่งมอบตามลำดับขั้นตอน
    await supabase.from("appointments").update(updateData).eq("id", id);

    const otherCheckedIn = isBuyer ? appt.seller_checked_in : appt.buyer_checked_in;
    const partnerId = isBuyer ? appt.transactions?.seller_id : appt.transactions?.buyer_id;

    const checkInData = {
      meetupId: Number(id),
      userId: req.user.id,
      role: isBuyer ? 'buyer' : 'seller',
      checkedInRole: isBuyer ? 'buyer' : 'seller',
      buyerCheckedIn: isBuyer ? true : !!appt.buyer_checked_in,
      sellerCheckedIn: isSeller ? true : !!appt.seller_checked_in,
      buyerCheckedInAt: isBuyer ? now : appt.buyer_checked_in_at,
      sellerCheckedInAt: isSeller ? now : appt.seller_checked_in_at,
      buyerId: appt.transactions?.buyer_id,
      sellerId: appt.transactions?.seller_id,
    };

    // ส่ง realtime event ทันทีทั้งสองฝ่าย
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

    res.json({ message: "เช็คอินจุดนัดรับสำเร็จ", bothCheckedIn: !!otherCheckedIn, checkInData });
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
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

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
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

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

    // ต้องเป็นผู้ซื้อหรือผู้ขายของนัดนี้เท่านั้น
    const { data: appt } = await supabase
      .from("appointments")
      .select("id, transactions(buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

    // ตรวจเวลา/วันที่ใหม่ (ถ้ามีการเปลี่ยน)
    if (finalTime !== undefined && !isWithinMeetupHours(finalTime)) {
      return res.status(400).json({ error: MEETUP_HOURS_TEXT });
    }
    if (finalDate !== undefined && String(finalDate) < todayInBangkok()) {
      return res.status(400).json({ error: "ไม่สามารถนัดรับย้อนหลังได้ กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป" });
    }

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
  checkAndProcessNoShows,
};