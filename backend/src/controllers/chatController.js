const { supabase } = require("../config/db");
const { sendNotificationToUser, emitNewMessage, emitMessagesRead, isConversationClosed } = require("../services/chatSocket");

/**
 * Schema จริงของแชท (ตาม postgreSQL ที่ใช้อยู่):
 *   conversations(id, product_id, created_at, updated_at)
 *   conversation_members(id, conversation_id, user_id, joined_at, last_read_at)
 *   messages(id, conversation_id, sender_id, message_type, content, is_read, created_at)
 *   message_attachments(id, message_id, file_url, file_type, file_size, created_at)
 *
 * ❗ conversations "ไม่มี" buyer_id / seller_id / listing_id
 *    โค้ดเดิมใช้คอลัมน์เหล่านี้ใน .or() และตอน insert ทำให้ Supabase error ทุกครั้ง
 *    → createOrGetConversation ล้มเหลว → หน้าเว็บสร้างห้องปลอม "conv-<id>"
 *    → ส่งข้อความด้วย id ที่ไม่ใช่ตัวเลข → ถูกปฏิเสธ
 */

// transactions.status_id: 1=PENDING, 2=CONFIRMED, 3=COMPLETED, 4=CANCELLED, 5=NO_SHOW
const TX_COMPLETED = 3;
const OPEN_TX_STATUS = [1, 2];
// products.status_id: 1=AVAILABLE, 2=RESERVED, 3=SOLD
const PRODUCT_SOLD = 3;

const txActivityTime = (tx) =>
  new Date(tx?.completed_at || tx?.cancelled_at || tx?.created_at || 0).getTime();
const pairKey = (a, b) => [String(a), String(b)].sort().join(":");
const displayNameOf = (user) => user?.username || user?.full_name || "ผู้ใช้";

function buildDealInfo(product, productTxs, participantsKey) {
  const txList = productTxs || [];
  const pairTxs = participantsKey
    ? txList.filter((tx) => pairKey(tx.buyer_id, tx.seller_id) === participantsKey)
    : [];
  const latestTx = [...pairTxs].sort((a, b) => txActivityTime(b) - txActivityTime(a))[0] || null;
  const completedTx = txList
    .filter((tx) => Number(tx.status_id) === TX_COMPLETED)
    .sort((a, b) => txActivityTime(b) - txActivityTime(a))[0] || null;

  const productStatus = product?.status_id != null ? Number(product.status_id) : null;
  const isDealClosed = productStatus === PRODUCT_SOLD || Boolean(completedTx);
  const hasOpenPairTx = pairTxs.some((tx) => OPEN_TX_STATUS.includes(Number(tx.status_id)));

  return {
    transactionStatusId: latestTx?.status_id != null ? Number(latestTx.status_id) : null,
    isDealClosed,
    dealClosedAt: isDealClosed ? completedTx?.completed_at || null : null,
    canScheduleMeetup: productStatus !== PRODUCT_SOLD && !hasOpenPairTx && !isDealClosed,
  };
}

// ตรวจว่าผู้ใช้เป็นสมาชิกห้อง (อ้างอิงจาก conversation_members เท่านั้น)
async function getMembership(convId, userId) {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("id, user_id, last_read_at")
    .eq("conversation_id", convId);
  if (error) throw error;
  const members = data || [];
  return { members, mine: members.find((m) => String(m.user_id) === String(userId)) || null };
}

// ----------------------------------------------------------------
// GET /api/chat/conversations — ห้องแชทของฉัน
// ----------------------------------------------------------------
async function getConversations(req, res, next) {
  try {
    const myId = req.user.id;

    const { data: myMemberships, error: memErr } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", myId);
    if (memErr) throw memErr;

    const convIds = (myMemberships || []).map((m) => m.conversation_id);
    if (convIds.length === 0) return res.json({ conversations: [] });

    const { data: convs, error: convErr } = await supabase
      .from("conversations")
      .select(`
        id, product_id, created_at, updated_at,
        products(id, title, price, seller_id, status_id,
          product_images(image_url, is_primary),
          transactions(id, buyer_id, seller_id, status_id, completed_at, cancelled_at, created_at)
        )
      `)
      .in("id", convIds)
      .order("updated_at", { ascending: false });
    if (convErr) throw convErr;

    const rows = convs || [];
    const ids = rows.map((c) => c.id);
    if (ids.length === 0) return res.json({ conversations: [] });

    const [{ data: allMembers }, { data: msgs }] = await Promise.all([
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id, users(id, username, full_name, profile_image_url)")
        .in("conversation_id", ids),
      supabase
        .from("messages")
        .select("conversation_id, content, message_type, created_at, sender_id, is_read")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false }),
    ]);

    const lastMsgByConv = {};
    (msgs || []).forEach((m) => {
      if (!lastMsgByConv[m.conversation_id]) lastMsgByConv[m.conversation_id] = m;
    });
    const myMemMap = Object.fromEntries((myMemberships || []).map((m) => [m.conversation_id, m]));

    const conversations = rows.map((c) => {
      const members = (allMembers || []).filter((m) => m.conversation_id === c.id);
      const partner = members.find((m) => String(m.user_id) !== String(myId));
      const lastRead = myMemMap[c.id]?.last_read_at ? new Date(myMemMap[c.id].last_read_at).getTime() : null;
      const last = lastMsgByConv[c.id];

      const unreadCount = (msgs || []).filter(
        (m) =>
          m.conversation_id === c.id &&
          String(m.sender_id) !== String(myId) &&
          (lastRead != null ? new Date(m.created_at).getTime() > lastRead : m.is_read === false)
      ).length;

      const product = c.products;
      const coverImage =
        (product?.product_images || []).find((i) => i.is_primary)?.image_url ||
        product?.product_images?.[0]?.image_url ||
        null;
      const memberKey = [...new Set(members.map((m) => String(m.user_id)))].sort().join(":");
      const deal = buildDealInfo(product, product?.transactions || [], memberKey);

      return {
        id: c.id,
        product_id: c.product_id,
        product: product
          ? {
              id: product.id,
              title: product.title,
              price: product.price,
              coverImage,
              sellerId: product.seller_id,
              statusId: product.status_id,
            }
          : null,
        partner: partner?.users
          ? {
              id: partner.users.id,
              username: partner.users.username,
              displayName: partner.users.full_name || partner.users.username,
              profileImage: partner.users.profile_image_url,
            }
          : null,
        lastMessage: last
          ? {
              content: String(last.message_type).toUpperCase() === "TEXT" ? last.content : `[${last.message_type}]`,
              createdAt: last.created_at,
              senderId: last.sender_id,
            }
          : null,
        unreadCount,
        updatedAt: c.updated_at,
        createdAt: c.created_at,
        ...deal,
      };
    });

    return res.json({ conversations });
  } catch (err) {
    console.error("[getConversations] error:", err);
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/chat/conversations/:id/messages
// ----------------------------------------------------------------
async function getMessages(req, res, next) {
  try {
    const convId = parseInt(req.params.id, 10);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const myId = req.user.id;

    if (!Number.isInteger(convId) || convId <= 0) return res.json({ messages: [], total: 0 });

    const { members, mine } = await getMembership(convId, myId);
    if (!mine) return res.status(403).json({ error: "ไม่มีสิทธิ์อ่านข้อความในห้องนี้" });

    const partner = members.find((m) => String(m.user_id) !== String(myId));
    const partnerLastRead = partner?.last_read_at ? new Date(partner.last_read_at).getTime() : 0;

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", convId);

    const { data: rawMsgs, error: msgErr } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, message_type, content, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (msgErr) throw msgErr;

    const msgIds = (rawMsgs || []).map((m) => m.id);
    const senderIds = [...new Set((rawMsgs || []).map((m) => m.sender_id))];

    const usersById = {};
    if (senderIds.length) {
      const { data: senders } = await supabase
        .from("users")
        .select("id, username, full_name, profile_image_url")
        .in("id", senderIds);
      (senders || []).forEach((u) => (usersById[u.id] = u));
    }

    const attachmentsByMsg = {};
    if (msgIds.length) {
      const { data: atts } = await supabase
        .from("message_attachments")
        .select("id, message_id, file_url, file_type")
        .in("message_id", msgIds);
      (atts || []).forEach((a) => {
        (attachmentsByMsg[a.message_id] ||= []).push(a);
      });
    }

    const combined = (rawMsgs || []).map((m) => ({
      ...m,
      users: usersById[m.sender_id] || null,
      message_attachments: attachmentsByMsg[m.id] || [],
      is_read:
        String(m.sender_id) === String(myId)
          ? partnerLastRead >= new Date(m.created_at).getTime()
          : true,
    }));

    // mark read
    const now = new Date().toISOString();
    await supabase
      .from("conversation_members")
      .update({ last_read_at: now })
      .eq("conversation_id", convId)
      .eq("user_id", myId);
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", myId)
      .eq("reference_type", "conversation")
      .eq("reference_id", convId);
    emitMessagesRead(convId, myId, now);

    return res.json({ messages: combined.reverse(), total: count ?? combined.length });
  } catch (err) {
    console.error("[getMessages] error:", err);
    next(err);
  }
}

// ----------------------------------------------------------------
// POST /api/chat/conversations — สร้างหรือดึงห้องแชท (product + คู่สนทนา)
//   ผู้ซื้อ: ส่ง productId  → คู่สนทนาคือเจ้าของสินค้า
//   ผู้ขาย: ส่ง productId + partnerId(buyerId) → คู่สนทนาคือผู้ซื้อ
// ----------------------------------------------------------------
async function createOrGetConversation(req, res, next) {
  try {
    const { productId, listingId, buyerId, partnerId } = req.body || {};
    const myId = req.user.id;
    const pid = parseInt(productId ?? listingId, 10);

    if (!Number.isInteger(pid)) {
      return res.status(400).json({ error: "กรุณาระบุสินค้า (productId)" });
    }

    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, seller_id")
      .eq("id", pid)
      .maybeSingle();
    if (prodErr) throw prodErr;
    if (!product) {
      return res.status(404).json({ error: "ไม่พบสินค้านี้ในระบบ อาจถูกลบไปแล้ว" });
    }

    const isSeller = String(product.seller_id) === String(myId);
    const explicitPartner = partnerId ?? buyerId;
    const targetPartnerId = isSeller ? parseInt(explicitPartner, 10) : product.seller_id;

    if (!isSeller && explicitPartner && String(explicitPartner) !== String(product.seller_id)) {
      return res.status(403).json({ error: "ผู้ซื้อเริ่มแชทได้เฉพาะกับเจ้าของสินค้านี้" });
    }
    if (isSeller && !Number.isInteger(targetPartnerId)) {
      // เจ้าของสินค้าเปิดแชทโดยไม่ระบุผู้ซื้อ = กำลังพยายามแชทกับสินค้าตัวเอง
      return res.status(400).json({ error: "ไม่สามารถแชทกับตัวเองได้ (หากต้องการทักผู้ซื้อ ให้ระบุ partnerId)" });
    }
    if (String(targetPartnerId) === String(myId)) {
      return res.status(400).json({ error: "ไม่สามารถแชทกับตัวเองได้" });
    }

    // 1) หาห้องเดิมของสินค้านี้ที่มีสมาชิกครบทั้งสองคน
    const { data: existing, error: exErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("product_id", pid);
    if (exErr) throw exErr;

    if (existing?.length) {
      const { data: mems, error: memErr } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id")
        .in("conversation_id", existing.map((c) => c.id))
        .in("user_id", [myId, targetPartnerId]);
      if (memErr) throw memErr;

      const byConv = new Map();
      (mems || []).forEach((m) => {
        const set = byConv.get(m.conversation_id) || new Set();
        set.add(String(m.user_id));
        byConv.set(m.conversation_id, set);
      });
      const matched = [...byConv.entries()]
        .filter(([, set]) => set.has(String(myId)) && set.has(String(targetPartnerId)))
        .map(([id]) => id);

      if (matched.length) {
        // ถ้ามีหลายห้อง เลือกห้องที่มีข้อความล่าสุด
        let chosen = matched[0];
        if (matched.length > 1) {
          const { data: latest } = await supabase
            .from("messages")
            .select("conversation_id")
            .in("conversation_id", matched)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latest?.conversation_id) chosen = latest.conversation_id;
        }
        return res.json({ conversationId: chosen, isNew: false });
      }
    }

    // 2) ไม่มี → สร้างใหม่ (ใช้เฉพาะคอลัมน์ที่มีจริง)
    const { data: newConv, error: createErr } = await supabase
      .from("conversations")
      .insert({ product_id: pid })
      .select("id")
      .single();
    if (createErr) throw createErr;

    const { error: membersErr } = await supabase.from("conversation_members").insert([
      { conversation_id: newConv.id, user_id: myId },
      { conversation_id: newConv.id, user_id: targetPartnerId },
    ]);
    if (membersErr) {
      await supabase.from("conversations").delete().eq("id", newConv.id);
      throw membersErr;
    }

    return res.status(201).json({ conversationId: newConv.id, isNew: true });
  } catch (err) {
    console.error("[createOrGetConversation] error:", err);
    return res.status(500).json({ error: "สร้างห้องแชทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
  }
}

// ----------------------------------------------------------------
// แจ้งเตือนข้อความใหม่ให้สมาชิกคนอื่น
// ----------------------------------------------------------------
async function notifyConversationMembers(conversationId, senderId, senderName, msgType, text) {
  try {
    const { data: members } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const recipientIds = (members || [])
      .map((m) => m.user_id)
      .filter((uid) => String(uid) !== String(senderId));
    if (!recipientIds.length) return;

    const rows = recipientIds.map((uid) => ({
      user_id: uid,
      type: "chat_message",
      title: "ข้อความใหม่",
      message:
        msgType === "IMAGE"
          ? `${senderName || "ผู้ใช้"} ส่งรูปภาพถึงคุณ`
          : `${senderName || "ผู้ใช้"}: ${text || ""}`.slice(0, 120),
      reference_type: "conversation",
      reference_id: conversationId,
      is_read: false,
    }));

    const { data: inserted } = await supabase.from("notifications").insert(rows).select("*");
    (inserted || rows).forEach((n) => sendNotificationToUser(n.user_id, n));
  } catch (err) {
    console.warn("[notifyConversationMembers] failed:", err?.message || err);
  }
}

// ----------------------------------------------------------------
// POST /api/chat/conversations/:id/messages — ส่งข้อความผ่าน REST (สำรองเมื่อ socket ใช้ไม่ได้)
// ----------------------------------------------------------------
async function sendMessage(req, res, next) {
  try {
    const convId = parseInt(req.params.id, 10);
    const { message_type = "TEXT", content, fileUrl, imageUrl } = req.body || {};
    const finalImageUrl = fileUrl || imageUrl || null;
    const myId = req.user.id;
    const msgType = String(message_type || "TEXT").toUpperCase();

    if (!Number.isInteger(convId) || convId <= 0) {
      return res.status(400).json({ error: "รหัสห้องแชทไม่ถูกต้อง" });
    }
    if (!["TEXT", "IMAGE"].includes(msgType) || String(content || "").length > 5000) {
      return res.status(400).json({ error: "รูปแบบข้อความไม่ถูกต้องหรือยาวเกินกำหนด" });
    }

    const { mine } = await getMembership(convId, myId);
    if (!mine) return res.status(403).json({ error: "คุณไม่มีสิทธิ์ส่งข้อความในห้องแชทนี้" });
    if (await isConversationClosed(convId)) {
      return res.status(403).json({ code: "CONVERSATION_CLOSED", error: "การขายเสร็จสิ้นแล้ว ไม่สามารถส่งข้อความในห้องนี้ได้" });
    }

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({ conversation_id: convId, sender_id: myId, message_type: msgType, content: content || null })
      .select("*")
      .single();
    if (msgErr) throw msgErr;

    if (finalImageUrl) {
      await supabase
        .from("message_attachments")
        .insert({ message_id: msg.id, file_url: finalImageUrl, file_type: "image" });
    }
    await supabase.from("conversations").update({ updated_at: msg.created_at }).eq("id", convId);

    const senderName = displayNameOf(req.user);
    await notifyConversationMembers(convId, myId, senderName, msgType, content);

    const payload = {
      id: msg.id,
      conversationId: convId,
      text: content,
      message_type: msgType,
      imageUrl: finalImageUrl,
      sender: { id: myId, name: senderName },
      createdAt: msg.created_at,
      time: new Date(msg.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };
    emitNewMessage(convId, payload);

    return res.status(201).json({ message: msg, payload });
  } catch (err) {
    console.error("[sendMessage] error:", err);
    next(err);
  }
}

// ----------------------------------------------------------------
// ลบห้องแชท + ข้อความ + ไฟล์แนบ + สมาชิก (ตรวจ error ทุกขั้น)
// ----------------------------------------------------------------
async function deleteConversations(convIds) {
  const ids = (Array.isArray(convIds) ? convIds : [convIds])
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isInteger(id));
  if (!ids.length) return;

  const check = (label, { error }) => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  const { data: msgs, error: msgsErr } = await supabase.from("messages").select("id").in("conversation_id", ids);
  check("select messages", { error: msgsErr });

  if (msgs?.length) {
    check(
      "delete message_attachments",
      await supabase.from("message_attachments").delete().in("message_id", msgs.map((m) => m.id))
    );
  }
  check("delete messages", await supabase.from("messages").delete().in("conversation_id", ids));
  check("delete members", await supabase.from("conversation_members").delete().in("conversation_id", ids));
  check(
    "delete notifications",
    await supabase.from("notifications").delete().eq("reference_type", "conversation").in("reference_id", ids)
  );
  check("delete conversations", await supabase.from("conversations").delete().in("id", ids));
}

// DELETE /api/chat/conversations/:id
async function deleteConversation(req, res, next) {
  try {
    const convId = parseInt(req.params.id, 10);
    if (!Number.isInteger(convId)) return res.status(400).json({ error: "รหัสห้องแชทไม่ถูกต้อง" });

    const { mine } = await getMembership(convId, req.user.id);
    if (!mine) return res.status(403).json({ error: "ไม่มีสิทธิ์ลบห้องแชทนี้" });

    await deleteConversations(convId);
    res.json({ message: "ลบห้องแชทสำเร็จ" });
  } catch (err) {
    console.error("[deleteConversation] error:", err);
    next(err);
  }
}

// เก็บประวัติแชทไว้ตลอด — ไม่ลบอัตโนมัติ
async function deleteExpiredChats() { return []; }
async function deleteCancelledDealChats() { return []; }

module.exports = {
  getConversations,
  getMessages,
  createOrGetConversation,
  sendMessage,
  deleteConversation,
  deleteConversations,
  deleteExpiredChats,
  deleteCancelledDealChats,
};