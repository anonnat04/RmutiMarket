/**
 * chatSocket.js — Realtime Chat & Realtime Meetup GPS Tracking Service
 * Updated for new schema (products, conversation_members, messages with message_type TEXT column)
 */

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { supabase } = require("../config/db");
const { JWT_SECRET, ADMIN_JWT_SECRET } = require("../config/constants");

// คำนวณระยะห่างระหว่าง 2 พิกัด (กิโลเมตร) ด้วยสูตร Haversine
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

let globalIo = null;

/**
 * ส่งแจ้งเตือน Realtime ไปยังผู้ใช้ (จะได้รับทันทีโดยไม่ต้องรีหน้าเว็บ)
 */
function sendNotificationToUser(userId, notification) {
  if (!globalIo || !userId) return;
  const room = `user_${userId}`;
  globalIo.to(room).emit("new_notification", notification);
  console.log(`🔔 [Socket.IO] Realtime notification emitted to ${room}: ${notification?.title || "แจ้งเตือน"}`);
}

/**
 * ส่งแจ้งเตือน Realtime ไปยังผู้ใช้หลายคนพร้อมกัน
 */
function sendNotificationToUsers(userIds, notification) {
  if (!Array.isArray(userIds)) return;
  userIds.forEach((uid) => sendNotificationToUser(uid, notification));
}

/**
 * กระจายข้อความแชทใหม่เข้าห้องแชท
 */
function emitNewMessage(conversationId, message) {
  if (!globalIo || !conversationId) return;
  globalIo.to(`conv_${conversationId}`).emit("new_message", message);
}

/**
 * บรอดแคสต์บอกคนในห้องแชทว่าข้อความถูกอ่านแล้ว (ขึ้นสถานะ 'อ่านแล้ว')
 */
function emitMessagesRead(conversationId, readerId, readAt) {
  if (!globalIo || !conversationId) return;
  globalIo.to(`conv_${conversationId}`).emit("messages_read", {
    conversationId: parseInt(conversationId),
    readerId,
    readAt: readAt || new Date().toISOString(),
  });
}

/**
 * บรอดแคสต์สถานะการนัดหมายและการเช็คอิน Realtime ไปยังทั้งสองฝ่าย
 */
function emitMeetupUpdate(meetupId, payload) {
  if (!globalIo || !meetupId) return;
  const room = `meetup_${meetupId}`;
  globalIo.to(room).emit("meetup_updated", payload);
  globalIo.to(room).emit("meetup_status_update", payload);
  globalIo.to(room).emit("peer_checked_in", payload);
  if (payload.buyerId) {
    globalIo.to(`user_${payload.buyerId}`).emit("meetup_updated", payload);
  }
  if (payload.sellerId) {
    globalIo.to(`user_${payload.sellerId}`).emit("meetup_updated", payload);
  }
  console.log(`📍 [Socket.IO] Realtime meetup update emitted for ${room}`);
}

async function isConversationMember(conversationId, userId) {
  const { data: members, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (!error && (members || []).some((m) => String(m.user_id) === String(userId))) return true;
  const { data: oldConv } = await supabase
    .from("conversations")
    .select("buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (oldConv && [oldConv.buyer_id, oldConv.seller_id].some((id) => String(id) === String(userId))) return true;
  // Historical rooms can lack membership rows. A persisted message authored by
  // the verified user proves participation without trusting client supplied IDs.
  const { data: ownMessage } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("sender_id", userId)
    .limit(1)
    .maybeSingle();
  return !!ownMessage;
}

async function getMeetupAccess(meetupId, userId) {
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, transactions(buyer_id, seller_id), locations(latitude, longitude)")
    .eq("id", meetupId)
    .maybeSingle();
  const txn = appt?.transactions;
  if (!appt || !txn || ![txn.buyer_id, txn.seller_id].some((id) => String(id) === String(userId))) return null;
  return { latitude: appt.locations?.latitude, longitude: appt.locations?.longitude };
}

function setupChatSocket(httpServer, allowedOrigin) {
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigin || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 1e7,
  });

  globalIo = io;

  // เก็บ active users & live location ในหน่วยความจำ
  const onlineUsers = new Map(); // socketId -> { userId, userName }
  // เก็บพิกัด realtime ของแต่ละดีล meetupId -> { [userId]: { lat, lng, accuracy, updatedAt, role } }
  const activeMeetupLocations = new Map();

  io.on("connection", (socket) => {
    socket.data.pendingConversationJoins = new Set();
    socket.data.joinedConversations = new Set();
    socket.data.meetupTargets = new Map();
    // ฟังก์ชันช่วย join ห้องส่วนตัวของ user
    const handleUserJoin = (userId, userName) => {
      if (!userId) return;
      onlineUsers.set(socket.id, { userId, userName: userName || "ผู้ใช้", socketId: socket.id });
      socket.join(`user_${userId}`);
      console.log(`⚡ [Socket.IO Frontend] Socket ${socket.id} joined personal room: user_${userId}`);
      io.emit("online_users", Array.from(onlineUsers.values()));

      // อัปเดต updated_at
      supabase
        .from("users")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", userId)
        .then(() => {});
    };

    // 1. ยืนยันตัวตนด้วย token เท่านั้น ห้ามเชื่อ userId ที่ client ส่งมา
    socket.on("authenticate", (data) => {
      let payload = null;
      try { payload = jwt.verify(data?.token, JWT_SECRET, { issuer: "campus-market-user" }); } catch (_) {}
      if (!payload) {
        try { payload = jwt.verify(data?.token, ADMIN_JWT_SECRET, { issuer: "campus-market-admin" }); } catch (_) {}
      }
      if (!payload?.sub || (data?.userId && String(data.userId) !== String(payload.sub))) {
        socket.emit("authentication_error", { error: "กรุณาเข้าสู่ระบบใหม่" });
        return;
      }
      // Socket may survive logout/account switch. Drop every previous identity/room first.
      const previousUserId = socket.data.userId;
      if (previousUserId && String(previousUserId) !== String(payload.sub)) {
        socket.leave(`user_${previousUserId}`);
        for (const convId of socket.data.joinedConversations) socket.leave(`conv_${convId}`);
        for (const meetupId of socket.data.meetupTargets.keys()) socket.leave(`meetup_${meetupId}`);
        socket.data.joinedConversations.clear();
        socket.data.meetupTargets.clear();
        onlineUsers.delete(socket.id);
      }
      const authAttempt = (socket.data.authAttempt || 0) + 1;
      socket.data.authAttempt = authAttempt;
      socket.data.userId = payload.sub;
      supabase.from("users").select("username, full_name").eq("id", payload.sub).maybeSingle().then(({ data: user }) => {
        if (socket.data.authAttempt !== authAttempt || String(socket.data.userId) !== String(payload.sub)) return;
        socket.data.userName = user?.username || user?.full_name || "ผู้ใช้";
        handleUserJoin(payload.sub, socket.data.userName);
        const pending = [...socket.data.pendingConversationJoins];
        socket.data.pendingConversationJoins.clear();
        pending.forEach((conversationId) => joinConversationRoom(conversationId));
      });
    });

    // ── Realtime Chat Rooms ──────────────────────────────────────────
    const joinConversationRoom = async (conversationId) => {
      const convId = Number(conversationId);
      if (!socket.data.userId) {
        if (conversationId) socket.data.pendingConversationJoins.add(conversationId);
        return;
      }
      if (!Number.isInteger(convId) || convId <= 0 || !(await isConversationMember(convId, socket.data.userId))) return;
      socket.join(`conv_${convId}`);
      socket.data.joinedConversations.add(String(convId));
      socket.emit("joined_room", { conversationId: convId });
    };
    socket.on("join_conversation", joinConversationRoom);

    socket.on("leave_conversation", (conversationId) => {
      const convId = Number(conversationId);
      if (!Number.isInteger(convId) || convId <= 0) return;
      socket.leave(`conv_${convId}`);
      socket.data.joinedConversations.delete(String(convId));
    });

    // ── Live GPS Meetup Tracking (FREE OpenStreetMap + Geolocation) ──
    socket.on("join_meetup_tracking", async ({ meetupId }) => {
      const userId = socket.data.userId;
      if (!meetupId || !userId) return;
      const target = await getMeetupAccess(Number(meetupId), userId);
      if (!target) return;
      const room = `meetup_${meetupId}`;
      socket.join(room);
      socket.data.meetupTargets.set(String(meetupId), target);

      const currentLocs = activeMeetupLocations.get(meetupId) || {};
      socket.emit("meetup_current_locations", currentLocs);
    });

    socket.on("leave_meetup_tracking", ({ meetupId }) => {
      if (!meetupId) return;
      const room = `meetup_${meetupId}`;
      socket.leave(room);

      const currentLocs = activeMeetupLocations.get(meetupId);
      const userId = socket.data.userId;
      if (currentLocs && userId) {
        delete currentLocs[userId];
        io.to(room).emit("user_stopped_sharing_location", { userId });
      }
      socket.data.meetupTargets.delete(String(meetupId));
    });

    // สถานะเช็คอินส่งจาก backend หลังฐานข้อมูลยืนยันเท่านั้น
    socket.on("meetup_checkin", () => {});

    socket.on("send_live_location", ({ meetupId, lat, lng, accuracy }) => {
      const userId = socket.data.userId;
      const targetPoint = socket.data.meetupTargets.get(String(meetupId));
      if (!meetupId || !userId || !targetPoint || lat === undefined || lng === undefined) return;
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;

      const room = `meetup_${meetupId}`;
      if (!activeMeetupLocations.has(meetupId)) {
        activeMeetupLocations.set(meetupId, {});
      }

      let distanceToPointMeters = null;
      if (targetPoint.latitude != null && targetPoint.longitude != null) {
        distanceToPointMeters = Math.round(
          calculateDistanceKm(Number(lat), Number(lng), targetPoint.latitude, targetPoint.longitude) * 1000
        );
      }

      const locationPayload = {
        userId,
        userName: socket.data.userName || "ผู้ใช้",
        role: "participant",
        lat: Number(lat),
        lng: Number(lng),
        accuracy: accuracy || 0,
        distanceToPointMeters,
        updatedAt: new Date().toISOString(),
      };

      activeMeetupLocations.get(meetupId)[userId] = locationPayload;
      socket.to(room).emit("live_location_update", locationPayload);

      if (distanceToPointMeters !== null && distanceToPointMeters <= 30) {
        io.to(room).emit("proximity_alert", {
          userId,
          userName: locationPayload.userName,
          message: `${locationPayload.userName} มาถึงจุดนัดรับแล้ว! 📍`,
          distanceMeters: distanceToPointMeters,
        });
      }
    });

    // ── Send Chat Message ────────────────────────────────────────────
    socket.on("send_message", async (messageData, acknowledge) => {
      const reply = (result) => { if (typeof acknowledge === "function") acknowledge(result); };
      if (!messageData || typeof messageData !== "object") {
        reply({ ok: false, error: "รูปแบบข้อความไม่ถูกต้อง" });
        return;
      }
      const {
        conversationId,
        text = "",
        message_type = "TEXT",  // schema ใหม่ใช้ message_type เป็น TEXT column
        imageUrl = null,
      } = messageData;

      const senderId = socket.data.userId;
      const convId = Number(conversationId);
      if (!senderId || !Number.isInteger(convId) || convId <= 0) {
        reply({ ok: false, error: "กรุณาเข้าสู่ระบบก่อนส่งข้อความ" });
        return;
      }
      if (!(await isConversationMember(convId, senderId))) {
        reply({ ok: false, error: "คุณไม่มีสิทธิ์ส่งข้อความในห้องแชทนี้" });
        return;
      }

      const msgType = (message_type || "TEXT").toUpperCase();
      if (!['TEXT', 'IMAGE'].includes(msgType) || String(text).length > 5000) {
        reply({ ok: false, error: "รูปแบบข้อความไม่ถูกต้องหรือยาวเกินกำหนด" });
        return;
      }
      let savedMsg = null;

      try {
        const { data: msg, error: insertErr } = await supabase
          .from("messages")
          .insert({
            conversation_id: convId,
            sender_id: senderId,
            message_type: msgType,
            content: text || null,
          })
          .select("id, message_type, content, created_at")
          .single();

        if (insertErr) throw insertErr;
        if (msg) {
          savedMsg = msg;

          if (imageUrl) {
            await supabase.from("message_attachments").insert({
              message_id: msg.id,
              file_url: imageUrl,
              file_type: "image",
            });
          }

          await supabase
            .from("conversations")
            .update({ updated_at: msg.created_at })
            .eq("id", convId);

            // ── เพิ่ม: สร้างแจ้งเตือน (notifications) ให้สมาชิกคนอื่นในห้องแชท ──
            // เดิมไม่มีขั้นตอนนี้เลย ทำให้ถ้าอีกฝั่ง offline หรือไม่ได้เปิดหน้าแชทค้างไว้
            // จะไม่รู้เลยว่ามีข้อความใหม่เข้ามา ต้องพึ่งพา Socket.IO อย่างเดียวซึ่งหายไปตอน offline
            try {
              const { data: members } = await supabase
                .from("conversation_members")
                .select("user_id")
                .eq("conversation_id", parseInt(conversationId));

              const recipientIds = (members || [])
                .map((m) => m.user_id)
                .filter((uid) => String(uid) !== String(senderId));

              if (recipientIds.length > 0) {
                const notifRows = recipientIds.map((uid) => ({
                  user_id: uid,
                  type: "chat_message",
                  title: "ข้อความใหม่",
                  message: msgType === "IMAGE"
                    ? `${socket.data.userName || "ผู้ใช้"} ส่งรูปภาพถึงคุณ`
                    : `${socket.data.userName || "ผู้ใช้"}: ${text || ""}`.slice(0, 120),
                  reference_type: "conversation",
                  reference_id: parseInt(conversationId),
                  is_read: false,
                }));

                const { data: insertedNotifs } = await supabase
                  .from("notifications")
                  .insert(notifRows)
                  .select("*");

                // ยิง realtime แจ้งเตือนไปห้องส่วนตัวของแต่ละคน (ใช้ได้แม้ไม่ได้เปิดหน้าแชทห้องนี้อยู่)
                (insertedNotifs || []).forEach((n) => {
                  io.to(`user_${n.user_id}`).emit("new_notification", n);
                });
              }
            } catch (notifErr) {
              console.warn("[Socket.IO] สร้างแจ้งเตือนไม่สำเร็จ:", notifErr?.message || notifErr);
            }
        }
      } catch (err) {
        console.warn("[Socket.IO DB Warning]", err?.message || err);
      }

      // ส่ง realtime เฉพาะเมื่อบันทึกข้อความในฐานข้อมูลสำเร็จแล้ว
      if (!savedMsg) {
        reply({ ok: false, error: "บันทึกข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
        return;
      }

      const fullMessage = {
        id: savedMsg.id,
        conversationId: convId,
        text,
        message_type: msgType,
        imageUrl,
        sender: { id: senderId, name: socket.data.userName || "ผู้ใช้" },
        createdAt: savedMsg.created_at,
        time: new Date(savedMsg.created_at).toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      // กระจายข้อความแบบ Realtime ให้ทุกคนในห้องแชท (คนที่เปิดหน้าแชทห้องนี้ค้างไว้)
      io.to(`conv_${convId}`).emit("new_message", fullMessage);
      reply({ ok: true, message: fullMessage });
    });

    // อัปเดต last_read_at เมื่อผู้ใช้อ่านข้อความ (schema ใหม่)
    socket.on("mark_read", async ({ conversationId }) => {
      const userId = socket.data.userId;
      const convId = Number(conversationId);
      if (!userId || !Number.isInteger(convId) || convId <= 0 || !(await isConversationMember(convId, userId))) return;
      try {
        const now = new Date().toISOString();

        await supabase
          .from("conversation_members")
          .update({ last_read_at: now })
          .eq("conversation_id", convId)
          .eq("user_id", userId);

        // ทำเครื่องหมายแจ้งเตือนของห้องนี้ว่าอ่านแล้วด้วย
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", userId)
          .eq("reference_type", "conversation")
          .eq("reference_id", convId);

        emitMessagesRead(convId, userId, now);
      } catch (err) {
        console.error("[Socket.IO] mark_read error:", err);
      }
    });

    socket.on("typing", async ({ conversationId, isTyping }) => {
      const userId = socket.data.userId;
      const convId = Number(conversationId);
      if (!userId || !Number.isInteger(convId) || !socket.data.joinedConversations.has(String(convId)) || !(await isConversationMember(convId, userId))) return;
      socket.to(`conv_${convId}`).emit("user_typing", {
        conversationId: convId,
        sender: { id: userId, name: socket.data.userName || "ผู้ใช้" },
        isTyping,
      });
    });

    socket.on("disconnect", () => {
      const userData = onlineUsers.get(socket.id);
      onlineUsers.delete(socket.id);
      io.emit("online_users", Array.from(onlineUsers.values()));

      if (userData?.userId) {
        supabase
          .from("users")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", userData.userId)
          .then(() => {});
      }
    });
  });

  return io;
}

module.exports = {
  setupChatSocket,
  sendNotificationToUser,
  sendNotificationToUsers,
  emitNewMessage,
  emitMessagesRead,
  emitMeetupUpdate,
};
