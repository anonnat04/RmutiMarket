import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

let socket = null;

/**
 * ส่ง event authenticate ไปยัง backend พร้อม token
 * เรียกทุกครั้งที่ connect/reconnect เพื่อให้ backend รู้ว่าเป็น user ใคร
 */
function authenticateSocket(s) {
  // Dynamic import กัน circular dependency
  import('@/store/authStore').then(({ useAuthStore }) => {
    const { token, user } = useAuthStore.getState();
    if (s.connected) {
      if (token) {
        s.emit('authenticate', {
          token,
          userId: user?.id,
          userName: user?.displayName || user?.name || user?.fullName,
        });
      }
      if (user?.id) {
        s.emit('user_connected', {
          userId: user.id,
          userName: user?.displayName || user?.name || user?.fullName || 'ผู้ใช้',
        });
      }
    }
  });
}

/**
 * Initialize or get existing Socket.IO connection
 */
export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("⚡ [Socket.IO Frontend] Connected:", socket.id);
      // ยืนยันตัวตนกับ backend ทุกครั้งที่เชื่อมต่อ (รวม reconnect)
      authenticateSocket(socket);
    });

    socket.on("connect_error", (err) => {
      console.warn("⚠️ [Socket.IO Frontend] Connection error:", err.message);
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 [Socket.IO Frontend] Disconnected:", reason);
    });
  }

  return socket;
}

/**
 * เรียกหลัง login สำเร็จ เพื่อ re-authenticate socket ทันที
 * (socket อาจเชื่อมต่ออยู่แล้วก่อน login จึงต้องส่งซ้ำ)
 */
export function authenticateSocketNow() {
  const s = getSocket();
  if (s.connected) {
    authenticateSocket(s);
  }
}

// ── Chat Functions ──────────────────────────────────────────
export function joinConversation(conversationId) {
  const s = getSocket();
  if (s.connected) {
    s.emit("join_conversation", conversationId);
  } else {
    s.once("connect", () => s.emit("join_conversation", conversationId));
  }
}

export function leaveConversation(conversationId) {
  const s = getSocket();
  if (s) s.emit("leave_conversation", conversationId);
}

export function sendRealtimeMessage({ conversationId, text, message_type = "TEXT", imageUrl = null, sender }) {
  const s = getSocket();
  s.emit("send_message", {
    conversationId,
    text,
    message_type,
    imageUrl,
    sender,
  });
}

export function sendTypingStatus(conversationId, sender, isTyping) {
  const s = getSocket();
  s.emit("typing", {
    conversationId,
    sender,
    isTyping,
  });
}

export function markConversationAsRead(conversationId, userId) {
  const s = getSocket();
  if (s && conversationId && userId) {
    s.emit("mark_read", { conversationId, userId });
  }
}

// ── Realtime Meetup GPS Functions (FREE OpenStreetMap + Geolocation) ────
/**
 * เข้าร่วมห้องติดตามพิกัดการนัดรับแบบสด
 */
export function joinMeetupTracking({ meetupId, userId, role }) {
  const s = getSocket();
  if (s.connected) {
    s.emit("join_meetup_tracking", { meetupId, userId, role });
  } else {
    s.once("connect", () => s.emit("join_meetup_tracking", { meetupId, userId, role }));
  }
}

/**
 * ออกจากห้องติดตามพิกัด
 */
export function leaveMeetupTracking({ meetupId, userId }) {
  const s = getSocket();
  if (s) s.emit("leave_meetup_tracking", { meetupId, userId });
}

/**
 * ส่งพิกัด GPS สดของตนเองให้อีกฝ่ายเห็นบนแผนที่
 */
export function emitLiveLocation({ meetupId, userId, userName, role, lat, lng, accuracy, targetPoint }) {
  const s = getSocket();
  if (s && s.connected) {
    s.emit("send_live_location", {
      meetupId,
      userId,
      userName,
      role,
      lat,
      lng,
      accuracy,
      targetPoint,
    });
  }
}

export default getSocket;
