import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";

// ────────────────────────────────────────────────────────────
// Chat-based Appointment Card
// การ์ดนัดรับสินค้าที่แสดงในห้องแชท กดยืนยัน/ปฏิเสธ/ไปหน้าเช็คอินได้ทันที
//
// ข้อความในแชทมี 2 แบบ (payload เป็น JSON ใน messages.content)
//   event = "requested"  → การ์ดคำขอนัดรับ (มีปุ่มยืนยัน/ปฏิเสธ)
//   event = "confirmed" | "rejected" | "cancelled" → การ์ดสรุปผล (ส่งจากเซิร์ฟเวอร์อัตโนมัติ)
// รองรับข้อความ TEXT แบบเดิมที่เคยส่งจากหน้าบ้านด้วย (แยกด้วยข้อความ/อีโมจิ)
// ────────────────────────────────────────────────────────────

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// 2026-11-19 → 19 พฤศจิกายน 2569 (ตัดเฉพาะ YYYY-MM-DD กัน timezone เลื่อนวัน)
export function formatThaiDate(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(dateStr);
  const year = Number(m[1]);
  const buddhist = year > 2400 ? year : year + 543;
  return `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1] || ""} ${buddhist}`;
}

function formatPrice(p) {
  if (p === null || p === undefined || p === "") return "";
  const n = Number(p);
  if (!Number.isFinite(n)) return "";
  return `฿${n.toLocaleString("th-TH")}`;
}

function tryParseJson(text) {
  try {
    const parsed = JSON.parse(String(text || ""));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const LEGACY_KEYWORDS = ["นัดรับสินค้า", "คำขอนัดรับ", "นัดหมายรับสินค้า", "นัดรับได้รับการยืนยันแล้ว", "ปฏิเสธคำขอนัดรับ"];

// ข้อความนี้ควรแสดงเป็นการ์ดนัดรับหรือไม่
export function isMeetupMessage(message) {
  if (!message) return false;
  if (message.type === "MEETUP_SUMMARY") return true;
  const txt = String(message.text || "");
  const parsed = tryParseJson(txt);
  if (parsed) return parsed.kind === "MEETUP" || Boolean(parsed.meetupId);
  // ข้อความ TEXT เดิมที่ขึ้นต้นด้วยอีโมจิ/คำนัดรับ (ไม่จับข้อความคุยทั่วไปที่แค่เอ่ยคำว่านัดรับ)
  if (message.type && message.type !== "TEXT") return false;
  return /^(✅|❌|📅)/.test(txt.trim()) && LEGACY_KEYWORDS.some((k) => txt.includes(k));
}

// สถานะจาก backend/payload → pending | confirmed | cancelled | completed | no_show
export function normalizeMeetupStatus(raw) {
  const s = String(raw || "").toLowerCase();
  if (["confirmed", "accepted", "scheduled"].includes(s)) return "confirmed";
  if (["cancelled", "canceled", "rejected", "expired"].includes(s)) return "cancelled";
  if (s === "completed") return "completed";
  if (["no_show", "missed"].includes(s)) return "no_show";
  return "pending";
}

// แยกข้อมูลนัดรับจากข้อความ + จับคู่กับรายการนัดหมายจริงจาก API
// เงื่อนไขการจับคู่: meetupId ตรงเป๊ะก่อน → ถ้าเป็นข้อความเก่าไม่มี id ให้หานัดล่าสุดของสินค้านี้
export function extractMeetupData(message, active, meetupsList, currentUserId) {
  const txt = String(message?.text || "");
  const parsed = tryParseJson(txt) || {};
  const list = meetupsList || [];

  const pidOf = (m) => m.productId || m.product_id || m.transaction?.product_id;
  const newest = (arr) =>
    [...arr].sort((a, b) => Number(b.id) - Number(a.id))[0] || null;

  let matched = null;
  if (parsed.meetupId) {
    matched = list.find((m) => String(m.id) === String(parsed.meetupId)) || null;
  } else if (active?.productId) {
    const sameProduct = list.filter((m) => String(pidOf(m)) === String(active.productId));
    // ข้อความเก่า: เลือกเฉพาะนัดของคู่สนทนานี้ แล้วเอาล่าสุด
    const withPartner = sameProduct.filter((m) =>
      active.partnerId == null ||
      String(m.buyerId) === String(active.partnerId) ||
      String(m.sellerId) === String(active.partnerId));
    matched = newest(withPartner.length ? withPartner : sameProduct);
  }

  // ข้อความเก่า (TEXT) ดึงวัน/เวลา/สถานที่ด้วย regex
  const dateMatch = txt.match(/วันที่\s*[:：]?\s*([0-9\-\/]+)/);
  const timeMatch = txt.match(/เวลา\s*[:：]?\s*([0-9:]+)/);
  const locMatch = txt.match(/(?:ณ|จุดนัดรับ\s*[:：])\s*([^\n(]+?)(?:\s*\(|\n|$)/);

  const iAmSeller = String(active?.sellerId) === String(currentUserId);

  // event ของข้อความ (ผลลัพธ์ที่เซิร์ฟเวอร์ส่ง หรือเดาจากข้อความเก่า)
  let event = parsed.event || "requested";
  if (!parsed.event) {
    if (txt.trim().startsWith("✅") || txt.includes("ได้รับการยืนยันแล้ว")) event = "confirmed";
    else if (txt.trim().startsWith("❌") || txt.includes("ปฏิเสธคำขอนัดรับ")) event = "rejected";
  }

  // สถานะ "ปัจจุบัน" ใช้ข้อมูลจริงจาก API ก่อน ถ้าไม่มีค่อยใช้ค่าในข้อความ
  const liveStatus = matched?.status || (matched?.statusCode ? String(matched.statusCode).toLowerCase() : null);
  const status = normalizeMeetupStatus(
    liveStatus || parsed.status || (event === "confirmed" ? "confirmed" : event === "requested" ? "pending" : "cancelled")
  );

  return {
    event,
    status,
    meetupId: parsed.meetupId || matched?.id || null,
    createdBy: parsed.createdBy ?? matched?.createdBy ?? matched?.created_by ?? null,
    productId: parsed.productId || matched?.productId || active?.productId || null,
    productTitle: parsed.productTitle || matched?.productTitle || active?.productTitle || "สินค้า",
    // ราคาเอาจาก API ล่าสุดก่อน เพื่อให้สรุปราคาตรงกับข้อมูลจริงเสมอ
    price: matched?.price ?? matched?.productPrice ?? parsed.price ?? parsed.productPrice ?? active?.productPrice ?? 0,
    date: matched?.appointment_date || matched?.date || parsed.date || dateMatch?.[1] || "",
    time: String(matched?.appointment_time || matched?.time || parsed.time || timeMatch?.[1] || "").slice(0, 5),
    locationName: matched?.locationName || parsed.locationName || locMatch?.[1]?.trim() || "Safe Point มหาวิทยาลัย",
    note: matched?.meetingDetail || matched?.note || parsed.note || "",
    buyerId: parsed.buyerId || matched?.buyerId || (iAmSeller ? active?.partnerId : currentUserId),
    sellerId: parsed.sellerId || matched?.sellerId || active?.sellerId,
    buyerName: parsed.buyerName || matched?.buyerName || (iAmSeller ? active?.name : "คุณ (ผู้ซื้อ)"),
    sellerName: parsed.sellerName || matched?.sellerName || (iAmSeller ? "คุณ (ผู้ขาย)" : active?.name),
  };
}

// ── ดึง meetupId ถ้าข้อความเก่าไม่มี id ──
async function resolveMeetupId(data) {
  if (data.meetupId) return data.meetupId;
  try {
    const res = await api.getMyMeetups();
    const pid = (m) => m.productId || m.product_id || m.transaction?.product_id;
    const found = (res?.meetups || [])
      .filter((m) => String(pid(m)) === String(data.productId || "") && normalizeMeetupStatus(m.status) === "pending")
      .sort((a, b) => Number(b.id) - Number(a.id))[0];
    return found?.id || null;
  } catch (e) {
    console.warn("resolveMeetupId error:", e);
    return null;
  }
}

function StatusBadge({ status }) {
  if (status === "confirmed") {
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">ยืนยันแล้ว</span>;
  }
  if (status === "cancelled") {
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 shrink-0">ปฏิเสธ/ยกเลิกแล้ว</span>;
  }
  if (status === "completed") {
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">เสร็จสิ้น</span>;
  }
  if (status === "no_show") {
    return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shrink-0">ไม่มาตามนัด</span>;
  }
  return <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 shrink-0">รอผู้ขายยืนยัน</span>;
}

function DetailRows({ data }) {
  return (
    <div className="space-y-2 text-xs text-gray-700">
      <div className="flex items-center justify-between gap-2 bg-orange-50/60 p-2 rounded-xl border border-orange-100">
        <span className="font-bold text-gray-900 truncate max-w-[200px]">🛍️ {data.productTitle || "สินค้า"}</span>
        {Number(data.price) > 0 && (
          <span className="font-extrabold text-brand-600 text-sm shrink-0">💰 {formatPrice(data.price)}</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-gray-800">
        <span className="text-sm">📅</span>
        <span className="font-medium">{formatThaiDate(data.date) || "ไม่ระบุวัน"}</span>
      </div>
      <div className="flex items-center gap-2 text-gray-800">
        <span className="text-sm">🕒</span>
        <span className="font-medium">{data.time ? `${data.time} น.` : "ไม่ระบุเวลา"}</span>
      </div>
      <div className="flex items-start gap-2 text-gray-800">
        <span className="text-sm mt-0.5">📍</span>
        <span className="font-medium leading-snug">{data.locationName || "Safe Point มหาวิทยาลัย"}</span>
      </div>
      {data.note && (
        <div className="flex items-start gap-2 text-amber-800 bg-amber-50/80 p-2 rounded-lg text-[11px]">
          <span className="mt-0.5">📌</span>
          <span className="leading-relaxed">หมายเหตุ: {data.note}</span>
        </div>
      )}
    </div>
  );
}

export function MeetupAppointmentCard({ data, currentUserId, onActionDone }) {
  const navigate = useNavigate();
  const [localStatus, setLocalStatus] = useState(null); // ผลที่เพิ่งกดเอง (แสดงทันทีก่อน API รีเฟรช)
  const [busy, setBusy] = useState(null); // 'accept' | 'reject'
  const [confirmReject, setConfirmReject] = useState(false);
  const [feedback, setFeedback] = useState("");

  // เมื่อข้อมูลจริงจาก API เปลี่ยน ให้ใช้ค่าจริงเป็นหลัก
  useEffect(() => { setLocalStatus(null); }, [data.status, data.meetupId]);

  const status = localStatus || data.status;
  const isSummary = data.event && data.event !== "requested";

  const myId = String(currentUserId);
  const isParticipant = myId === String(data.buyerId) || myId === String(data.sellerId);
  // ผู้สร้างนัดยืนยันนัดตัวเองไม่ได้ (ตรงกับ backend) ถ้าไม่ทราบผู้สร้างให้ถือว่าผู้ขายเป็นคนยืนยัน
  const iAmCreator = data.createdBy != null
    ? String(data.createdBy) === myId
    : myId === String(data.buyerId);
  const canAccept = status === "pending" && isParticipant && !iAmCreator;
  const canWithdraw = status === "pending" && isParticipant && iAmCreator;

  const goCheckIn = () => {
    if (data.meetupId) navigate(`/meetups/${data.meetupId}/checkin`);
    else navigate("/meetups?tab=confirmed");
  };

  const handleAccept = async () => {
    setBusy("accept");
    setFeedback("");
    try {
      const id = await resolveMeetupId(data);
      if (!id) { setFeedback("❌ ไม่พบรหัสนัดหมาย กรุณารีเฟรชแล้วลองใหม่"); return; }
      // เซิร์ฟเวอร์จะส่งข้อความสรุปนัดรับ (สินค้า ราคา วัน เวลา จุดนัด) ลงห้องแชทให้อัตโนมัติผ่าน Socket.IO
      await api.acceptMeetup(id);
      setLocalStatus("confirmed");
      setFeedback("✅ ยืนยันนัดรับเรียบร้อยแล้ว");
      onActionDone?.();
    } catch (e) {
      setFeedback(`❌ ${e?.message || "ยืนยันไม่สำเร็จ กรุณาลองใหม่"}`);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    setBusy("reject");
    setFeedback("");
    try {
      const id = await resolveMeetupId(data);
      if (!id) { setFeedback("❌ ไม่พบรหัสนัดหมาย กรุณารีเฟรชแล้วลองใหม่"); return; }
      await api.cancelMeetup(id, canAccept ? "ผู้ขายปฏิเสธคำขอนัดรับ" : "ผู้ซื้อยกเลิกคำขอนัดรับ");
      setLocalStatus("cancelled");
      setConfirmReject(false);
      setFeedback(canAccept ? "ปฏิเสธคำขอนัดรับแล้ว" : "ยกเลิกคำขอนัดรับแล้ว");
      onActionDone?.();
    } catch (e) {
      setFeedback(`❌ ${e?.message || "ดำเนินการไม่สำเร็จ"}`);
    } finally {
      setBusy(null);
    }
  };

  const wrapper = "w-full max-w-[340px] sm:max-w-[400px] rounded-2xl border bg-white p-4 shadow-sm text-gray-800 my-1";

  // ─────────── การ์ดสรุปผลที่ระบบส่งอัตโนมัติ ───────────
  if (isSummary) {
    const confirmed = data.event === "confirmed";
    return (
      <div className={`${wrapper} ${confirmed ? "border-emerald-200" : "border-red-200"}`}>
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3">
          <h4 className={`font-extrabold text-sm flex items-center gap-1.5 ${confirmed ? "text-emerald-700" : "text-red-600"}`}>
            {confirmed ? "✅ นัดรับได้รับการยืนยันแล้ว" : data.event === "rejected" ? "❌ คำขอนัดรับถูกปฏิเสธ" : "❌ คำขอนัดรับถูกยกเลิก"}
          </h4>
          <StatusBadge status={confirmed ? "confirmed" : "cancelled"} />
        </div>
        <DetailRows data={data} />
        <div className="mt-3.5 pt-3 border-t border-gray-100 space-y-2">
          {confirmed ? (
            status === "cancelled" || status === "no_show" ? (
              <p className="text-[11px] text-red-500 text-center font-medium">นัดหมายนี้ถูกยกเลิกภายหลัง สามารถสร้างคำขอนัดรับใหม่ได้</p>
            ) : (
              <>
                <p className="text-[11px] text-gray-500 text-center">ทั้งสองฝ่ายสามารถดูรายละเอียดและไปยังหน้าเช็คอินได้</p>
                <button
                  type="button"
                  onClick={goCheckIn}
                  className="w-full py-2.5 px-4 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-orange-600 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
                >
                  📍 ดู Safe Point และเช็คอิน
                </button>
              </>
            )
          ) : (
            <p className="text-[11px] text-gray-500 text-center">สามารถสร้างคำขอนัดรับใหม่ได้เมื่อตกลงวัน/เวลาอื่น</p>
          )}
        </div>
      </div>
    );
  }

  // ─────────── การ์ดคำขอนัดรับ (กดได้ทันที) ───────────
  const confirmedState = status === "confirmed" || status === "completed";
  const cancelledState = status === "cancelled";

  return (
    <div className={`${wrapper} border-gray-200/90 transition-all`}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3">
        <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
          {confirmedState ? (
            <span className="text-emerald-700">✅ นัดรับได้รับการยืนยันแล้ว</span>
          ) : cancelledState ? (
            <span className="text-red-600">❌ คำขอนัดรับถูกปฏิเสธ/ยกเลิก</span>
          ) : status === "no_show" ? (
            <span className="text-rose-600">⚠️ ไม่มาตามนัด</span>
          ) : (
            <span>📅 คำขอนัดรับสินค้า</span>
          )}
        </h4>
        <StatusBadge status={status} />
      </div>

      <DetailRows data={data} />

      {feedback && (
        <div className="mt-2.5 p-2 rounded-lg bg-gray-50 text-[11px] font-semibold text-center text-gray-700 border border-gray-200">
          {feedback}
        </div>
      )}

      <div className="mt-3.5 pt-3 border-t border-gray-100">
        {confirmedState ? (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 text-center">ทั้งสองฝ่ายสามารถดูรายละเอียดและไปยังหน้าเช็คอินได้</p>
            <button
              type="button"
              onClick={goCheckIn}
              className="w-full py-2.5 px-4 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-orange-600 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              📍 ดู Safe Point และเช็คอิน
            </button>
          </div>
        ) : cancelledState || status === "no_show" ? (
          <p className="text-[11px] text-red-500 text-center font-medium">
            {status === "no_show" ? "นัดหมายนี้ถูกตัดจบเพราะไม่มาตามนัด" : "นัดหมายนี้ถูกยกเลิกแล้ว"} สามารถสร้างคำขอนัดรับใหม่ได้
          </p>
        ) : canAccept ? (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500">ผู้ขายสามารถเลือกดำเนินการได้</p>
            {confirmReject ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={!!busy}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                >
                  {busy === "reject" ? "กำลังปฏิเสธ..." : "ยืนยันปฏิเสธ"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReject(false)}
                  disabled={!!busy}
                  className="py-2.5 px-4 rounded-xl text-gray-600 hover:bg-gray-100 font-semibold text-xs cursor-pointer"
                >
                  ย้อนกลับ
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!!busy}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {busy === "accept" ? "⏳ กำลังยืนยัน..." : "ยืนยันนัดรับ"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReject(true)}
                  disabled={!!busy}
                  className="py-2.5 px-4 rounded-xl text-gray-700 hover:text-red-600 hover:bg-red-50 font-semibold text-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  ปฏิเสธ
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-500 font-medium">⏳ รอผู้ขายตอบรับคำขอนัดรับ...</p>
            {canWithdraw && (
              <button
                type="button"
                onClick={handleReject}
                disabled={!!busy}
                className="text-[11px] text-red-500 hover:underline font-semibold cursor-pointer disabled:opacity-50"
              >
                {busy === "reject" ? "..." : "ยกเลิกคำขอ"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}