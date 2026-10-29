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
  Trash2,
  ArrowLeft,
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

// ── เลือกชื่อที่จะแสดงของคู่สนทนา ──────────────────────────────────
// ก่อนหน้านี้ใช้ full_name (displayName) ก่อน username ทำให้ไม่ตรงกับที่ผู้ใช้ต้องการ
// ตอนนี้ให้ "username" เป็นค่าหลักเสมอ (ตรงกับ users.username ในฐานข้อมูล)
function resolvePartnerName(partner) {
  return partner?.username || partner?.displayName || partner?.full_name || "เจ้าของสินค้า";
}

export function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);

  // ── ไม่อ่านค่าเริ่มต้นจาก localStorage อีกต่อไป ──
  // เดิมโหลด cm_saved_convs / cm_chat_messages จาก localStorage มาแสดงก่อน แล้วค่อย sync กับ backend
  // ทำให้ถ้ามีการ "ลบแชท" ในฐานข้อมูล ฝั่ง frontend ยังเห็นข้อความ/ห้องแชทเก่าที่ถูกลบไปแล้วค้างอยู่
  // เพราะไม่มีจังหวะไหนเคลียร์ localStorage ทิ้งเลย ตอนนี้ยึดข้อมูลจาก backend (database) เป็นความจริงเสมอ
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [draft, setDraft] = useState("");
  const [localMessages, setLocalMessages] = useState({});

  // Realtime Socket.IO states
  const [isConnected, setIsConnected] = useState(false);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [deleteConvTarget, setDeleteConvTarget] = useState(null); // id ห้องแชทที่ต้องการลบ
  const [deletingConv, setDeletingConv] = useState(false);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

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
      lastMessage: c.lastMessage?.content || "เริ่มการสนทนา",
      unread: (c.unreadCount || 0) > 0,
      messages: [],
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
        // กรองเฉพาะห้องที่มีข้อมูลสินค้าจริง (ไม่เอาห้องที่สินค้าถูกลบไปแล้ว)
        const validList = res.conversations.filter((c) => c.product_id && c.product);
        // Deduplicate: สินค้าเดียวกัน + partner เดียวกัน = ห้องเดียว
        const dedupeKeyR = new Set();
        const backendConvs = validList
          .map(mapBackendConversation)
          .filter((c) => {
            const key = `${c.productId}-${c.partnerId}`;
            if (dedupeKeyR.has(key)) return false;
            dedupeKeyR.add(key);
            return true;
          });

        setConversations((prev) => {
          // คงไว้เฉพาะห้อง "รอ sync" (id ไม่ใช่ตัวเลข เช่น conv-xxx) ที่ backend ยังไม่มี
          // ห้องที่มี id ตัวเลขจริงแต่ backend ไม่ส่งกลับมาแล้ว = ถูกลบ/ไม่มีสิทธิ์เข้าถึงแล้วในฐานข้อมูล ให้ตัดทิ้ง
          const pendingLocalOnly = prev.filter(
            (c) => !isRealConversationId(c.id) && !backendConvs.some((bc) => String(bc.productId) === String(c.productId))
          );
          return [...backendConvs, ...pendingLocalOnly];
        });

        // ถ้าห้อง active ถูกลบไปแล้ว ให้เปลี่ยนไปห้องแรก
        setActiveId((curr) => {
          if (!curr) return backendConvs[0]?.id || null;
          const exists = backendConvs.some((c) => String(c.id) === String(curr));
          return exists ? curr : (backendConvs[0]?.id || null);
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
            const validList = res.conversations.filter((c) => c.product_id && c.product);
            backendConvs = validList.map(mapBackendConversation);
          }
        } catch (apiErr) {
          console.warn("[ChatPage] api.getConversations error:", apiErr?.message);
        }

        // Deduplicate: สินค้าเดียวกัน + partner เดียวกัน = แสดงเพียงห้องเดียว (ห้องแรกที่เจอ)
        const dedupeKey = new Set();
        let convList = backendConvs.filter((c) => {
          const key = `${c.productId}-${c.partnerId}`;
          if (dedupeKey.has(key)) return false;
          dedupeKey.add(key);
          return true;
        });

        // ─── ถ้ามี ?conversationId= จากการกดเสนอขายสินค้า ───
        const queryConvId = searchParams.get("conversationId");
        if (queryConvId) {
          const found = convList.some((c) => String(c.id) === String(queryConvId));
          if (!found) {
            try {
              const freshRes = await api.getConversations();
              if (freshRes?.conversations && Array.isArray(freshRes.conversations)) {
                convList = freshRes.conversations.map(mapBackendConversation);
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
        if (!activeId && convList.length > 0 && !queryProductId) {
          setActiveId(String(convList[0].id));
        }
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
      if (n?.type === "message" || n?.type === "chat_message") {
        refreshConversationsFromBackend();
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
      socket.off("messages_read", handleMessagesRead);
    };
  }, [activeId, user]);

  // ─── 3. Fetch Messages when activeId changes ───
  // ── สำคัญ: ยึดข้อมูลจาก backend (database) เป็นความจริงเสมอ ──
  // เดิม: if (res?.messages && res.messages.length > 0) { setLocalMessages(...) }
  // ถ้าข้อความถูกลบออกจากฐานข้อมูลจนเหลือ 0 รายการ เงื่อนไขนี้จะไม่ทำงานเลย
  // ทำให้ข้อความเก่าที่ถูกลบไปแล้วยังค้างแสดงอยู่บนหน้าจอตลอดไป
  // ตอนนี้ "เขียนทับ" ด้วยผลลัพธ์จาก backend เสมอ ไม่ว่าจะมีข้อความหรือว่างเปล่าก็ตาม
  useEffect(() => {
    if (!activeId) return;
    joinConversation(activeId);
    setIsOtherTyping(false);

    async function loadMessages() {
      try {
        if (activeId && user?.id) {
          markConversationAsRead(activeId, user.id);
        }

        const res = await api.getMessages(activeId);
        const formatted = (res?.messages || []).map((m) => {
          const senderUser = m.users; // join ที่ backend ส่งมา: users!sender_id(id, username, full_name, ...)
          return {
            id: m.id,
            from: String(m.sender_id) === String(user?.id) ? "me" : "them",
            senderName: senderUser?.username || senderUser?.full_name || null,
            text: m.content || "",
            type: m.message_type || "TEXT",
            image: m.message_attachments?.[0]?.file_url || null,
            isRead: !!m.is_read,
            time: m.created_at
              ? new Date(m.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
              : "เมื่อสักครู่",
          };
        });

        // เขียนทับข้อความของห้องนี้ด้วยข้อมูลจริงจากฐานข้อมูลเสมอ (รวมถึงกรณีเหลือ 0 ข้อความ)
        setLocalMessages((prev) => ({
          ...prev,
          [activeId]: formatted,
        }));

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
      }
    }

    loadMessages();

    return () => {
      leaveConversation(activeId);
    };
  }, [activeId, user?.id]);

  const active = conversations.find((c) => String(c.id) === String(activeId));
  const activeMessages = active ? (localMessages[active.id] ?? active.messages ?? []) : [];

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

    // 2. Realtime Socket.IO emit — ทางเดียวที่ใช้บันทึกลง DB จริง (ผ่าน chatSocket.js)
    sendRealtimeMessage({
      conversationId: active.id,
      text,
      message_type,
      imageUrl: image,
      sender,
    });

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
        <div className="border-b border-surface-border px-4 py-3 bg-surface-muted/30 flex items-center justify-between">
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
            <Radio size={11} className={isConnected ? "animate-pulse text-emerald-600" : "text-amber-600"} />
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
                    onClick={() => setActiveId(null)}
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

                {/* Delete Chat Button */}
                <button
                  type="button"
                  onClick={() => setDeleteConvTarget(active.id)}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors shadow-2xs"
                  title="ลบห้องแชทนี้"
                >
                  <Trash2 size={13} />
                  <span>ลบแชท</span>
                </button>
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
                      <p className="text-xs font-extrabold text-brand-600">{formatCurrency(active.productPrice)}</p>
                    </div>
                  </div>

                  {active.productId && (
                    <button
                      onClick={() => navigate(`/products/${active.productId}/meetup`)}
                      className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:from-brand-600 hover:to-orange-600 transition-all shrink-0"
                    >
                      <CalendarClock size={15} />
                      ตกลงเวลาแล้ว → กดนัดรับสินค้า
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 bg-surface-muted/20">
              {activeMessages.length === 0 ? (
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