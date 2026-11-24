import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FlatIcon } from "@/components/common/FlatIcon";
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
import { useChatStore } from "@/store/chatStore";
import { useNotificationStore } from "@/store/notificationStore";
import { compressImage } from "@/utils/compressImage";
import {
  MeetupAppointmentCard,
  isMeetupMessage,
  extractMeetupData,
} from "@/components/chat/MeetupAppointmentCard";

const FALLBACK_IMG = "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=500";

/* ───────────────────────── helpers ───────────────────────── */

// ห้องจริงต้องมี id เป็นตัวเลขจากตาราง conversations เท่านั้น
const isRealConversationId = (id) => /^\d+$/.test(String(id));

// ⚠️ ถ้า token ของโปรเจกต์คุณเก็บไว้ที่อื่น ให้แก้ฟังก์ชันนี้ที่เดียว
function getAuthToken() {
  const s = useAuthStore.getState?.() || {};
  return (
    s.token ||
    s.accessToken ||
    s.access_token ||
    (typeof localStorage !== "undefined" &&
      (localStorage.getItem("accessToken") || localStorage.getItem("token"))) ||
    null
  );
}

function previewText(text, type) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (raw.startsWith("{") && raw.includes('"kind":"MEETUP"')) {
    try {
      const p = JSON.parse(raw);
      const k = p.event || p.status;
      if (k === "confirmed") return "นัดรับได้รับการยืนยันแล้ว";
      if (k === "completed") return "นัดรับสินค้าเสร็จสิ้นแล้ว";
      if (k === "rejected") return "ปฏิเสธคำขอนัดรับ";
      if (k === "cancelled") return "นัดหมายถูกยกเลิกแล้ว";
      return "คำขอนัดรับสินค้า";
    } catch {
      /* fall through */
    }
  }
  if (type === "MEETUP_SUMMARY" || /^\[(MEETUP_SUMMARY|SYSTEM)\]$/.test(raw)) return "นัดรับสินค้า";
  if (raw === "[IMAGE]") return "ส่งรูปภาพ";
  return raw;
}

const resolvePartnerName = (p) => p?.username || p?.displayName || p?.full_name || "ผู้ใช้";

function isConversationEnded(room) {
  return (
    Number(room?.statusId) === 3 ||
    Number(room?.transactionStatusId) === 3 ||
    room?.isDealClosed === true
  );
}

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";

function dayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "วันนี้";
  if (d.toDateString() === yesterday.toDateString()) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

const byTime = (a, b) =>
  (a.created_at ? new Date(a.created_at).getTime() : 0) -
  (b.created_at ? new Date(b.created_at).getTime() : 0);

function mapBackendMessage(m, currentUserId) {
  return {
    id: m.id,
    from: String(m.sender_id) === String(currentUserId) ? "me" : "them",
    senderName: m.users?.username || m.users?.full_name || null,
    text: m.content || "",
    type: m.message_type || "TEXT",
    image: m.message_attachments?.[0]?.file_url || null,
    isRead: !!m.is_read,
    time: fmtTime(m.created_at),
    created_at: m.created_at || null,
  };
}

function mapBackendConversation(c) {
  const partner = c.partner;
  const product = c.product;
  return {
    id: String(c.id),
    name: resolvePartnerName(partner),
    partnerId: partner?.id,
    partnerImage: partner?.profileImage || null,
    productId: product?.id,
    productTitle: product?.title || "สินค้า",
    productPrice: product?.price || 0,
    productImage: product?.coverImage || FALLBACK_IMG,
    sellerId: product?.sellerId ?? product?.seller_id,
    statusId: product?.statusId ?? product?.status_id,
    lastMessage: previewText(c.lastMessage?.content) || "เริ่มการสนทนา",
    lastMessageAt: c.lastMessage?.createdAt || c.updatedAt || c.createdAt || null,
    createdAt: c.createdAt || null,
    unread: (c.unreadCount || 0) > 0,
    transactionStatusId: c.transactionStatusId ?? null,
    isDealClosed: c.isDealClosed ?? false,
    canScheduleMeetup: c.canScheduleMeetup,
  };
}

const sortByActivity = (list) =>
  [...list].sort(
    (a, b) => (Date.parse(b.lastMessageAt || 0) || 0) - (Date.parse(a.lastMessageAt || 0) || 0)
  );

function Avatar({ name, src, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover ring-2 ring-white"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </span>
  );
}

/* ───────────────────────── page ───────────────────────── */

export function ChatPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);

  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [messagesLoadError, setMessagesLoadError] = useState("");
  const [reloadMessagesKey, setReloadMessagesKey] = useState(0);
  const [messageTotal, setMessageTotal] = useState(0);
  const [messagePage, setMessagePage] = useState(1);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState("");
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [localMessages, setLocalMessages] = useState({});
  const [meetups, setMeetups] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messageListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const joinedRoomRefreshRef = useRef(new Set());
  const refreshingRef = useRef(false);
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  /* ── meetups ── */
  const fetchMeetups = useCallback(async () => {
    try {
      const res = await api.getMyMeetups();
      if (res?.meetups) setMeetups(res.meetups);
    } catch (e) {
      console.warn("fetchMeetups error:", e);
    }
  }, []);

  useEffect(() => {
    if (user?.id) fetchMeetups();
  }, [user?.id, fetchMeetups]);

  /* ── รีเฟรชรายการห้อง (ยึดฐานข้อมูลเป็นความจริง ไม่มีห้องปลอมค้างในหน้าจอ) ── */
  const refreshConversations = useCallback(async () => {
    if (refreshingRef.current) return null;
    refreshingRef.current = true;
    try {
      const res = await api.getConversations();
      const list = sortByActivity((res?.conversations || []).map(mapBackendConversation));
      setConversations(list);

      setActiveId((curr) => {
        if (!curr) return curr;
        return list.some((c) => String(c.id) === String(curr)) ? curr : null;
      });
      setLocalMessages((prev) => {
        const valid = new Set(list.map((c) => c.id));
        return Object.fromEntries(Object.entries(prev).filter(([id]) => valid.has(id)));
      });
      setLoadError("");
      return list;
    } catch (err) {
      console.warn("refreshConversations error:", err?.message || err);
      setLoadError(err?.message || "โหลดรายการแชทไม่สำเร็จ");
      return null;
    } finally {
      refreshingRef.current = false;
    }
  }, []);
  const refreshRef = useRef(refreshConversations);
  refreshRef.current = refreshConversations;

  useEffect(() => {
    if (!user?.id) return undefined;
    const tick = () => document.visibilityState === "visible" && refreshRef.current();
    const timer = window.setInterval(tick, 30000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [user?.id]);

  /* ── 1. โหลดห้อง + จัดการ ?conversationId= / ?productId= ── */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoadingConvs(true);
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const queryConvId = searchParams.get("conversationId");
      const queryProductId = searchParams.get("productId");
      const queryPartnerId = searchParams.get("partnerId");

      let targetConvId = queryConvId ? String(queryConvId) : null;

      // กด "ทักแชท" จากหน้าสินค้า → ขอห้องจริงจาก backend เท่านั้น (ไม่สร้างห้องปลอม)
      if (queryProductId && !queryConvId) {
        try {
          const r = await api.createOrGetConversation({
            productId: queryProductId,
            partnerId: queryPartnerId,
          });
          if (r?.conversationId) targetConvId = String(r.conversationId);
        } catch (e) {
          if (cancelled) return;
          const msg = e?.message || "เปิดห้องแชทไม่สำเร็จ";
          alert(msg.includes("แชทกับตัวเอง") ? "นี่คือสินค้าของคุณเอง ไม่สามารถแชทกับตัวเองได้" : msg);
          if (msg.includes("แชทกับตัวเอง")) {
            navigate(-1);
            return;
          }
        }
      }

      const list = await refreshRef.current();
      if (cancelled) return;

      if (targetConvId) {
        setActiveId(String(targetConvId));
        // ล้าง query เพื่อไม่ให้สร้างห้องซ้ำเมื่อรีเฟรชหน้า
        if (queryProductId && !queryConvId) {
          navigate(`/chat?conversationId=${targetConvId}`, { replace: true });
        }
      } else {
        setActiveId((curr) => {
          if (curr && list?.some((c) => String(c.id) === String(curr))) return curr;
          return isMobile ? null : list?.[0]?.id || null;
        });
      }
      setLoadingConvs(false);
    }

    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.id]);

  /* ── 2. Socket ── */
  const authenticateSocket = useCallback(
    () =>
      new Promise((resolve, reject) => {
        const socket = getSocket();
        const token = getAuthToken();
        if (!token) return reject(new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"));

        const cleanup = () => {
          clearTimeout(timer);
          socket.off("authenticated", onOk);
          socket.off("authentication_error", onBad);
        };
        const onOk = () => {
          cleanup();
          resolve();
        };
        const onBad = (e) => {
          cleanup();
          reject(new Error(e?.error || "กรุณาเข้าสู่ระบบใหม่"));
        };
        // ถ้า backend ยังไม่ส่ง event "authenticated" ให้ไปต่อ แล้วให้ ack ของการส่งเป็นตัวตัดสิน
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 3000);

        socket.on("authenticated", onOk);
        socket.on("authentication_error", onBad);
        socket.emit("authenticate", { token });
      }),
    []
  );

  useEffect(() => {
    const socket = getSocket();

    const handleConnect = () => {
      setIsConnected(true);
      joinedRoomRefreshRef.current.clear();
      authenticateSocket()
        .catch((e) => console.warn("socket auth:", e.message))
        .finally(() => {
          if (activeIdRef.current && isRealConversationId(activeIdRef.current)) {
            joinConversation(activeIdRef.current);
          }
        });
    };
    const handleDisconnect = () => setIsConnected(false);

    const handleNewMessage = (msg) => {
      const convIdRaw = msg.conversationId ?? msg.conversation_id;
      const senderIdRaw = msg.sender?.id ?? msg.sender_id;
      if (!convIdRaw) return;

      // ข้อความของตัวเองแสดงแบบ optimistic ไปแล้ว → ไม่ต้องเพิ่มซ้ำ (ยกเว้นการ์ดนัดรับจากระบบ)
      const isServerCard = msg.isSystem === true || (msg.message_type || msg.type) === "MEETUP_SUMMARY";
      if (!isServerCard && String(senderIdRaw) === String(user?.id)) return;

      const cId = String(convIdRaw);
      const isActive = String(activeIdRef.current) === cId;
      if (isActive && user?.id) markConversationAsRead(cId, user.id);

      setLocalMessages((prev) => {
        const list = prev[cId] || [];
        if (list.some((m) => String(m.id) === String(msg.id))) return prev;
        return {
          ...prev,
          [cId]: [
            ...list,
            {
              id: msg.id,
              from: String(senderIdRaw) === String(user?.id) ? "me" : "them",
              senderName: msg.sender?.name || null,
              text: msg.text || msg.content,
              type: msg.message_type || msg.type || "TEXT",
              image: msg.imageUrl || null,
              time: msg.time || fmtTime(new Date().toISOString()),
              created_at: msg.createdAt || msg.created_at || new Date().toISOString(),
            },
          ],
        };
      });
      if (isActive) setMessageTotal((n) => n + 1);

      let known = true;
      setConversations((prev) => {
        known = prev.some((c) => String(c.id) === cId);
        if (!known) return prev;
        return sortByActivity(
          prev.map((c) =>
            String(c.id) === cId
              ? {
                  ...c,
                  lastMessage:
                    previewText(msg.text || msg.content, msg.message_type || msg.type) || "ส่งรูปภาพ",
                  lastMessageAt: new Date().toISOString(),
                  unread: !isActive,
                }
              : c
          )
        );
      });
      // ห้องใหม่ที่ยังไม่อยู่ในรายการ (มีคนทักมาครั้งแรก)
      setTimeout(() => !known && refreshRef.current(), 0);
      setTimeout(scrollToBottom, 50);
    };

    const handleUserTyping = ({ conversationId, isTyping }) => {
      if (String(conversationId) === String(activeIdRef.current)) setIsOtherTyping(!!isTyping);
    };
    const handleNotification = (n) => {
      if (
        ["message", "chat_message", "meetup_scheduled", "meetup_cancelled", "deal_completed", "transaction_update"].includes(
          String(n?.type || "")
        )
      ) {
        refreshRef.current();
      }
    };
    const handleMeetupUpdate = () => {
      fetchMeetups();
      refreshRef.current();
      setReloadMessagesKey((k) => k + 1);
    };
    const handleJoinedRoom = ({ conversationId }) => {
      const roomId = String(conversationId);
      if (roomId === String(activeIdRef.current) && !joinedRoomRefreshRef.current.has(roomId)) {
        joinedRoomRefreshRef.current.add(roomId);
        setReloadMessagesKey((k) => k + 1);
      }
    };
    const handleMessagesRead = ({ conversationId, readerId }) => {
      if (String(readerId) === String(user?.id)) return;
      const cId = String(conversationId);
      setLocalMessages((prev) => ({
        ...prev,
        [cId]: (prev[cId] || []).map((m) => (m.from === "me" ? { ...m, isRead: true } : m)),
      }));
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("new_message", handleNewMessage);
    socket.on("user_typing", handleUserTyping);
    socket.on("new_notification", handleNotification);
    socket.on("meetup_updated", handleMeetupUpdate);
    socket.on("meetup_status_update", handleMeetupUpdate);
    socket.on("joined_room", handleJoinedRoom);
    socket.on("messages_read", handleMessagesRead);

    if (socket.connected) handleConnect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("new_message", handleNewMessage);
      socket.off("user_typing", handleUserTyping);
      socket.off("new_notification", handleNotification);
      socket.off("meetup_updated", handleMeetupUpdate);
      socket.off("meetup_status_update", handleMeetupUpdate);
      socket.off("joined_room", handleJoinedRoom);
      socket.off("messages_read", handleMessagesRead);
    };
  }, [user?.id, authenticateSocket, fetchMeetups]);

  /* ── 3. โหลดข้อความเมื่อเปลี่ยนห้อง ── */
  useEffect(() => {
    if (!activeId || !isRealConversationId(activeId)) return undefined;
    setMessagePage(1);
    setMessageTotal(0);
    setOlderError("");
    setSendError("");
    setIsOtherTyping(false);
    joinConversation(activeId);

    let stale = false;
    (async () => {
      setMessagesLoadError("");
      try {
        const res = await api.getMessages(activeId);
        if (stale) return;
        const formatted = (res?.messages || []).map((m) => mapBackendMessage(m, user?.id));
        setMessageTotal(Number(res?.total) || formatted.length);

        setLocalMessages((prev) => {
          const known = new Set(formatted.map((m) => String(m.id)));
          // เก็บเฉพาะข้อความ optimistic (id ชั่วคราว) ที่ยังไม่ถูกบันทึก
          const pending = (prev[activeId] || []).filter(
            (m) => String(m.id).startsWith("msg-") && !known.has(String(m.id))
          );
          return { ...prev, [activeId]: [...formatted, ...pending].sort(byTime) };
        });

        setConversations((prev) =>
          prev.map((c) => (String(c.id) === String(activeId) ? { ...c, unread: false } : c))
        );
        markConversationAsRead(activeId, user?.id);
        useChatStore.getState().fetchUnreadCount();
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
        if (stale) return;
        console.warn("load messages failed:", err);
        setMessagesLoadError(err?.message || "โหลดข้อความไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
    })();

    return () => {
      stale = true;
      leaveConversation(activeId);
    };
  }, [activeId, user?.id, reloadMessagesKey]);

  const active = conversations.find((c) => String(c.id) === String(activeId));
  const activeMessages = active ? localMessages[active.id] ?? [] : [];

  /* ── การ์ดนัดรับจำลอง: แสดงเฉพาะนัดที่เกิดหลังห้องนี้ถูกสร้าง
        (กันนัดเก่าของห้องที่ถูกลบไปแล้วโผล่กลับมาในห้องใหม่) ── */
  const displayMessages = (() => {
    if (!active || !user?.id) return activeMessages;
    const referenced = new Set();
    activeMessages.forEach((m) => {
      try {
        const p = JSON.parse(m.text || "");
        if (p?.meetupId) referenced.add(String(p.meetupId));
      } catch {
        /* not json */
      }
    });
    const roomStart = active.createdAt ? Date.parse(active.createdAt) - 60_000 : null;

    const synthetic = (meetups || [])
      .filter((mt) => {
        const pid = mt.productId ?? mt.product_id;
        const st = String(mt.status || "").toLowerCase();
        const mine = [mt.buyerId, mt.sellerId].some((x) => String(x) === String(user.id));
        const withPartner =
          active.partnerId == null ||
          [mt.buyerId, mt.sellerId].some((x) => String(x) === String(active.partnerId));
        const createdAt = mt.created_at || mt.createdAt;
        const afterRoom = roomStart == null || !createdAt || Date.parse(createdAt) >= roomStart;
        return (
          mine &&
          withPartner &&
          afterRoom &&
          String(pid) === String(active.productId) &&
          ["pending", "confirmed", "completed", "cancelled", "rejected", "no_show"].includes(st) &&
          !referenced.has(String(mt.id))
        );
      })
      .map((mt) => {
        const st = String(mt.status || "").toLowerCase();
        const event =
          st === "completed" ? "completed" : st === "confirmed" ? "confirmed" : st === "cancelled" || st === "rejected" ? "cancelled" : "requested";
        const eventTime =
          st === "cancelled" || st === "rejected"
            ? mt.cancelled_at || mt.cancelledAt || mt.created_at
            : st === "completed"
            ? mt.completed_at || mt.completedAt || mt.created_at
            : mt.confirmed_at || mt.confirmedAt || mt.created_at;
        return {
          id: `meetup-${mt.id}`,
          from: String(mt.createdBy ?? mt.created_by) === String(user.id) ? "me" : "them",
          senderName: null,
          text: JSON.stringify({
            kind: "MEETUP",
            meetupId: mt.id,
            event,
            status: mt.status || st,
            productId: mt.productId ?? mt.product_id,
            productTitle: mt.productTitle || mt.product_title || active.productTitle,
            price: mt.price ?? mt.agreedPrice ?? mt.productPrice ?? active.productPrice,
            date: mt.date || mt.appointment_date,
            time: mt.time || mt.appointment_time,
            locationName: mt.locationName || mt.location?.name,
          }),
          type: "MEETUP_SUMMARY",
          image: null,
          time: fmtTime(eventTime || mt.created_at),
          created_at: eventTime || mt.created_at || new Date().toISOString(),
        };
      });

    return [...activeMessages, ...synthetic].sort(byTime);
  })();

  /* ── โหลดข้อความเก่า ── */
  const loadOlderMessages = async () => {
    if (!activeId || loadingOlder || activeMessages.length >= messageTotal) return;
    const roomId = activeId;
    const nextPage = messagePage + 1;
    const box = messageListRef.current;
    const prevHeight = box?.scrollHeight || 0;
    setLoadingOlder(true);
    setOlderError("");
    try {
      const res = await api.getMessages(roomId, { page: nextPage });
      if (String(roomId) !== String(activeIdRef.current)) return;
      const older = (res?.messages || []).map((m) => mapBackendMessage(m, user?.id));
      setLocalMessages((prev) => {
        const cur = prev[roomId] || [];
        const ids = new Set(cur.map((m) => String(m.id)));
        return { ...prev, [roomId]: [...older.filter((m) => !ids.has(String(m.id))), ...cur].sort(byTime) };
      });
      setMessagePage(nextPage);
      setMessageTotal(Math.max(Number(res?.total) || 0, activeMessages.length + older.length));
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight;
      });
    } catch (err) {
      setOlderError(err?.message || "โหลดข้อความเก่าไม่สำเร็จ");
    } finally {
      setLoadingOlder(false);
    }
  };

  /* ── typing ── */
  const handleInputChange = (e) => {
    setDraft(e.target.value);
    if (!activeId || !isRealConversationId(activeId)) return;
    const info = { id: user?.id, name: user?.username || user?.full_name || "ฉัน" };
    sendTypingStatus(activeId, info, true);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTypingStatus(activeId, info, false), 1500);
  };

  /* ── ส่งข้อความ ── */
  const sendMessage = async (text, message_type = "TEXT", image = null) => {
    if (!active) return false;
    if (!isRealConversationId(active.id)) {
      setSendError("ห้องแชทนี้ยังไม่พร้อมใช้งาน กรุณารีเฟรชหน้าแล้วลองใหม่");
      return false;
    }
    setSendError("");

    const roomId = String(active.id);
    const sender = { id: user?.id, name: user?.username || user?.full_name || "ฉัน" };
    const nowIso = new Date().toISOString();
    const tempId = `msg-${Date.now()}`;

    setLocalMessages((prev) => ({
      ...prev,
      [roomId]: [
        ...(prev[roomId] || []),
        { id: tempId, from: "me", senderName: sender.name, text, type: message_type, image, isRead: false, pending: true, time: fmtTime(nowIso), created_at: nowIso },
      ],
    }));
    setTimeout(scrollToBottom, 40);

    try {
      await authenticateSocket();
      const saved = await sendRealtimeMessage({
        conversationId: roomId,
        text,
        message_type,
        imageUrl: image,
        sender,
      });
      setLocalMessages((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] || []).map((m) =>
          m.id === tempId
            ? { ...m, id: saved.id, pending: false, time: saved.time || m.time, created_at: saved.createdAt || saved.created_at || m.created_at }
            : m
        ),
      }));
      setMessageTotal((n) => n + 1);
      setConversations((prev) =>
        sortByActivity(
          prev.map((c) =>
            String(c.id) === roomId
              ? { ...c, lastMessage: previewText(text, message_type) || "ส่งรูปภาพ", lastMessageAt: nowIso }
              : c
          )
        )
      );
      return true;
    } catch (err) {
      setLocalMessages((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] || []).filter((m) => m.id !== tempId),
      }));
      setSendError(err?.message || "ส่งข้อความไม่สำเร็จ กรุณาลองใหม่");
      return false;
    } finally {
      clearTimeout(typingTimeoutRef.current);
      sendTypingStatus(roomId, sender, false);
    }
  };

  const handleSendText = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !active) return;
    setDraft("");
    const ok = await sendMessage(text, "TEXT");
    if (!ok) setDraft(text); // ส่งไม่สำเร็จ → คืนข้อความให้แก้/ส่งใหม่ได้
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !active) return;
    try {
      const compressed = await compressImage(file, { maxWidth: 800, maxHeight: 800, quality: 0.78 });
      const urls = await api.uploadImages([compressed]);
      if (urls?.[0]) await sendMessage("ส่งรูปภาพ", "IMAGE", urls[0]);
      else setSendError("อัปโหลดรูปภาพไม่สำเร็จ");
    } catch (err) {
      setSendError(err?.message || "อัปโหลดรูปภาพไม่สำเร็จ");
    }
  };

  /* ── ลบห้อง (เรียก API สำเร็จก่อนค่อยลบออกจากหน้าจอ) ── */
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteConversation(deleteTarget);
      setConversations((prev) => prev.filter((c) => String(c.id) !== String(deleteTarget)));
      setLocalMessages((prev) => {
        const next = { ...prev };
        delete next[String(deleteTarget)];
        return next;
      });
      if (String(activeId) === String(deleteTarget)) {
        setActiveId(null);
        navigate("/chat", { replace: true });
      }
      setDeleteTarget(null);
    } catch (err) {
      alert(err?.message || "ลบห้องแชทไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  };

  /* ───────────────────────── render ───────────────────────── */

  if (loadingConvs && conversations.length === 0) {
    return (
      <div className="flex h-[calc(100vh-9rem)] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-ink-400">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="text-sm">กำลังโหลดแชท…</p>
        </div>
      </div>
    );
  }

  if (!loadingConvs && conversations.length === 0) {
    return (
      <EmptyState
        title={loadError ? "โหลดรายการแชทไม่สำเร็จ" : "ยังไม่มีการสนทนา"}
        description={
          loadError ||
          "กดปุ่ม “ทักแชท” ในหน้ารายละเอียดสินค้า เพื่อเริ่มคุยกับเจ้าของสินค้า"
        }
      />
    );
  }

  const ended = active ? isConversationEnded(active) : false;
  const isMyProduct = active ? String(active.sellerId) === String(user?.id) : false;
  const showMeetupButton =
    active?.productId && !ended && !isMyProduct && Number(active.statusId) !== 3 && active.canScheduleMeetup !== false;

  const statusBadge = (() => {
    if (!active) return null;
    const s = Number(active.statusId);
    if (ended) return { label: "ขายแล้ว", cls: "bg-gray-100 text-gray-600" };
    if (s === 2) return { label: "ติดจอง", cls: "bg-amber-50 text-amber-700" };
    if (s === 1) return { label: "ว่าง", cls: "bg-emerald-50 text-emerald-700" };
    return { label: "ไม่พร้อมนัด", cls: "bg-gray-100 text-gray-500" };
  })();

  let lastDay = "";

  return (
    <div className="grid h-[calc(100vh-9.5rem)] grid-cols-1 gap-4 md:h-[calc(100vh-6.5rem)] md:grid-cols-[320px_1fr]">
      {/* ───────── รายการแชท ───────── */}
      <aside className={`cm-card flex-col overflow-hidden ${activeId ? "hidden md:flex" : "flex"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border bg-white px-4 py-3.5">
          <div className="flex items-center gap-2">
            <FlatIcon name="chat" size={22} />
            <h2 className="text-base font-extrabold text-ink-900">ข้อความ</h2>
          </div>
          <span
            title={isConnected ? "เชื่อมต่อแบบเรียลไทม์แล้ว" : "กำลังเชื่อมต่อ…"}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
              isConnected
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            <FlatIcon name="wifi" size={12} />
            {isConnected ? "ออนไลน์" : "กำลังเชื่อมต่อ"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const selected = String(activeId) === String(c.id);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(String(c.id))}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveId(String(c.id))}
                className={`group relative flex cursor-pointer items-center gap-3 border-b border-surface-border/60 px-4 py-3 transition-colors focus:outline-none focus-visible:bg-brand-50 ${
                  selected ? "bg-brand-50" : "hover:bg-surface-muted/70"
                }`}
              >
                {selected && <span className="absolute inset-y-0 left-0 w-1 bg-brand-500" />}
                <div className="relative shrink-0">
                  <img
                    src={c.productImage}
                    alt={c.productTitle}
                    className="h-12 w-12 rounded-xl border border-surface-border object-cover"
                  />
                  <span className="absolute -bottom-1 -right-1">
                    <Avatar name={c.name} src={c.partnerImage} size={22} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold text-ink-900">{c.name}</span>
                    <span className="shrink-0 text-[10px] text-ink-400">{fmtTime(c.lastMessageAt)}</span>
                  </div>
                  <p className="truncate text-xs font-medium text-ink-600">{c.productTitle}</p>
                  <p className={`truncate text-xs ${c.unread ? "font-bold text-ink-900" : "text-ink-400"}`}>
                    {c.lastMessage}
                  </p>
                </div>
                {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(c.id);
                  }}
                  aria-label="ลบห้องแชท"
                  title="ลบห้องแชท"
                  className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow-sm ring-1 ring-surface-border hover:bg-red-50 group-hover:flex"
                >
                  <FlatIcon name="trash" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      {/* ───────── ห้องสนทนา ───────── */}
      <section className={`cm-card relative flex-col overflow-hidden ${!activeId ? "hidden md:flex" : "flex"}`}>
        {active ? (
          <>
            {/* หัวห้อง */}
            <header className="z-10 shrink-0 space-y-3 border-b border-surface-border bg-white px-3 py-3 sm:px-4">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(null);
                    navigate("/chat", { replace: true });
                  }}
                  aria-label="กลับไปรายการแชท"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-white hover:bg-surface-muted md:hidden"
                >
                  <FlatIcon name="arrow-left" size={16} />
                </button>
                <Avatar name={active.name} src={active.partnerImage} size={40} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-sm font-extrabold text-ink-900">
                    {active.name}
                    <FlatIcon name="verified" size={15} />
                  </p>
                  <p className={`flex items-center gap-1 text-[11px] font-semibold ${isConnected ? "text-emerald-600" : "text-ink-400"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-emerald-500" : "bg-gray-300"}`} />
                    {isMyProduct ? "ผู้ซื้อ" : "เจ้าของสินค้า"}
                    {isConnected ? " · แชทสด" : " · กำลังเชื่อมต่อ"}
                  </p>
                </div>
              </div>

              {/* แถบสินค้า */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-surface-border bg-surface-muted/50 p-2.5">
                <button
                  type="button"
                  onClick={() => active.productId && navigate(`/products/${active.productId}`)}
                  className="group flex min-w-[200px] flex-1 items-center gap-3 text-left"
                >
                  <img
                    src={active.productImage}
                    alt={active.productTitle}
                    className="h-11 w-11 shrink-0 rounded-xl border border-surface-border bg-white object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-sm font-bold text-ink-900 group-hover:text-brand-600">
                      {active.productTitle}
                      <FlatIcon name="chevron-right" size={12} />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-brand-600">{formatCurrency(active.productPrice)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}>
                        {statusBadge.label}
                      </span>
                    </span>
                  </span>
                </button>

                {ended ? (
                  <span className="flex shrink-0 select-none items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 text-xs font-bold text-gray-500">
                    <FlatIcon name="double-check" size={14} />
                    รายการสิ้นสุดแล้ว
                  </span>
                ) : showMeetupButton ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/products/${active.productId}/meetup`)}
                    className="flex shrink-0 items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                  >
                    <FlatIcon name="calendar" size={16} className="brightness-0 invert" />
                    ตกลงเวลาแล้ว นัดรับสินค้า
                  </button>
                ) : null}
              </div>
            </header>

            {ended && (
              <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
                <FlatIcon name="verified" size={16} />
                <span>
                  การขายนี้ <strong>เสร็จสิ้นแล้ว</strong> ประวัติการสนทนาและการนัดรับจะถูกเก็บไว้เป็นหลักฐาน
                </span>
              </div>
            )}

            {/* รายการข้อความ */}
            <div ref={messageListRef} className="flex-1 space-y-2 overflow-y-auto bg-surface-muted/30 px-3 py-4 sm:px-5">
              {activeMessages.length < messageTotal && (
                <div className="flex flex-col items-center gap-1 pb-2">
                  <button
                    type="button"
                    disabled={loadingOlder}
                    onClick={loadOlderMessages}
                    className="rounded-full border border-surface-border bg-white px-4 py-1.5 text-xs font-semibold text-ink-600 shadow-sm hover:border-brand-300 hover:text-brand-600 disabled:opacity-60"
                  >
                    {loadingOlder ? "กำลังโหลด…" : "โหลดข้อความก่อนหน้า"}
                  </button>
                  {olderError && <span className="text-[11px] text-red-500">{olderError}</span>}
                </div>
              )}

              {messagesLoadError ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-red-600">
                  <FlatIcon name="alert" size={32} />
                  <p>{messagesLoadError}</p>
                  <button
                    type="button"
                    onClick={() => setReloadMessagesKey((k) => k + 1)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold hover:bg-red-50"
                  >
                    ลองโหลดอีกครั้ง
                  </button>
                </div>
              ) : displayMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
                    <FlatIcon name="chat" size={34} />
                  </span>
                  <p className="text-sm font-bold text-ink-800">เริ่มคุยกับ {active.name}</p>
                  <p className="max-w-xs text-xs text-ink-400">
                    ถามสภาพสินค้า ต่อรองราคา หรือตกลงจุดนัดรับในมหาวิทยาลัยได้เลย
                  </p>
                </div>
              ) : (
                displayMessages.map((m) => {
                  const label = dayLabel(m.created_at);
                  const showDay = label && label !== lastDay;
                  if (showDay) lastDay = label;
                  const mine = m.from === "me";

                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-3 flex justify-center">
                          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-400 shadow-sm ring-1 ring-surface-border">
                            {label}
                          </span>
                        </div>
                      )}

                      <div className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                        {!mine && m.senderName && (
                          <span className="px-1 text-[10px] font-semibold text-ink-400">{m.senderName}</span>
                        )}

                        {isMeetupMessage(m) ? (
                          (() => {
                            const data = extractMeetupData(m, active, meetups, user?.id);
                            return (
                              <div className="my-1.5 flex w-full flex-col items-center sm:items-start">
                                <MeetupAppointmentCard
                                  data={data}
                                  currentUserId={user?.id}
                                  onActionDone={() => {
                                    fetchMeetups();
                                    setReloadMessagesKey((k) => k + 1);
                                  }}
                                />
                                <span className="mt-1 w-full max-w-[340px] text-[10px] text-ink-400 sm:max-w-[400px]">
                                  {m.time}
                                </span>
                              </div>
                            );
                          })()
                        ) : (
                          <div
                            className={`max-w-[80%] px-3.5 py-2 text-sm leading-relaxed shadow-sm sm:max-w-[70%] ${
                              mine
                                ? "rounded-2xl rounded-br-md bg-brand-500 text-white"
                                : "rounded-2xl rounded-bl-md border border-surface-border bg-white text-ink-900"
                            } ${m.pending ? "opacity-70" : ""}`}
                          >
                            {m.image && (
                              <button
                                type="button"
                                onClick={() => setLightboxImage(m.image)}
                                className="group relative mb-2 block overflow-hidden rounded-xl"
                                title="ดูรูปขนาดใหญ่"
                              >
                                <img src={m.image} alt="รูปภาพในแชท" className="max-h-60 w-full rounded-xl object-cover" />
                                <span className="absolute bottom-2 right-2 rounded-md bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <FlatIcon name="fullscreen" size={13} className="brightness-0 invert" />
                                </span>
                              </button>
                            )}
                            {!(m.image && m.text === "ส่งรูปภาพ") && (
                              <p className="whitespace-pre-wrap break-words">{m.text}</p>
                            )}
                            <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-white/80" : "text-ink-400"}`}>
                              <span>{m.pending ? "กำลังส่ง…" : m.time}</span>
                              {mine && !m.pending && (
                                <FlatIcon
                                  name="double-check"
                                  size={12}
                                  className={m.isRead ? "" : "opacity-50"}
                                  alt={m.isRead ? "อ่านแล้ว" : "ส่งแล้ว"}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {isOtherTyping && (
                <div className="flex w-fit items-center gap-2 rounded-full border border-surface-border bg-white px-3 py-1.5 text-xs text-ink-500 shadow-sm">
                  <span className="flex gap-1">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500" style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </span>
                  {active.name} กำลังพิมพ์
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ช่องพิมพ์ */}
            <div className="z-10 shrink-0 border-t border-surface-border bg-white">
              {sendError && (
                <div role="alert" className="flex items-center justify-between gap-2 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
                  <span className="flex items-center gap-2">
                    <FlatIcon name="alert" size={14} />
                    {sendError}
                  </span>
                  <button type="button" onClick={() => setSendError("")} aria-label="ปิดข้อความแจ้งเตือน">
                    <FlatIcon name="close" size={12} />
                  </button>
                </div>
              )}
              <form onSubmit={handleSendText} className="flex items-center gap-2 p-3">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="ส่งรูปภาพ"
                  aria-label="ส่งรูปภาพ"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-brand-50"
                >
                  <FlatIcon name="gallery" size={22} />
                </button>
                <input
                  value={draft}
                  onChange={handleInputChange}
                  placeholder={`พิมพ์ข้อความถึง ${active.name}…`}
                  maxLength={5000}
                  className="flex-1 rounded-full border border-surface-border bg-surface-muted/50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="ส่งข้อความ"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors ${
                    draft.trim() ? "bg-brand-500 hover:bg-brand-600" : "cursor-not-allowed bg-gray-200"
                  }`}
                >
                  <FlatIcon name="send" size={18} className={draft.trim() ? "brightness-0 invert" : "opacity-50"} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <EmptyState title="เลือกการสนทนา" />
        )}
      </section>

      {/* Lightbox */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl">
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="ปิด"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 hover:bg-black"
            >
              <FlatIcon name="close" size={16} className="brightness-0 invert" />
            </button>
            <img src={lightboxImage} alt="รูปภาพขนาดเต็ม" className="max-h-[85vh] w-auto rounded-xl object-contain shadow-2xl" />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="ลบห้องแชทนี้?"
        description="ข้อความทั้งหมดในห้องนี้จะถูกลบถาวร และคู่สนทนาจะไม่เห็นห้องนี้อีก"
        confirmLabel="ลบห้องแชท"
        cancelLabel="ยกเลิก"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}