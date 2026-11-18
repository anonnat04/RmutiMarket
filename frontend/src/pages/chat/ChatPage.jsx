import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import {
  Send,
  MessageCircle,
  CalendarClock,
  Package,
  ShieldCheck,
  ChevronRight,
  Image as ImageIcon,
  Radio,
  X,
  Maximize2,
  ArrowLeft,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { formatCurrency } from "@/utils/formatCurrency";
import { useAuthStore } from "@/store/authStore";
import {
  getSocket,
  joinConversation,
  leaveConversation,
  sendRealtimeMessage,
  sendTypingStatus,
  markConversationAsRead,
} from "@/services/socket";
import { api } from "@/lib/api";
import { fetchProductDetail } from "@/services/productService";
import { useChatStore } from "@/store/chatStore";
import { useNotificationStore } from "@/store/notificationStore";
import { compressImage } from "@/utils/compressImage";

// ห้องแชทที่ id เป็นตัวเลขล้วนเท่านั้นคือห้องจริงจากตาราง conversations
// ห้องที่ id ขึ้นต้นด้วย "conv-" (เช่น "conv-5") คือห้อง "รอ sync" ที่ยังไม่มี conversationId จริงจาก backend
// (เช่น กำลังสร้างห้องใหม่ระหว่างรอ createOrGetConversation ตอบกลับ)
function isRealConversationId(id) {
  return /^\d+$/.test(String(id));
}

// ────────────────────────────────────────────────────────────
// Format Thai Date: เช่น 18 พฤศจิกายน 2569
// ────────────────────────────────────────────────────────────
function formatThaiDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const months = [
      "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
      "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    const year = d.getFullYear() > 2500 ? d.getFullYear() : d.getFullYear() + 543;
    return `${d.getDate()} ${months[d.getMonth()]} ${year}`;
  } catch {
    return dateStr;
  }
}

// ตรวจสอบว่าข้อความเป็นข้อความเกี่ยวกับการนัดรับหรือไม่
function isMeetupMessage(message) {
  if (!message) return false;
  if (message.type === "MEETUP_SUMMARY") return true;
  const txt = String(message.text || "");
  if (txt.includes("นัดรับสินค้า") || txt.includes("คำขอนัดรับ") || txt.includes("นัดหมายรับสินค้า") || txt.includes("นัดรับได้รับการยืนยันแล้ว")) {
    return true;
  }
  try {
    const parsed = JSON.parse(txt);
    if (parsed && (parsed.meetupId || (parsed.date && parsed.time))) return true;
  } catch {}
  return false;
}

// ดึงข้อมูลนัดรับจากข้อความ (รองรับทั้ง JSON และข้อความ TEXT รูปแบบเดิม)
function extractMeetupData(message, active, meetupsList, currentUserId) {
  let parsed = null;
  const txt = String(message?.text || "");
  try {
    parsed = JSON.parse(txt);
  } catch {}

  // แมทช์นัดหมายจากรายการ meetups ของผู้ใช้
  const matchedMeetup = (meetupsList || []).find((m) => {
    if (parsed?.meetupId && String(m.id) === String(parsed.meetupId)) return true;
    const pid = m.productId || m.product_id || m.transaction?.product_id;
    return String(pid) === String(active?.productId);
  }) || (meetupsList && meetupsList[0]);

  // ดึง วันที่, เวลา, สถานที่ จากข้อความ TEXT ในกรณีไม่ใช่ JSON
  let extractedDate = "";
  let extractedTime = "";
  let extractedLoc = "";

  const dateMatch = txt.match(/วันที่\s*([0-9\-\/]+)/);
  if (dateMatch) extractedDate = dateMatch[1];
  const timeMatch = txt.match(/เวลา\s*([0-9:]+)/);
  if (timeMatch) extractedTime = timeMatch[1];
  const locMatch = txt.match(/ณ\s*([^(]+?)(?:\s*\(|$)/);
  if (locMatch) extractedLoc = locMatch[1].trim();

  const isConfirmedInText = txt.includes("ยืนยันแล้ว") || txt.includes("✅");
  const rawStatus = matchedMeetup?.status || matchedMeetup?.statusCode?.toLowerCase() || parsed?.status || (isConfirmedInText ? "confirmed" : "pending");

  return {
    meetupId: parsed?.meetupId || matchedMeetup?.id || null,
    status: rawStatus,
    productTitle: parsed?.productTitle || matchedMeetup?.productTitle || active?.productTitle || "สินค้า",
    price: parsed?.price || parsed?.productPrice || matchedMeetup?.price || matchedMeetup?.productPrice || active?.productPrice || 0,
    date: parsed?.date || matchedMeetup?.date || matchedMeetup?.appointment_date || extractedDate || "",
    time: parsed?.time || matchedMeetup?.time || matchedMeetup?.appointment_time || extractedTime || "",
    locationName: parsed?.locationName || matchedMeetup?.locationName || matchedMeetup?.location?.name || extractedLoc || "จุดนัดรับ มทร.อีสาน (Safe Point)",
    note: parsed?.note || matchedMeetup?.note || matchedMeetup?.meetingDetail || "",
    buyerId: parsed?.buyerId || matchedMeetup?.buyerId || (String(active?.sellerId) === String(currentUserId) ? active?.partnerId : currentUserId),
    sellerId: parsed?.sellerId || matchedMeetup?.sellerId || active?.sellerId,
    buyerName: parsed?.buyerName || matchedMeetup?.buyerName || (String(active?.sellerId) === String(currentUserId) ? active?.name : "คุณ (ผู้ซื้อ)"),
    sellerName: parsed?.sellerName || matchedMeetup?.sellerName || (String(active?.sellerId) === String(currentUserId) ? "คุณ (ผู้ขาย)" : active?.name),
  };
}

// ────────────────────────────────────────────────────────────
// Bubble พิเศษ: Appointment Card (ระบบนัดรับที่แสดงเป็นการ์ดในแชท)
// ────────────────────────────────────────────────────────────
function MeetupSummaryBubble({ data, fromMe, currentUserId, conversationId, onActionDone }) {
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(data.status === 'confirmed' || data.status === 'CONFIRMED');
  const [rejecting, setRejecting] = useState(false);
  const [rejected, setRejected] = useState(data.status === 'cancelled' || data.status === 'CANCELLED' || data.status === 'rejected');
  const [feedback, setFeedback] = useState('');

  // ผู้ขายเป็นคนยืนยัน (accept) หรือปฏิเสธ (reject) นัดรับที่ผู้ซื้อสร้าง
  const iAmTheSeller = String(currentUserId) === String(data.sellerId);
  const canAccept = iAmTheSeller && !accepted && !rejected;

  const formatPrice = (p) => {
    if (!p && p !== 0) return '';
    return `฿${Number(p).toLocaleString('th-TH')}`;
  };

  // ส่งข้อความสรุปลงในแชทหลังยืนยัน/ปฏิเสธ (Realtime ทาง Socket.IO)
  const sendSummaryMessage = async (action) => {
    if (!conversationId) return;
    const isConfirmed = action === 'confirm';
    const summaryText = isConfirmed
      ? [
          `✅ นัดรับได้รับการยืนยันแล้ว!`,
          `📦 สินค้า: ${data.productTitle || 'สินค้า'}`,
          `💰 ราคา: ${formatPrice(data.price)}`,
          `📅 วันที่: ${formatThaiDate(data.date)}`,
          `🕒 เวลา: ${data.time} น.`,
          `📍 จุดนัดรับ: ${data.locationName || 'Safe Point มหาวิทยาลัย'}`,
          data.note ? `📌 หมายเหตุ: ${data.note}` : '',
          `ทั้งสองฝ่ายสามารถเข้าดูรายละเอียด Safe Point และเช็คอินได้`,
        ].filter(Boolean).join('\n')
      : `❌ ปฏิเสธคำขอนัดรับสินค้า "${data.productTitle || 'สินค้า'}" แล้ว\nสามารถสร้างคำขอนัดรับใหม่ได้เมื่อตกลงวัน/เวลาอื่น`;

    try {
      await sendRealtimeMessage({
        conversationId,
        text: summaryText,
        message_type: 'TEXT',
        sender: { id: currentUserId },
      });
    } catch (e) {
      try {
        await api.sendMessage(conversationId, { content: summaryText, message_type: 'TEXT' });
      } catch {}
    }
    if (onActionDone) onActionDone();
  };

  const handleAccept = async () => {
    if (!data.meetupId) {
      alert("ไม่พบรหัสนัดหมาย กรุณาลองใหม่อีกครั้ง");
      return;
    }
    setAccepting(true);
    setFeedback('');
    try {
      await api.acceptMeetup(data.meetupId);
      setAccepted(true);
      setFeedback('✅ ยืนยันนัดรับเรียบร้อยแล้ว');
      await sendSummaryMessage('confirm');
    } catch (e) {
      setFeedback(`❌ ${e?.message || 'ยืนยันไม่สำเร็จ กรุณาลองใหม่'}`);
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!data.meetupId) {
      alert("ไม่พบรหัสนัดหมาย");
      return;
    }
    setRejecting(true);
    setFeedback('');
    try {
      await api.cancelMeetup(data.meetupId, 'ปฏิเสธคำขอนัดรับ');
      setRejected(true);
      setFeedback('ปฏิเสธคำขอนัดรับแล้ว');
      await sendSummaryMessage('reject');
    } catch (e) {
      setFeedback(`❌ ${e?.message || 'ดำเนินการไม่สำเร็จ'}`);
    } finally {
      setRejecting(false);
    }
  };

  const isConfirmedState = accepted || data.status === 'confirmed';
  const isRejectedState = rejected || data.status === 'cancelled' || data.status === 'rejected';

  return (
    <div className="w-full max-w-[340px] sm:max-w-[380px] rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm text-gray-800 transition-all">
      {/* ─── Header: ชื่อการ์ด + ป้ายสถานะ ─── */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3">
        <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-1.5">
          {isConfirmedState ? (
            <span className="text-emerald-700 flex items-center gap-1">
              <span>✅</span> นัดรับได้รับการยืนยันแล้ว
            </span>
          ) : isRejectedState ? (
            <span className="text-red-600 flex items-center gap-1">
              <span>❌</span> คำขอนัดรับถูกปฏิเสธ
            </span>
          ) : (
            <span className="text-gray-900 flex items-center gap-1">
              <span>📅</span> คำขอนัดรับสินค้า
            </span>
          )}
        </h4>

        {/* Badge สถานะ */}
        {isConfirmedState ? (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
            ยืนยันแล้ว
          </span>
        ) : isRejectedState ? (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 shrink-0">
            ปฏิเสธแล้ว
          </span>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200 shrink-0">
            รอผู้ขายยืนยัน
          </span>
        )}
      </div>

      {/* ─── Body: ข้อมูลรายละเอียดนัดรับ ─── */}
      <div className="space-y-2 text-xs text-gray-700">
        {/* สินค้า & ราคา */}
        <div className="flex items-center justify-between bg-orange-50/60 p-2 rounded-xl border border-orange-100">
          <span className="font-bold text-gray-900 truncate max-w-[200px]">
            🛍️ {data.productTitle || 'สินค้า'}
          </span>
          {data.price > 0 && (
            <span className="font-extrabold text-brand-600 text-sm shrink-0">
              {formatPrice(data.price)}
            </span>
          )}
        </div>

        {/* วันที่ */}
        <div className="flex items-center gap-2 text-gray-800">
          <span className="text-sm">📅</span>
          <span className="font-medium">
            {formatThaiDate(data.date) || data.date || "ไม่ระบุวัน"}
          </span>
        </div>

        {/* เวลา */}
        <div className="flex items-center gap-2 text-gray-800">
          <span className="text-sm">🕒</span>
          <span className="font-medium">
            {data.time ? `${data.time} น.` : "ไม่ระบุเวลา"}
          </span>
        </div>

        {/* สถานที่ (Safe Point) */}
        <div className="flex items-start gap-2 text-gray-800">
          <span className="text-sm mt-0.5">📍</span>
          <span className="font-medium text-gray-800 leading-snug">
            {data.locationName || "Safe Point มหาวิทยาลัย"}
          </span>
        </div>

        {/* หมายเหตุ */}
        {data.note && (
          <div className="flex items-start gap-2 text-amber-800 bg-amber-50/80 p-2 rounded-lg text-[11px]">
            <span className="mt-0.5">📌</span>
            <span className="leading-relaxed">หมายเหตุ: {data.note}</span>
          </div>
        )}
      </div>

      {feedback && (
        <div className="mt-2.5 p-2 rounded-lg bg-gray-50 text-[11px] font-semibold text-center text-gray-700 border border-gray-200">
          {feedback}
        </div>
      )}

      {/* ─── Footer: โซนปุ่มดำเนินการ ─── */}
      <div className="mt-3.5 pt-3 border-t border-gray-100">
        {/* กรณี: ยืนยันนัดรับแล้ว -> แสดงปุ่มไปหน้าเช็คอิน GPS Safe Point */}
        {isConfirmedState ? (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-500 text-center">
              ทั้งสองฝ่ายสามารถดูรายละเอียดและไปยังหน้าเช็คอินได้
            </p>
            <button
              type="button"
              onClick={() => {
                if (data.meetupId) navigate(`/meetups/${data.meetupId}/checkin`);
                else navigate('/meetups?tab=confirmed');
              }}
              className="w-full py-2.5 px-4 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 text-orange-600 font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              📍 ดู Safe Point และเช็คอิน
            </button>
          </div>
        ) : isRejectedState ? (
          <p className="text-[11px] text-red-500 text-center font-medium">
            นัดหมายนี้ถูกยกเลิกแล้ว สามารถสร้างคำขอนัดรับใหม่ได้
          </p>
        ) : (
          /* กรณี: รอดำเนินการ (Pending) */
          <div>
            {canAccept ? (
              <div className="space-y-2">
                <p className="text-[11px] text-gray-500">
                  ผู้ขายสามารถเลือกดำเนินการได้
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={accepting || rejecting}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {accepting ? "⏳ กำลังยืนยัน..." : "ยืนยันนัดรับ"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={accepting || rejecting}
                    className="py-2.5 px-4 rounded-xl text-gray-700 hover:text-red-600 hover:bg-red-50 font-semibold text-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {rejecting ? "..." : "ปฏิเสธ"}
                  </button>
                </div>
              </div>
            ) : (
              /* ฝั่งผู้ซื้อ (ผู้ส่งคำขอ) */
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-500 font-medium">
                  ⏳ รอผู้ขายตอบรับคำขอนัดรับ...
                </p>
                {data.meetupId && (
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={rejecting}
                    className="text-[11px] text-red-500 hover:underline font-semibold cursor-pointer"
                  >
                    ยกเลิกคำขอ
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── เลือกชื่อที่จะแสดงของคู่สนทนา ──────────────────────────────────
// ตอนนี้ให้ "username" เป็นค่าหลักเสมอ (ตรงกับ users.username ในฐานข้อมูล)
function resolvePartnerName(partner) {
  return partner?.username || partner?.displayName || partner?.full_name || "เจ้าของสินค้า";
}

// ── ห้องนี้ "สิ้นสุด" แล้วหรือยัง ──────────────────────────────────
// สิ้นสุดเฉพาะเมื่อสินค้าขายแล้ว (products.status_id = 3) หรือดีลปิดงานสำเร็จ (transactions.status_id = 3)
// การยกเลิกนัด / ไม่มาตามนัด "ไม่ใช่" การสิ้นสุด — สินค้ายังว่างก็ยังนัดรับใหม่ได้
function isConversationEnded(room) {
  return (
    Number(room?.statusId) === 3 ||
    Number(room?.transactionStatusId) === 3 ||
    room?.isDealClosed === true
  );
}

function mapBackendMessage(message, currentUserId) {
  const senderUser = message.users;
  return {
    id: message.id,
    from: String(message.sender_id) === String(currentUserId) ? "me" : "them",
    senderName: senderUser?.username || senderUser?.full_name || null,
    text: message.content || "",
    type: message.message_type || "TEXT",
    image: message.message_attachments?.[0]?.file_url || null,
    isRead: !!message.is_read,
    time: message.created_at
      ? new Date(message.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
      : "เมื่อสักครู่",
  };
}

function sortConversationsByActivity(conversations) {
  return [...conversations].sort((left, right) => {
    const leftTime = Date.parse(left?.lastMessage?.createdAt || left?.updatedAt || left?.createdAt || 0) || 0;
    const rightTime = Date.parse(right?.lastMessage?.createdAt || right?.updatedAt || right?.createdAt || 0) || 0;
    return rightTime - leftTime;
  });
}

export function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);

  // ── ไม่อ่านค่าเริ่มต้นจาก localStorage ──
  // ยึดข้อมูลจาก backend (database) เป็นความจริงเสมอ
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [messagesLoadError, setMessagesLoadError] = useState("");
  const [reloadMessagesKey, setReloadMessagesKey] = useState(0);
  const [messageTotal, setMessageTotal] = useState(0);
  const [messagePage, setMessagePage] = useState(1);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [olderMessagesError, setOlderMessagesError] = useState("");
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState({});
  const [meetups, setMeetups] = useState([]);

  const fetchMeetups = async () => {
    try {
      const res = await api.getMyMeetups();
      if (res?.meetups) setMeetups(res.meetups);
    } catch (e) {
      console.warn("fetchMeetups error:", e);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchMeetups();
    }
  }, [user?.id]);

  // Realtime Socket.IO states
  const [isConnected, setIsConnected] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [deleteConvTarget, setDeleteConvTarget] = useState(null); // id ห้องแชทที่ต้องการลบ
  const [deletingConv, setDeletingConv] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const joinedRoomRefreshRef = useRef(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // แปลงข้อมูลห้องแชทจาก backend ให้เป็นรูปแบบที่ UI ใช้ (ใช้ร่วมกันทั้งตอนโหลดครั้งแรกและตอน refresh)
  function mapBackendConversation(c) {
    const partner = c.partner;
    const product = c.product;
    const coverImage =
      product?.coverImage ||
      "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500";

    return {
      id: String(c.id),
      name: resolvePartnerName(partner),
      partnerId: partner?.id,
      productId: product?.id,
      productTitle: product?.title || "สินค้า",
      productPrice: product?.price || 0,
      productImage: coverImage,
      sellerId: product?.sellerId ?? product?.seller_id,
      statusId: product?.statusId ?? product?.status_id,
      lastMessage: c.lastMessage?.content || "เริ่มการสนทนา",
      unread: (c.unreadCount || 0) > 0,
      messages: [],
      // ข้อมูลสถานะ deal สำหรับซ่อน/แสดงปุ่มนัดหมาย
      // isDealClosed = สินค้าขายแล้ว/ดีลสำเร็จเท่านั้น (ยกเลิก/ไม่มาตามนัด ไม่นับ)
      transactionStatusId: c.transactionStatusId ?? null,
      isDealClosed: c.isDealClosed ?? false,
      dealClosedAt: c.dealClosedAt ?? null,
      canScheduleMeetup: c.canScheduleMeetup,
    };
  }

  // ดึงรายการห้องแชทล่าสุดจาก backend มาแทนที่ทั้งชุด (คง local-only room ที่ backend ยังไม่รู้จักไว้ด้วย)
  // ใช้ตอนโหลดหน้าแชทครั้งแรก และตอนมีห้องแชทใหม่เข้ามาที่ยังไม่เคยอยู่ในไซด์บาร์
  const refreshingRef = useRef(false);
  const refreshConversationsFromBackend = async () => {
    if (refreshingRef.current) return; // กัน fetch ซ้อนกันหลายครั้งพร้อมกัน
    refreshingRef.current = true;
    try {
      const res = await api.getConversations();
      if (res?.conversations && Array.isArray(res.conversations)) {
        const validList = res.conversations;
        // แสดงทุกห้องจากฐานข้อมูลแยกตาม conversation id ไม่รวมตามสินค้า/คู่สนทนา
        const backendConvs = sortConversationsByActivity(validList.map(mapBackendConversation));

        setConversations((prev) => {
          // คงไว้เฉพาะห้อง "รอ sync" (id ไม่ใช่ตัวเลข เช่น conv-xxx) ที่ backend ยังไม่มี
          // ห้องที่มี id ตัวเลขจริงแต่ backend ไม่ส่งกลับมาแล้ว = ถูกลบ/ไม่มีสิทธิ์เข้าถึงแล้วในฐานข้อมูล (เช่น ยกเลิกนัด/ไม่มาตามนัด) ให้ตัดทิ้ง
          const pendingLocalOnly = prev.filter(
            (c) => !isRealConversationId(c.id) && !backendConvs.some((bc) => String(bc.productId) === String(c.productId))
          );
          return [...backendConvs, ...pendingLocalOnly];
        });

        // ถ้าห้อง active ถูกลบไปแล้ว ให้เปลี่ยนไปห้องแรก (บนมือถือถ้าไม่มีห้อง active ให้คงหน้าแสดงรายการแชทไว้)
        setActiveId((curr) => {
          const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
          if (!curr) return isMobile ? null : (backendConvs[0]?.id || null);
          const exists = backendConvs.some((c) => String(c.id) === String(curr));
          return exists ? curr : (isMobile ? null : (backendConvs[0]?.id || null));
        });

        // เคลียร์ localMessages ของห้องที่ backend ไม่รู้จักแล้ว (ถูกลบ/ไม่มีสิทธิ์เข้าถึง) ทิ้งไปด้วย
        setLocalMessages((prev) => {
          const validIds = new Set(backendConvs.map((c) => c.id));
          const next = {};
          for (const [convId, msgs] of Object.entries(prev)) {
            if (!isRealConversationId(convId) || validIds.has(convId)) {
              next[convId] = msgs;
            }
          }
          return next;
        });
      }
    } catch (err) {
      console.warn("refreshConversationsFromBackend error:", err?.message || err);
    } finally {
      refreshingRef.current = false;
    }
  };
  const refreshConversationsRef = useRef(refreshConversationsFromBackend);
  refreshConversationsRef.current = refreshConversationsFromBackend;

  // Keep product availability fresh while a chat stays open, including cases
  // where another participant completes/cancels a deal in another browser tab.
  useEffect(() => {
    if (!user?.id) return undefined;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refreshConversationsRef.current();
    };
    const timer = window.setInterval(refreshIfVisible, 30000);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, [user?.id]);

  // ─── 1. Load Conversations & Handle ?productId=xxx ───
  useEffect(() => {
    async function loadConversations() {
      try {
        setLoadingConvs(true);

        // ดึงการสนทนาจาก backend (ฐานข้อมูลเป็นความจริงหนึ่งเดียว)
        let backendConvs = [];
        try {
          const res = await api.getConversations();
          if (res?.conversations && Array.isArray(res.conversations)) {
            const validList = res.conversations;
            backendConvs = sortConversationsByActivity(validList.map(mapBackendConversation));
          }
        } catch (apiErr) {
          console.warn("[ChatPage] api.getConversations error:", apiErr?.message);
        }

        // เก็บทุกห้องสนทนาไว้ โดยใช้ conversation id เป็นตัวแยกห้อง
        let convList = backendConvs;

        // ─── ถ้ามี ?conversationId= จากการกดเสนอขายสินค้า ───
        const queryConvId = searchParams.get("conversationId");
        if (queryConvId) {
          const found = convList.some((c) => String(c.id) === String(queryConvId));
          if (!found) {
            try {
              const freshRes = await api.getConversations();
              if (freshRes?.conversations && Array.isArray(freshRes.conversations)) {
                convList = sortConversationsByActivity(freshRes.conversations.map(mapBackendConversation));
              }
            } catch (e) {
              console.warn("freshRes error:", e);
            }
          }
          setActiveId(String(queryConvId));
        }

        // ─── ถ้ามี ?productId= จากการกดปุ่ม "ทักแชท" บนหน้าสินค้า หรือเสนอขาย ───
        const queryProductId = searchParams.get("productId");
        const queryPartnerId = searchParams.get("partnerId");
        if (queryProductId && !queryConvId) {
          let targetConvId = null;
          let blockedSelfChat = false;

          // 1. ลองเรียก backend API เพื่อสร้างหรือดึงห้องแชท
          try {
            const convRes = await api.createOrGetConversation({
              productId: queryProductId,
              partnerId: queryPartnerId,
            });
            if (convRes?.conversationId) {
              targetConvId = String(convRes.conversationId);
            }
          } catch (e) {
            console.warn("createOrGetConversation error:", e?.message);

            if (e?.message?.includes("แชทกับตัวเอง")) {
              blockedSelfChat = true;
            }
          }

          if (blockedSelfChat) {
            alert("นี่คือสินค้าของคุณเอง ไม่สามารถแชทกับตัวเองได้");
            navigate(-1);
            setLoadingConvs(false);
            return;
          }

          // 2. ดึงข้อมูลรายละเอียดสินค้า (จาก location.state หรือ productService)
          let targetProduct = location.state?.product;
          if (!targetProduct) {
            try {
              targetProduct = await fetchProductDetail(queryProductId);
            } catch (err) {
              console.warn("fetchProductDetail fallback:", err);
            }
          }

          if (!queryPartnerId && targetProduct?.seller?.id && String(targetProduct.seller.id) === String(user?.id)) {
            alert("นี่คือสินค้าของคุณเอง ไม่สามารถแชทกับตัวเองได้");
            navigate(-1);
            setLoadingConvs(false);
            return;
          }

          const fallbackRoomId = targetConvId || `conv-${queryProductId}`;

          // หาห้องที่ id ตรงกับ fallbackRoomId เป๊ะๆ ก่อน (มาจาก backend แล้ว)
          let existingIdx = convList.findIndex((c) => String(c.id) === String(fallbackRoomId));

          if (existingIdx >= 0) {
            setActiveId(String(convList[existingIdx].id));
          } else if (targetProduct) {
            const partnerInfo = queryPartnerId
              ? { id: queryPartnerId, username: "ผู้ซื้อ", displayName: "ผู้ซื้อที่ตามหา" }
              : {
                  id: targetProduct.seller?.id,
                  username: targetProduct.seller?.username,
                  displayName: targetProduct.seller?.displayName || targetProduct.seller?.name,
                };
            const partnerName = resolvePartnerName(partnerInfo);
            const coverImage = targetProduct.images?.[0]?.imageUrl ||
              targetProduct.productImage ||
              "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500";

            const newRoom = {
              id: fallbackRoomId,
              name: partnerName,
              partnerId: partnerInfo.id,
              productId: targetProduct.id,
              productTitle: targetProduct.title || "สินค้า",
              productPrice: targetProduct.price || 0,
              productImage: coverImage,
              lastMessage: "เริ่มการสนทนา",
              unread: false,
              messages: [],
            };

            convList = [newRoom, ...convList];
            setActiveId(fallbackRoomId);
          } else {
            setActiveId(fallbackRoomId);
          }
        }

        setConversations(convList);
        // A prior URL/state can leave an id that is no longer in this account's
        // room list. Always fall back to a real room so the right panel never
        // stays blank while a conversation is available.
        setActiveId((currentId) => {
          if (queryConvId) {
            const requested = convList.find((room) => String(room.id) === String(queryConvId));
            return requested ? String(requested.id) : (convList[0] ? String(convList[0].id) : null);
          }
          if (queryProductId) return currentId;
          if (currentId && convList.some((room) => String(room.id) === String(currentId))) return currentId;
          const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
          if (isMobile) return null;
          return convList[0] ? String(convList[0].id) : null;
        });
      } catch (err) {
        console.warn("Failed to load conversations:", err);
      } finally {
        setLoadingConvs(false);
      }
    }

    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id]);

  // ─── 2. Setup Socket.IO connection and event listeners ───
  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      joinedRoomRefreshRef.current.clear();
      socket.emit("user_connected", {
        userId: user?.id || "me",
        userName: user?.username || user?.name || user?.full_name || "ฉัน",
      });
      if (activeId) {
        joinConversation(activeId);
      }
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleNewMessage = (msg) => {
      if (!msg.conversationId) return;

      // ข้ามข้อความที่ตัวเองส่งเอง (server broadcast กลับมาหาทุกคนในห้อง รวมถึงคนส่งเองด้วย)
      // เพราะเราแสดง optimistic bubble ไปแล้วตอนกดส่ง ถ้าไม่ข้ามจะเห็นข้อความตัวเองขึ้นซ้ำ 2 ครั้ง (บั๊ก "ส่งเบิ้ล")
      if (String(msg.sender?.id) === String(user?.id)) return;

      const cId = String(msg.conversationId);
      if (String(activeId) === cId && !(localMessages[cId] || []).some((item) => String(item.id) === String(msg.id))) {
        setMessageTotal((count) => count + 1);
      }
      if (String(activeId) === cId && user?.id) {
        markConversationAsRead(cId, user.id);
      }
      setLocalMessages((prev) => {
        const currentList = prev[cId] || [];
        if (currentList.some((m) => m.id === msg.id)) return prev;

        const formattedMsg = {
          id: msg.id,
          from: "them",
          senderName: msg.sender?.name || null,
          text: msg.text || msg.content,
          type: msg.message_type || msg.type || "TEXT",
          image: msg.imageUrl,
          time: msg.time || new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
        };

        return {
          ...prev,
          [cId]: [...currentList, formattedMsg],
        };
      });

      setConversations((prev) => {
        const exists = prev.some((c) => String(c.id) === cId);

        if (exists) {
          return prev.map((c) =>
            String(c.id) === cId
              ? { ...c, lastMessage: msg.text || msg.content || "ส่งรูปภาพ", unread: String(activeId) !== cId }
              : c
          );
        }

        // ห้องแชทนี้ยังไม่เคยอยู่ในไซด์บาร์เลย (เช่น มีคนทักมาใหม่ครั้งแรก ขณะเปิดหน้าแชทค้างอยู่)
        // ไปดึงรายการห้องแชทล่าสุดจาก backend มาแทนทั้งชุด เพื่อให้ห้องใหม่นี้โผล่ขึ้นมาทันที
        refreshConversationsFromBackend();
        return prev;
      });

      setTimeout(scrollToBottom, 50);
    };

    const handleUserTyping = ({ conversationId, isTyping }) => {
      if (String(conversationId) === String(activeId)) {
        setIsOtherTyping(isTyping);
      }
    };

    // แจ้งเตือนแบบ real-time (ส่งตรงถึง socket ส่วนตัวของ user คนนี้ ไม่ต้อง join ห้องแชทก่อนก็รับได้)
    const handleNewNotification = (n) => {
      if (["message", "chat_message", "meetup_scheduled", "meetup_cancelled", "deal_completed", "transaction_update"]
        .includes(String(n?.type || ""))) {
        refreshConversationsFromBackend();
      }
    };
    const handleMeetupUpdate = () => {
      fetchMeetups();
      refreshConversationsFromBackend();
    };
    // Authentication and room joining are asynchronous. Fetch once the server
    // confirms the room join so a first load cannot race ahead of Socket auth.
    const handleJoinedRoom = ({ conversationId }) => {
      const roomId = String(conversationId);
      if (roomId === String(activeId) && !joinedRoomRefreshRef.current.has(roomId)) {
        joinedRoomRefreshRef.current.add(roomId);
        setReloadMessagesKey((key) => key + 1);
      }
    };

    // เมื่อคู่สนทนาเปิดอ่านข้อความในห้องนี้แล้ว
    const handleMessagesRead = ({ conversationId, readerId }) => {
      if (String(conversationId) === String(activeId) && String(readerId) !== String(user?.id)) {
        setLocalMessages((prev) => {
          const cId = String(conversationId);
          const currentList = prev[cId] || [];
          return {
            ...prev,
            [cId]: currentList.map((m) => (m.from === "me" ? { ...m, isRead: true } : m)),
          };
        });
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("new_message", handleNewMessage);
    socket.on("user_typing", handleUserTyping);
    socket.on("new_notification", handleNewNotification);
    socket.on("meetup_updated", handleMeetupUpdate);
    socket.on("meetup_status_update", handleMeetupUpdate);
    socket.on("joined_room", handleJoinedRoom);
    socket.on("messages_read", handleMessagesRead);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("new_message", handleNewMessage);
      socket.off("user_typing", handleUserTyping);
      socket.off("new_notification", handleNewNotification);
      socket.off("meetup_updated", handleMeetupUpdate);
      socket.off("meetup_status_update", handleMeetupUpdate);
      socket.off("joined_room", handleJoinedRoom);
      socket.off("messages_read", handleMessagesRead);
    };
  }, [activeId, user]);

  // ─── 3. Fetch Messages when activeId changes ───
  // ── สำคัญ: ยึดข้อมูลจาก backend (database) เป็นความจริงเสมอ ──
  useEffect(() => {
    if (!activeId) return;
    setMessagePage(1);
    setMessageTotal(0);
    setOlderMessagesError("");
    joinConversation(activeId);
    setIsOtherTyping(false);

    async function loadMessages() {
      setMessagesLoadError("");
      try {
        if (activeId && user?.id) {
          markConversationAsRead(activeId, user.id);
        }

        const res = await api.getMessages(activeId);
        const formatted = (res?.messages || []).map((m) => mapBackendMessage(m, user?.id));
        setMessagePage(1);
        setMessageTotal(Number(res?.total) || formatted.length);

        // เขียนทับข้อความของห้องนี้ด้วยข้อมูลจริงจากฐานข้อมูลเสมอ (รวมถึงกรณีเหลือ 0 ข้อความ)
        setLocalMessages((prev) => {
          const liveMessages = prev[activeId] || [];
          const knownIds = new Set(formatted.map((m) => String(m.id)));
          return {
            ...prev,
            [activeId]: [...formatted, ...liveMessages.filter((m) => !knownIds.has(String(m.id)))],
          };
        });

        // อัปเดตสถานะ unread ในรายการห้องแชทของหน้าจอ
        setConversations((prev) =>
          prev.map((c) => (String(c.id) === String(activeId) ? { ...c, unread: false, unreadCount: 0 } : c))
        );

        // รีเฟรชยอดข้อความที่ยังไม่อ่านใน useChatStore เพื่อให้ badge ลดลงทันที
        useChatStore.getState().fetchUnreadCount();

        // ทำเครื่องหมายแจ้งเตือนของห้องนี้ใน NotificationStore ว่าอ่านแล้วด้วย
        useNotificationStore.setState((state) => ({
          notifications: state.notifications.map((n) =>
            (n.type === "message" || n.type === "chat_message") &&
            (String(n.reference_id) === String(activeId) || n.link === "/chat")
              ? { ...n, read: true }
              : n
          ),
        }));

        setTimeout(scrollToBottom, 100);
      } catch (err) {
        console.warn("Failed to load messages from backend:", err);
        setMessagesLoadError(err?.message || "โหลดข้อความไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    }

    loadMessages();

    return () => {
      leaveConversation(activeId);
    };
  }, [activeId, user?.id, reloadMessagesKey]);

  const active = conversations.find((c) => String(c.id) === String(activeId));
  const activeMessages = active ? (localMessages[active.id] ?? active.messages ?? []) : [];

  const loadOlderMessages = async () => {
    if (!activeId || loadingOlderMessages || activeMessages.length >= messageTotal) return;
    const requestedConversationId = activeId;
    const nextPage = messagePage + 1;
    const scrollContainer = messageListRef.current;
    const previousHeight = scrollContainer?.scrollHeight || 0;
    setLoadingOlderMessages(true);
    setOlderMessagesError("");
    try {
      const res = await api.getMessages(requestedConversationId, { page: nextPage });
      if (String(requestedConversationId) !== String(activeId)) return;
      const olderMessages = (res?.messages || []).map((m) => mapBackendMessage(m, user?.id));
      setLocalMessages((prev) => {
        const current = prev[requestedConversationId] || [];
        const currentIds = new Set(current.map((m) => String(m.id)));
        const uniqueOlder = olderMessages.filter((m) => !currentIds.has(String(m.id)));
        return { ...prev, [requestedConversationId]: [...uniqueOlder, ...current] };
      });
      setMessagePage(nextPage);
      setMessageTotal(Math.max(Number(res?.total) || 0, activeMessages.length + olderMessages.length));
      window.requestAnimationFrame(() => {
        if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight - previousHeight;
      });
    } catch (err) {
      setOlderMessagesError(err?.message || "โหลดข้อความเก่าไม่สำเร็จ");
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Handle Typing indicator
  const handleInputChange = (e) => {
    const val = e.target.value;
    setDraft(val);

    if (activeId) {
      const senderInfo = { id: user?.id, name: user?.username || user?.name || user?.full_name || "ฉัน" };
      sendTypingStatus(activeId, senderInfo, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingStatus(activeId, senderInfo, false);
      }, 1500);
    }
  };

  // Send message helper
  const sendMessage = async (text, message_type = "TEXT", image = null) => {
    if (!active) return;

    const sender = {
      id: user?.id || "me",
      name: user?.username || user?.name || user?.full_name || "ฉัน",
    };

    const tempId = `msg-${Date.now()}`;
    const formattedMsg = {
      id: tempId,
      from: "me",
      senderName: sender.name,
      text,
      type: message_type,
      image,
      isRead: false,
      time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };

    // 1. Optimistic UI update — แสดงบับเบิลของตัวเองทันที
    setLocalMessages((prev) => ({
      ...prev,
      [active.id]: [...(prev[active.id] || []), formattedMsg],
    }));

    setConversations((prev) =>
      prev.map((c) =>
        String(c.id) === String(active.id)
          ? { ...c, lastMessage: text || "ส่งรูปภาพ" }
          : c
      )
    );

    // บันทึกผ่าน Socket.IO และรอ ack จากฐานข้อมูลก่อนถือว่าส่งสำเร็จ
    try {
      const savedMessage = await sendRealtimeMessage({
        conversationId: active.id,
        text,
        message_type,
        imageUrl: image,
        sender,
      });
      setLocalMessages((prev) => ({
        ...prev,
        [active.id]: (prev[active.id] || []).map((message) => message.id === tempId
          ? { ...message, id: savedMessage.id, time: savedMessage.time || message.time }
          : message),
      }));
      setMessageTotal((count) => count + 1);
    } catch (err) {
      setLocalMessages((prev) => ({
        ...prev,
        [active.id]: (prev[active.id] || []).filter((message) => message.id !== tempId),
      }));
      alert(err.message || 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่');
      refreshConversationsFromBackend();
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTypingStatus(active.id, sender, false);

    setTimeout(scrollToBottom, 60);
  };

  const handleSendText = (e) => {
    e.preventDefault();
    if (!draft.trim() || !active) return;
    sendMessage(draft.trim(), "TEXT");
    setDraft("");
  };

  // Realtime Image Upload
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !active) return;

    try {
      // บีบอัดรูปแชทก่อนอัปโหลด (สูงสุด 800×800, quality 0.78)
      const compressed = await compressImage(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.78,
      });
      const urls = await api.uploadImages([compressed]);
      if (urls && urls[0]) {
        sendMessage("ส่งรูปภาพ", "IMAGE", urls[0]);
      }
    } catch (err) {
      console.warn("Upload fallback to data url:", err);
      const reader = new FileReader();
      reader.onload = () => {
        sendMessage("ส่งรูปภาพ", "IMAGE", reader.result);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleConfirmDeleteConversation = async () => {
    if (!deleteConvTarget) return;
    setDeletingConv(true);
    const convId = deleteConvTarget;
    try {
      setConversations((prev) => prev.filter((c) => String(c.id) !== String(convId)));
      setActiveId((curr) => (String(curr) === String(convId) ? null : curr));
      await api.deleteConversation(convId);
    } catch (err) {
      console.warn("Delete conversation error:", err);
    } finally {
      setDeletingConv(false);
      setDeleteConvTarget(null);
    }
  };

  if (loadingConvs && conversations.length === 0) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm">กำลังเปิดการสนทนากับเจ้าของสินค้า...</p>
        </div>
      </div>
    );
  }

  if (!loadingConvs && conversations.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีการสนทนา"
        description="เริ่มแชทกับเจ้าของสินค้าได้โดยตรง โดยกดปุ่ม 'ทักแชท' จากหน้ารายละเอียดสินค้า"
      />
    );
  }

  return (
    <div className="grid h-[calc(100vh-9.5rem)] grid-cols-1 gap-4 md:h-[calc(100vh-6.5rem)] md:grid-cols-[300px_1fr]">
      {/* ─── Sidebar: Conversation List ───────────────────────────────────── */}
      <div className={`cm-card flex flex-col overflow-y-auto ${activeId ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-surface-border px-4 py-3 bg-surface-muted/30 flex items-center justify-between shrink-0">
          <h2 className="font-bold text-ink-900 text-sm">ข้อความทั้งหมด</h2>
          {/* Socket.IO Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isConnected
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
            title={isConnected ? "เชื่อมต่อสด Realtime ผ่าน Socket.IO" : "กำลังเชื่อมต่อ..."}
          >
            <Radio size={11} className={isConnected ? "text-emerald-600" : "text-amber-600"} />
            <span>{isConnected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ"}</span>
          </div>
        </div>

        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(String(c.id))}
            className={`flex items-center gap-3 border-b border-surface-border px-4 py-3 text-left last:border-0 transition-colors ${
              String(activeId) === String(c.id) ? "bg-brand-50/80 border-l-4 border-l-brand-500" : "hover:bg-surface-muted"
            }`}
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-surface-muted border border-surface-border">
              {c.productImage ? (
                <img src={c.productImage} alt={c.productTitle} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-full w-full p-2 text-ink-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-900 truncate">{c.name}</span>
                {c.unread && <span className="h-2 w-2 rounded-full bg-brand-500" />}
              </div>
              <p className="truncate text-xs text-ink-600 font-medium">{c.productTitle}</p>
              <p className="truncate text-[11px] text-ink-400 mt-0.5">{c.lastMessage}</p>
            </div>
          </button>
        ))}
      </div>

      {/* ─── Main Chat Area ──────────────────────────────────────────────── */}
      <div className={`cm-card flex flex-col overflow-hidden relative ${!activeId ? "hidden md:flex" : "flex"}`}>
        {active ? (
          <>
            {/* Header: Partner & Product Card Banner */}
            <div className="border-b border-surface-border bg-white px-3 sm:px-4 py-3 z-10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-2.5">
                  {/* ปุ่มย้อนกลับรายการแชทบนจอมือถือ */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(null);
                      navigate("/chat", { replace: true });
                    }}
                    className="md:hidden flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 bg-white text-ink-700 hover:bg-gray-100 transition-colors shrink-0"
                    aria-label="กลับไปหน้ารายการแชท"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-sm shrink-0">
                    {active.name.charAt(0)}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink-900 flex items-center gap-1">
                      {active.name}
                      <ShieldCheck size={14} className="text-brand-500 shrink-0" />
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-medium text-emerald-600">● เจ้าของสินค้า (พร้อมคุย)</p>
                      {isConnected && (
                        <span className="text-[10px] text-brand-600 font-semibold bg-orange-50 px-1.5 rounded border border-orange-100 hidden sm:inline">
                          ⚡ Realtime
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Info Strip & Quick Meetup Button */}
              {active.productTitle && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-muted/60 p-2.5 border border-surface-border">
                  <div
                    onClick={() => active.productId && navigate(`/products/${active.productId}`)}
                    className="flex items-center gap-3 cursor-pointer group flex-1 min-w-[200px]"
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-surface-border bg-white">
                      <img
                        src={active.productImage || "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500"}
                        alt={active.productTitle}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-ink-900 truncate group-hover:text-brand-600 transition-colors flex items-center gap-1">
                        {active.productTitle} <ChevronRight size={13} className="text-ink-400" />
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-extrabold text-brand-600">{formatCurrency(active.productPrice)}</p>
                        {(() => {
                          const statusId = Number(active.statusId);
                          const sold = isConversationEnded(active);
                          const label = sold ? "ขายแล้ว" : statusId === 2 ? "ติดจอง" : statusId === 1 ? "ว่าง" : "ไม่พร้อมนัด";
                          const color = sold ? "bg-gray-100 text-gray-600" : statusId === 2
                            ? "bg-amber-50 text-amber-700" : statusId === 1
                              ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500";
                          return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${color}`}>{label}</span>;
                        })()}
                      </div>
                    </div>
                  </div>

                  {(() => {
                    if (!active.productId) return null;
                    const isMyProduct = String(active.sellerId) === String(user?.id);

                    // ── "สิ้นสุดแล้ว" แสดงเฉพาะเมื่อสินค้าขายแล้ว หรือดีลปิดงานสำเร็จแล้วเท่านั้น ──
                    // การเคยยกเลิกนัด / ไม่มาตามนัด ไม่ถือว่าสิ้นสุด (สินค้ายังว่างก็นัดรับใหม่ได้)
                    if (isConversationEnded(active)) {
                      return (
                        <span className="flex items-center gap-1 rounded-xl bg-gray-100 border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-500 shrink-0 select-none">
                          ✓ รายการสิ้นสุดแล้ว
                        </span>
                      );
                    }

                    // ปุ่มนัดรับแสดงเมื่อสินค้ายังไม่ขาย (status !== 3) และคู่นี้ยังไม่มีดีลค้าง (canScheduleMeetup)
                    if (Number(active.statusId) === 3 || active.canScheduleMeetup === false) {
                      return null;
                    }

                    // แสดงเฉพาะผู้ซื้อเท่านั้น (ถ้าเป็นสินค้าของตัวเองที่เป็นคนขาย จะไม่มีปุ่มนัดรับ)
                    if (isMyProduct) {
                      return null;
                    }

                    return (
                      <button
                        onClick={() => navigate(`/products/${active.productId}/meetup`)}
                        className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:from-brand-600 hover:to-orange-600 transition-all shrink-0"
                      >
                        <CalendarClock size={15} />
                        ตกลงเวลาแล้ว → กดนัดรับสินค้า
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Chat Message Stream */}
            {/* Banner แจ้งเตือนเฉพาะเมื่อ "ขายสำเร็จ" — แสดงจำนวนวันที่เหลือก่อนลบแชทอัตโนมัติ (7 วัน)
                กรณียกเลิกนัด/ไม่มาตามนัด แชทจะถูกลบทันทีจากฝั่ง backend จึงไม่มี banner นับถอยหลัง */}
            {active && isConversationEnded(active) && (() => {
              const closedAt = active.dealClosedAt ? new Date(active.dealClosedAt) : null;
              const daysLeft = closedAt
                ? Math.max(0, 7 - Math.floor((Date.now() - closedAt.getTime()) / (1000 * 60 * 60 * 24)))
                : 7;
              return (
                <div className="mx-4 mt-3 mb-0 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700">
                  <span className="text-base leading-none mt-0.5">💬</span>
                  <span>
                    การขายนี้ <strong>เสร็จสิ้นแล้ว</strong> — ประวัติการสนทนาจะถูกลบอัตโนมัติ
                    {daysLeft > 0 ? ` ภายใน ${daysLeft} วัน` : ' เร็วๆ นี้'}
                  </span>
                </div>
              );
            })()}
            <div ref={messageListRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 bg-surface-muted/20">
              {activeMessages.length < messageTotal && (
                <div className="flex flex-col items-center gap-1 pb-2">
                  <button
                    type="button"
                    disabled={loadingOlderMessages}
                    onClick={loadOlderMessages}
                    className="rounded-full border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 shadow-sm hover:border-brand-300 hover:text-brand-600 disabled:opacity-60"
                  >
                    {loadingOlderMessages ? "กำลังโหลดข้อความเก่า..." : "โหลดข้อความก่อนหน้า"}
                  </button>
                  {olderMessagesError && <span className="text-[11px] text-red-500">{olderMessagesError}</span>}
                </div>
              )}
              {messagesLoadError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-red-600">
                  <p>{messagesLoadError}</p>
                  <button
                    type="button"
                    onClick={() => setReloadMessagesKey((key) => key + 1)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-red-50"
                  >
                    ลองโหลดข้อความอีกครั้ง
                  </button>
                </div>
              ) : activeMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-6 text-ink-400 space-y-2">
                  <div className="p-3 bg-brand-50 rounded-full text-brand-500">
                    <MessageCircle size={28} />
                  </div>
                  <p className="font-semibold text-ink-700 text-sm">เริ่มต้นการสนทนากับ {active.name}</p>
                  <p className="text-xs max-w-xs text-ink-400">
                    ทักทาย สอบถามสภาพสินค้า ต่อรองราคา หรือนัดหมายจุดรับสินค้าใน มทร.อีสาน ได้เลย
                  </p>
                </div>
              ) : (
                activeMessages.map((m) => (
                  <div key={m.id} className={`flex flex-col gap-1 ${m.from === "me" ? "items-end" : "items-start"}`}>
                    {/* แสดง username ของผู้ส่งเหนือบับเบิลของอีกฝ่าย ตามข้อมูลจริงในฐานข้อมูล */}
                    {m.from === "them" && m.senderName && (
                      <span className="px-1 text-[10px] font-semibold text-ink-400">{m.senderName}</span>
                    )}

                    {/* ── การ์ดนัดรับสินค้า (Appointment Card ตามรูปตัวอย่าง) ── */}
                    {isMeetupMessage(m) ? (() => {
                      const meetupData = extractMeetupData(m, active, meetups, user?.id);
                      return (
                        <div className="w-full flex flex-col items-center sm:items-start my-2">
                          <MeetupSummaryBubble
                            data={meetupData}
                            fromMe={m.from === "me"}
                            currentUserId={user?.id}
                            conversationId={activeId}
                            onActionDone={() => {
                              fetchMeetups();
                              setReloadMessagesKey((k) => k + 1);
                            }}
                          />
                          <div className={`mt-1 flex text-[10px] ${m.from === "me" ? "justify-end" : "justify-start"} text-ink-400 w-full max-w-[340px] sm:max-w-[380px]`}>
                            <span>{m.time}</span>
                          </div>
                        </div>
                      );
                    })() : (
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm leading-relaxed ${
                        m.from === "me"
                          ? "bg-brand-500 text-white"
                          : "bg-white text-ink-900 border border-surface-border"
                      }`}
                    >
                      {/* Image Display with Lightbox */}
                      {m.image && (
                        <div
                          onClick={() => setLightboxImage(m.image)}
                          className="mb-2 overflow-hidden rounded-xl cursor-pointer group relative"
                          title="คลิกเพื่อดูรูปภาพขนาดใหญ่"
                        >
                          <img
                            src={m.image}
                            alt="รูปภาพ"
                            className="max-h-60 w-full object-cover rounded-lg group-hover:scale-102 transition-transform"
                          />
                          <div className="absolute bottom-2 right-2 bg-black/50 text-white p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                            <Maximize2 size={13} />
                          </div>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <div
                        className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${
                          m.from === "me" ? "text-white/80" : "text-ink-400"
                        }`}
                      >
                        {m.from === "me" && m.isRead && (
                          <span className="font-semibold text-emerald-200">
                            อ่านแล้ว
                          </span>
                        )}
                        <span>{m.time}</span>
                      </div>
                    </div>
                    )}
                  </div>
                ))
              )}

              {/* Typing Indicator */}
              {isOtherTyping && (
                <div className="flex items-center gap-2 text-xs text-brand-600 animate-pulse py-1 px-2 bg-orange-50/70 rounded-full w-fit border border-orange-100">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  <span>{active.name} กำลังพิมพ์...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Bar */}
            <form onSubmit={handleSendText} className="flex items-center gap-2 border-t border-surface-border bg-white p-3 z-10">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-surface-muted hover:text-brand-500 transition-colors"
                title="ส่งรูปภาพ"
              >
                <ImageIcon size={19} />
              </button>

              <input
                value={draft}
                onChange={handleInputChange}
                placeholder="พิมพ์ข้อความคุยกับเจ้าของสินค้า..."
                className="flex-1 rounded-full border border-surface-border px-4 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-all shadow-sm ${
                  draft.trim() ? "bg-brand-500 hover:bg-brand-600" : "bg-gray-300 cursor-not-allowed"
                }`}
                aria-label="ส่งข้อความ"
              >
                <Send size={17} />
              </button>
            </form>
          </>
        ) : (
          <EmptyState title="เลือกการสนทนา" icon={MessageCircle} />
        )}
      </div>

      {/* ─── Image Lightbox Modal ────────────────────────────────────────── */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black transition-colors"
            >
              <X size={20} />
            </button>
            <img src={lightboxImage} alt="รูปภาพขนาดเต็ม" className="max-h-[85vh] w-auto rounded-xl object-contain shadow-2xl" />
          </div>
        </div>
      )}

      {/* ─── Confirm Delete Conversation Dialog ─────────────────────────── */}
      <ConfirmDialog
        open={!!deleteConvTarget}
        onClose={() => setDeleteConvTarget(null)}
        onConfirm={handleConfirmDeleteConversation}
        title="ยืนยันการลบห้องแชทนี้?"
        description="ประวัติการสนทนานี้จะถูกลบออกจากรายการของคุณอย่างถาวร"
        confirmLabel="ลบห้องแชท"
        cancelLabel="ยกเลิก"
        variant="danger"
        loading={deletingConv}
      />
    </div>
  );
}