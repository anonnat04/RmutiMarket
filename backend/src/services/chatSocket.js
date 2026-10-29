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

    // 1. รับ authenticate event (ส่งมาพร้อม token หรือ userId)
    socket.on("authenticate", (data) => {
      let userId = data?.userId;
      if (!userId && data?.token) {
        try {
          const payload = jwt.verify(data.token, JWT_SECRET, { issuer: "campus-market-user" });
          userId = payload.sub;
        } catch {
          try {
            const adminPayload = jwt.verify(data.token, ADMIN_JWT_SECRET, { issuer: "campus-market-admin" });
            userId = adminPayload.sub;
          } catch {}
        }
      }
      if (userId) {
        handleUserJoin(userId, data?.userName);
      }
    });

    // 2. รับ user_connected event
    socket.on("user_connected", (userData) => {
      if (userData?.userId) {
        handleUserJoin(userData.userId, userData.userName);
      }
    });

    // ── Realtime Chat Rooms ──────────────────────────────────────────
    socket.on("join_conversation", (conversationId) => {
      if (!conversationId) return;
      socket.join(`conv_${conversationId}`);
      socket.emit("joined_room", { conversationId });
    });

    socket.on("leave_conversation", (conversationId) => {
      if (!conversationId) return;
      socket.leave(`conv_${conversationId}`);
    });

    // ── Live GPS Meetup Tracking (FREE OpenStreetMap + Geolocation) ──
    socket.on("join_meetup_tracking", ({ meetupId, userId, role }) => {
      if (!meetupId) return;
      const room = `meetup_${meetupId}`;
      socket.join(room);
      console.log(`📍 [GPS Tracking] Socket ${socket.id} (User: ${userId}, ${role}) joined live tracking: ${room}`);

      const currentLocs = activeMeetupLocations.get(meetupId) || {};
      socket.emit("meetup_current_locations", currentLocs);
    });

    socket.on("leave_meetup_tracking", ({ meetupId, userId }) => {
      if (!meetupId) return;
      const room = `meetup_${meetupId}`;
      socket.leave(room);

      const currentLocs = activeMeetupLocations.get(meetupId);
      if (currentLocs && userId) {
        delete currentLocs[userId];
        io.to(room).emit("user_stopped_sharing_location", { userId });
      }
    });

    socket.on("send_live_location", ({ meetupId, userId, userName, role, lat, lng, accuracy, targetPoint }) => {
      if (!meetupId || !userId || lat === undefined || lng === undefined) return;

      const room = `meetup_${meetupId}`;
      if (!activeMeetupLocations.has(meetupId)) {
        activeMeetupLocations.set(meetupId, {});
      }

      let distanceToPointMeters = null;
      if (targetPoint?.lat && targetPoint?.lng) {
        distanceToPointMeters = Math.round(
          calculateDistanceKm(lat, lng, targetPoint.lat, targetPoint.lng) * 1000
        );
      }

      const locationPayload = {
        userId,
        userName: userName || "ผู้ใช้",
        role: role || "participant",
        lat,
        lng,
        accuracy: accuracy || 0,
        distanceToPointMeters,
        updatedAt: new Date().toISOString(),
      };

      activeMeetupLocations.get(meetupId)[userId] = locationPayload;
      socket.to(room).emit("live_location_update", locationPayload);

      if (distanceToPointMeters !== null && distanceToPointMeters <= 30) {
        io.to(room).emit("proximity_alert", {
          userId,
          userName,
          message: `${userName} (${role === "buyer" ? "ผู้ซื้อ" : "ผู้ขาย"}) มาถึงจุดนัดรับแล้ว! 📍`,
          distanceMeters: distanceToPointMeters,
        });
      }
    });

    // ── Send Chat Message ────────────────────────────────────────────
    socket.on("send_message", async (messageData) => {
      const {
        conversationId,
        text = "",
        message_type = "TEXT",  // schema ใหม่ใช้ message_type เป็น TEXT column
        imageUrl = null,
        sender = { id: null, name: "ฉัน" },
      } = messageData;

      if (!conversationId || !sender.id) return;

      const msgType = (message_type || "TEXT").toUpperCase();
      let savedId = `msg-${Date.now()}`;
      let createdAt = new Date().toISOString();

      try {
        const isNum = !isNaN(parseInt(conversationId)) && !isNaN(parseInt(sender.id));
        if (isNum) {
          const { data: msg } = await supabase
            .from("messages")
            .insert({
              conversation_id: parseInt(conversationId),
              sender_id: sender.id,
              message_type: msgType,
              content: text || null,
            })
            .select("id, message_type, content, created_at")
            .single();

          if (msg) {
            savedId = msg.id;
            createdAt = msg.created_at;

            if (imageUrl) {
              await supabase.from("message_attachments").insert({
                message_id: msg.id,
                file_url: imageUrl,
                file_type: "image",
              });
            }

            await supabase
              .from("conversations")
              .update({ updated_at: createdAt })
              .eq("id", parseInt(conversationId));

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
                .filter((uid) => String(uid) !== String(sender.id));

              if (recipientIds.length > 0) {
                const notifRows = recipientIds.map((uid) => ({
                  user_id: uid,
                  type: "chat_message",
                  title: "ข้อความใหม่",
                  message: msgType === "IMAGE"
                    ? `${sender.name || "ผู้ใช้"} ส่งรูปภาพถึงคุณ`
                    : `${sender.name || "ผู้ใช้"}: ${text || ""}`.slice(0, 120),
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
        }
      } catch (err) {
        console.warn("[Socket.IO DB Warning]", err?.message || err);
      }

      const fullMessage = {
        id: savedId,
        conversationId,
        text,
        message_type: msgType,
        imageUrl,
        sender,
        createdAt,
        time: new Date(createdAt).toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      // กระจายข้อความแบบ Realtime ให้ทุกคนในห้องแชท (คนที่เปิดหน้าแชทห้องนี้ค้างไว้)
      io.to(`conv_${conversationId}`).emit("new_message", fullMessage);
    });

    // อัปเดต last_read_at เมื่อผู้ใช้อ่านข้อความ (schema ใหม่)
    socket.on("mark_read", async ({ conversationId, userId }) => {
      if (!conversationId || !userId) return;
      try {
        const now = new Date().toISOString();
        const convIdInt = parseInt(conversationId);

        await supabase
          .from("conversation_members")
          .update({ last_read_at: now })
          .eq("conversation_id", convIdInt)
          .eq("user_id", userId);

        // ทำเครื่องหมายแจ้งเตือนของห้องนี้ว่าอ่านแล้วด้วย
        await supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", userId)
          .eq("reference_type", "conversation")
          .eq("reference_id", convIdInt);

        // บรอดแคสต์ให้อีกฝ่ายเห็นว่า "อ่านแล้ว" ทันที
        emitMessagesRead(convIdInt, userId, now);
      } catch (err) {
        console.error("[Socket.IO] mark_read error:", err);
      }
    });

    socket.on("typing", ({ conversationId, sender, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conv_${conversationId}`).emit("user_typing", {
        conversationId,
        sender,
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
};