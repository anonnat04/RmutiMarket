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
// ----------------------------------------------------------------
async function recordPenalty(userId, actionType, reason) {
  try {
    const rule = await getPenaltyRule(actionType);
    if (!rule || !rule.is_active) return; // ไม่มีกฎหรือปิดกฎ = ไม่ตัดคะแนน
    const pointsDeducted = rule.points_deducted;

    const { data: user } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", userId)
      .single();

    if (!user) return;

    const currentScore = user.trust_score ?? 100;
    const newScore = Math.max(0, currentScore - pointsDeducted);

    await supabase.from("users").update({ trust_score: newScore }).eq("id", userId);

    await supabase.from("user_penalties").insert({
      user_id: userId,
      penalty_rule_id: rule.id,
      reason: reason || actionType,
    });

    await supabase.from("user_score_history").insert({
      user_id: userId,
      change_amount: -(currentScore - newScore),
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
// Helper: ตรวจสอบและตัดจบนัดหมายที่เลยเวลา (threshold_minutes ของกฎ NO_SHOW) และตัดคะแนนคนไม่มาเช็คอิน
// ----------------------------------------------------------------
async function checkAndProcessNoShows() {
  try {
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
            `ผู้ซื้อไม่มาตามนัดรับสินค้า (เกินเวลา ${graceMin} นาที) - นัดหมาย #${appt.id}`
          );
          sendNotificationToUser(txn.buyer_id, {
            user_id: txn.buyer_id,
            type: "penalty",
            title: "⚠️ คุณถูกตัดคะแนนเนื่องจากไม่มาตามนัด",
            message: `ระบบตัดคะแนนความน่าเชื่อถือของคุณเนื่องจากไม่มาเช็คอินตามจุดนัดพบภายใน ${graceMin} นาที`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        }

        if (!sellerCheckedIn && txn.seller_id) {
          await recordPenalty(
            txn.seller_id,
            "NO_SHOW",
            `ผู้ขายไม่มาตามนัดรับสินค้า (เกินเวลา ${graceMin} นาที) - นัดหมาย #${appt.id}`
          );
          sendNotificationToUser(txn.seller_id, {
            user_id: txn.seller_id,
            type: "penalty",
            title: "⚠️ คุณถูกตัดคะแนนเนื่องจากไม่มาตามนัด",
            message: `ระบบตัดคะแนนความน่าเชื่อถือของคุณเนื่องจากไม่มาเช็คอินตามจุดนัดพบภายใน ${graceMin} นาที`,
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
            message: `เนื่องจากผู้ขายไม่ได้มาเช็คอินภายใน ${graceMin} นาที ระบบจึงตัดจบนัดหมายและตัดคะแนนผู้ขาย`,
            reference_type: "meetup",
            reference_id: appt.id,
          });
        } else if (sellerCheckedIn && !buyerCheckedIn && txn.seller_id) {
          sendNotificationToUser(txn.seller_id, {
            user_id: txn.seller_id,
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
        created_at, confirmed_at, created_by, cancelled_at, cancellation_reason,
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
// Helper: เปิดธุรกรรมใหม่ + จองสินค้า (AVAILABLE -> RESERVED) แบบ atomic
// ใช้ได้ทั้งตอนซื้อครั้งแรก และตอนขอนัดใหม่หลังนัดเดิมถูกยกเลิก/ตัดจบ/ไม่มาตามนัด
// ----------------------------------------------------------------
async function openNewTransaction(productId, buyerId, sellerId) {
  // จองสินค้าเฉพาะตอนที่ยังว่าง (1 = AVAILABLE) กันสองคนจองพร้อมกัน
  const { data: claimed } = await supabase
    .from("products")
    .update({ status_id: 2 }) // 2 = RESERVED
    .eq("id", productId)
    .eq("status_id", 1)
    .select("id");
  if (!claimed?.length) {
    return { error: "สินค้านี้ไม่ว่างแล้ว (มีผู้อื่นจองหรือขายไปแล้ว)" };
  }

  const { data: newTxn, error: tErr } = await supabase
    .from("transactions")
    .insert({
      product_id: productId,
      buyer_id: buyerId,
      seller_id: sellerId,
      status_id: 2, // 2 = CONFIRMED
    })
    .select("id, buyer_id, seller_id, status_id, product_id")
    .single();

  if (tErr) {
    // สร้างธุรกรรมไม่สำเร็จ คืนสินค้ากลับเป็นว่าง
    await supabase.from("products").update({ status_id: 1 }).eq("id", productId).eq("status_id", 2);
    throw tErr;
  }
  return { txn: newTxn };
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
      // ดีลที่ขายสำเร็จแล้ว (3) ห้ามนัดซ้ำ
      if (txn.status_id === 3) {
        return res.status(400).json({ error: "รายการซื้อขายนี้เสร็จสิ้นแล้ว ไม่สามารถสร้างนัดใหม่ได้" });
      }
      // ดีลที่ถูกยกเลิก/ตัดจบ (4) -> เปิดธุรกรรมใหม่ของสินค้าชิ้นเดิม ผู้ซื้อ-ผู้ขายคู่เดิม
      if (txn.status_id === 4) {
        const r = await openNewTransaction(txn.product_id, txn.buyer_id, txn.seller_id);
        if (r.error) return res.status(400).json({ error: r.error });
        txn = r.txn;
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

      // หาธุรกรรมที่ยังไม่ถูกยกเลิก (ยกเลิกแล้วจะไม่เจอ -> เปิดใหม่ได้)
      const { data: existingTxns } = await supabase
        .from("transactions")
        .select("id, buyer_id, seller_id, status_id, product_id")
        .eq("product_id", targetProductId)
        .eq("buyer_id", req.user.id)
        .neq("status_id", 4) // 4 = ยกเลิก (CANCELLED)
        .limit(1);

      if (existingTxns?.length) {
        txn = existingTxns[0];
        if (txn.status_id === 3) {
          return res.status(400).json({ error: "รายการซื้อขายนี้เสร็จสิ้นแล้ว ไม่สามารถสร้างนัดใหม่ได้" });
        }
      } else {
        const r = await openNewTransaction(targetProductId, req.user.id, targetSellerId);
        if (r.error) return res.status(400).json({ error: r.error });
        txn = r.txn;
      }
    }

    if (!txn) {
      return res.status(400).json({ error: "ไม่พบข้อมูลรายการซื้อขาย" });
    }

    // ── ถ้ามีนัดหมาย PENDING เก่าของธุรกรรมนี้ ให้ยกเลิกอันเก่า (4 = CANCELLED) ──
    const { data: existingPending } = await supabase
      .from('appointments')
      .select('id')
      .eq('transaction_id', txn.id)
      .eq('status_id', 1)
      .limit(5);
    if (existingPending?.length) {
      const oldIds = existingPending.map((a) => a.id);
      await supabase.from('appointments').update({
        status_id: 4,
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.user.id,
        cancellation_reason: 'replaced_by_new_request',
      }).in('id', oldIds);
    }

    // ── ตรวจเวลานัดหมายซ้ำ/ทับซ้อน (Overlap Check) ──
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
        const involvesParty =
          t.buyer_id === txn.buyer_id ||
          t.seller_id === txn.buyer_id ||
          t.buyer_id === txn.seller_id ||
          t.seller_id === txn.seller_id ||
          t.product_id === txn.product_id;

        if (!involvesParty) return false;

        const apptMin = toMinutes(a.appointment_time);
        return Math.abs(apptMin - targetMin) < 30;
      });

      if (conflict) {
        return res.status(400).json({
          error: `เวลานัดหมาย ${finalTime} น. ซ้อนทับกับนัดรับอื่นที่มีอยู่แล้ว กรุณาเลือกเวลาอื่น`,
        });
      }
    }

    // Insert Appointment (บันทึก created_by เพื่อกันผู้สร้างนัดกดยืนยันนัดตัวเอง)
    const { data: appointment, error: aErr } = await supabase
      .from("appointments")
      .insert({
        transaction_id: txn.id,
        appointment_date: finalDate,
        appointment_time: finalTime,
        location_id: resolvedLocationId,
        location_detail: finalDetail,
        status_id: 1, // 1 = รอการยืนยัน (PENDING)
        created_by: req.user.id,
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
      .select("id, transaction_id, status_id, buyer_checked_in, seller_checked_in, transactions(id, product_id, buyer_id, seller_id)")
      .eq("id", id)
      .single();

    if (!appt) return res.status(404).json({ error: "ไม่พบนัดรับ" });
    if (!isParticipant(appt.transactions, req.user.id)) {
      return res.status(403).json({ error: "คุณไม่ได้มีส่วนร่วมในนัดรับนี้" });
    }

    // ต้องเช็คอินครบทั้งสองฝ่ายและนัดต้องอยู่ในสถานะ CONFIRMED ก่อนจึงจะปิดดีลได้
    if (appt.status_id !== 2 || !appt.buyer_checked_in || !appt.seller_checked_in) {
      return res.status(400).json({ error: "ต้องเช็คอินที่จุดนัดรับให้ครบทั้งสองฝ่ายก่อน จึงจะยืนยันส่งมอบสินค้าได้" });
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
        cancelled_by: req.user.id,
        cancellation_reason: reason,
      })
      .eq("id", id)
      .in("status_id", [1, 2])
      .select("id");
    if (!claimed?.length) {
      return res.status(400).json({ error: "นัดหมายนี้สิ้นสุดแล้ว ไม่สามารถยกเลิกได้" });
    }

    await supabase.from("transactions").update({
      status_id: 4,
      cancelled_at: nowIso,
    }).eq("id", appt.transaction_id);

    if (appt.transactions?.product_id) {
      await supabase.from("products").update({ status_id: 1 }).eq("id", appt.transactions.product_id);
    }

    // ── ตัดคะแนนเฉพาะคนที่กดยกเลิก + แจ้งเตือน ──
    if (lateRule) {
      const threshold = lateRule.threshold_minutes ?? LATE_CANCEL_THRESHOLD_MINUTES;
      await recordPenalty(
        req.user.id,
        "LATE_CANCEL",
        `ยกเลิกนัด #${id} ก่อนเวลานัดน้อยกว่า ${threshold} นาที: ${reason}`
      );
      const penaltyNotif = {
        user_id: req.user.id,
        type: "penalty",
        title: "⚠️ คุณถูกตัดคะแนนจากการยกเลิกนัดกระชั้นชิด",
        message: `คุณยกเลิกนัดที่ยืนยันแล้วก่อนเวลานัดน้อยกว่า ${threshold} นาที ระบบตัด ${lateRule.points_deducted} คะแนนความน่าเชื่อถือ`,
        reference_type: "meetup",
        reference_id: Number(id),
      };
      try {
        const { data: ins } = await supabase.from("notifications").insert(penaltyNotif).select("*").single();
        sendNotificationToUser(req.user.id, ins || penaltyNotif);
      } catch (nErr) {
        console.warn("[cancelMeetup] penalty notification warning:", nErr.message);
        sendNotificationToUser(req.user.id, penaltyNotif);
      }
    }

    // ── แจ้งคู่ค้า (ไม่โดนตัดคะแนน) ──
    const partnerId = String(appt.transactions.buyer_id) === String(req.user.id)
      ? appt.transactions.seller_id
      : appt.transactions.buyer_id;
    if (partnerId) {
      const partnerNotif = {
        user_id: partnerId,
        type: "meetup_cancelled",
        title: "คู่ค้ายกเลิกนัดรับ",
        message: `เหตุผล: ${reason}`,
        reference_type: "meetup",
        reference_id: Number(id),
      };
      try {
        const { data: ins } = await supabase.from("notifications").insert(partnerNotif).select("*").single();
        sendNotificationToUser(partnerId, ins || partnerNotif);
      } catch (nErr) {
        console.warn("[cancelMeetup] partner notification warning:", nErr.message);
        sendNotificationToUser(partnerId, partnerNotif);
      }
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
      penalized: !!lateRule,
      pointsDeducted: lateRule ? lateRule.points_deducted : 0,
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
};