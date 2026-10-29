const { supabase } = require("../config/db");
const { sendNotificationToUser, emitNewMessage, emitMessagesRead } = require("../services/chatSocket");

// ----------------------------------------------------------------
// GET /api/chat/conversations  — ห้องแชทของฉัน
// ----------------------------------------------------------------
async function getConversations(req, res, next) {
  try {
    const myId = req.user.id;

    // 1. ลองดึงจาก schema ใหม่: conversation_members
    const { data: myMemberships, error: memErr } = await supabase
      .from("conversation_members")
      .select("conversation_id, last_read_at, joined_at")
      .eq("user_id", myId);

    if (memErr) {
      console.error("[getConversations] memErr (query conversation_members ล้มเหลว):", memErr);
    }

    if (!memErr && myMemberships) {
      if (myMemberships.length === 0) {
        return res.json({ conversations: [] });
      }

      const convIds = myMemberships.map((m) => m.conversation_id);

      const { data: convs, error: convErr } = await supabase
        .from("conversations")
        .select(`
          id, product_id, created_at, updated_at,
          products(id, title, price, seller_id,
            product_images(image_url, is_primary)
          )
        `)
        .in("id", convIds)
        .order("updated_at", { ascending: false });

      if (convErr) {
        console.error("[getConversations] convErr (query conversations+products ล้มเหลว):", convErr);
      }

      if (!convErr && convs) {
        // กรองเฉพาะห้องแชทที่สินค้ายังมีอยู่จริงในระบบ (ถ้าสินค้าถูกลบไปแล้ว ให้ตัดออกและล้างห้องแชททิ้ง)
        const validConvs = (convs || []).filter((c) => c.product_id && c.products);
        const invalidConvIds = (convs || [])
          .filter((c) => !c.product_id || !c.products)
          .map((c) => c.id);

        if (invalidConvIds.length > 0) {
          deleteConversations(invalidConvIds).catch((err) =>
            console.warn("[getConversations] cleanup invalid conversations error:", err)
          );
        }

        const validConvIds = validConvs.map((c) => c.id);
        if (validConvIds.length === 0) {
          return res.json({ conversations: [] });
        }

        const { data: allMembers } = await supabase
          .from("conversation_members")
          .select("conversation_id, user_id, last_read_at, users(id, username, full_name, profile_image_url)")
          .in("conversation_id", validConvIds);

        const { data: lastMsgs } = await supabase
          .from("messages")
          .select("conversation_id, content, message_type, created_at, sender_id")
          .in("conversation_id", validConvIds)
          .order("created_at", { ascending: false });

        const lastMsgMap = {};
        (lastMsgs || []).forEach((m) => {
          if (!lastMsgMap[m.conversation_id]) {
            lastMsgMap[m.conversation_id] = m;
          }
        });

        const myMembershipMap = {};
        myMemberships.forEach((m) => {
          myMembershipMap[m.conversation_id] = m;
        });

        const formatted = (validConvs || []).map((c) => {
          const members = (allMembers || []).filter((m) => m.conversation_id === c.id);
          const partner = members.find((m) => String(m.user_id) !== String(myId));
          const myMem = myMembershipMap[c.id];
          const lastMsg = lastMsgMap[c.id];

          const myLastRead = myMem?.last_read_at ? new Date(myMem.last_read_at) : new Date(0);
          const unreadCount = (lastMsgs || []).filter(
            (m) => m.conversation_id === c.id &&
              String(m.sender_id) !== String(myId) &&
              new Date(m.created_at) > myLastRead
          ).length;

          const product = c.products;
          const coverImage = (product?.product_images || []).find((img) => img.is_primary)?.image_url
            || product?.product_images?.[0]?.image_url
            || null;

          return {
            id: c.id,
            product_id: c.product_id,
            product: product ? {
              id: product.id,
              title: product.title,
              price: product.price,
              coverImage,
            } : null,
            partner: partner?.users ? {
              id: partner.users.id,
              username: partner.users.username,
              displayName: partner.users.full_name || partner.users.username,
              profileImage: partner.users.profile_image_url,
            } : null,
            lastMessage: lastMsg ? {
              content: (lastMsg.message_type === "TEXT" || lastMsg.message_type === "text") ? lastMsg.content : `[${lastMsg.message_type || "รูปภาพ"}]`,
              createdAt: lastMsg.created_at,
              senderId: lastMsg.sender_id,
            } : null,
            unreadCount,
            updatedAt: c.updated_at,
            createdAt: c.created_at,
          };
        });

        return res.json({ conversations: formatted });
      }
    }

    // 2. Fallback: ถ้ายังเป็น schema เดิมที่มี buyer_id, seller_id, listings
    const { data: oldConvs, error: oldErr } = await supabase
      .from("conversations")
      .select(`
        id, listing_id, last_message_text, last_message_at,
        buyer_unread_count, seller_unread_count,
        buyer_id, seller_id, created_at,
        listings(id, title, price, seller_id, listing_images(url, is_cover)),
        users!buyer_id(id, display_name, avatar_url),
        users!seller_id(id, display_name, avatar_url)
      `)
      .or(`buyer_id.eq.${myId},seller_id.eq.${myId}`)
      .order("created_at", { ascending: false });

    if (oldErr) {
      console.error("[getConversations] oldErr (fallback schema เก่าล้มเหลว):", oldErr);
    }

    if (!oldErr && oldConvs) {
      const formattedOld = oldConvs.map((c) => {
        const isBuyer = String(c.buyer_id) === String(myId);
        const partner = isBuyer ? c.users_seller_id || c.users : c.users_buyer_id || c.users;
        const coverImg = c.listings?.listing_images?.find((i) => i.is_cover)?.url
          || c.listings?.listing_images?.[0]?.url
          || null;

        return {
          id: c.id,
          product_id: c.listing_id,
          product: c.listings ? {
            id: c.listings.id,
            title: c.listings.title,
            price: c.listings.price,
            coverImage: coverImg,
          } : null,
          partner: partner ? {
            id: partner.id,
            displayName: partner.display_name,
            profileImage: partner.avatar_url,
          } : null,
          lastMessage: c.last_message_text ? {
            content: c.last_message_text,
            createdAt: c.last_message_at,
            senderId: null,
          } : null,
          unreadCount: isBuyer ? (c.buyer_unread_count || 0) : (c.seller_unread_count || 0),
          createdAt: c.created_at,
        };
      });

      return res.json({ conversations: formattedOld });
    }

    return res.json({ conversations: [] });
  } catch (err) {
    console.error("[getConversations] unexpected error:", err);
    res.json({ conversations: [] });
  }
}

// ----------------------------------------------------------------
// GET /api/chat/conversations/:id/messages  — ดูข้อความในห้องแชท
// ----------------------------------------------------------------
// ── แก้ใหม่ทั้งหมด ──────────────────────────────────────────────
// เดิมใช้ query เดียว join ซ้อน (users!sender_id + message_attachments) พร้อม
// { count: "exact" } ซึ่ง Supabase/PostgREST มักตอบ error แบบเงียบๆ เวลามี
// count กับ nested embed ผสมกัน แล้วโค้ดเดิมก็ไม่ log error นั้นเลย (if (!error && data))
// ทำให้ endpoint ตอบ messages: [] อยู่เบื้องหลังโดยไม่มีใครรู้ ทั้งที่ข้อมูลมีอยู่จริงใน DB
// ตอนนี้แยก query เป็นขั้นตอนง่ายๆ ทีละตาราง (แบบเดียวกับ getConversations) และ log
// error ทุกจุดที่อาจล้มเหลว เพื่อให้เห็นสาเหตุจริงถ้ายังมีปัญหาอยู่
// ----------------------------------------------------------------
async function getMessages(req, res, next) {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const myId = req.user.id;
    const convId = parseInt(id);

    if (isNaN(convId)) {
      return res.json({ messages: [], total: 0 });
    }

    // 1. ตรวจสอบว่าฉันเป็นสมาชิกห้องแชทนี้จริง + ดึง last_read_at ของคู่สนทนา
    const { data: convMembers, error: memErr } = await supabase
      .from("conversation_members")
      .select("user_id, last_read_at")
      .eq("conversation_id", convId);

    if (memErr) {
      console.error("[getMessages] memErr (ตรวจสอบสมาชิกห้องแชทล้มเหลว):", memErr);
    }

    const myMembership = (convMembers || []).find((m) => String(m.user_id) === String(myId));

    if (myMembership) {
      const partnerMem = (convMembers || []).find((m) => String(m.user_id) !== String(myId));
      const partnerLastReadTime = partnerMem?.last_read_at
        ? new Date(partnerMem.last_read_at).getTime()
        : 0;

      // 2. นับจำนวนข้อความทั้งหมด แยกจาก query หลัก กันปัญหา count+embed
      const { count, error: countErr } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", convId);

      if (countErr) {
        console.error("[getMessages] countErr (นับจำนวนข้อความล้มเหลว):", countErr);
      }

      // 3. ดึงข้อความแบบไม่ join ก่อน (คอลัมน์ตรงๆ) ลดโอกาส query พัง
      const { data: rawMsgs, error: msgErr } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, message_type, content, created_at")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .range(offset, offset + parseInt(limit) - 1);

      if (msgErr) {
        console.error("[getMessages] msgErr (ดึงข้อความล้มเหลว):", msgErr);
      }

      if (!msgErr && rawMsgs) {
        const msgIds = rawMsgs.map((m) => m.id);
        const senderIds = [...new Set(rawMsgs.map((m) => m.sender_id))];

        // 4. ดึงข้อมูลผู้ส่งทั้งหมดในหน้านี้แบบ batch เดียว (ไม่ join ซ้อนใน query ข้อความ)
        let usersById = {};
        if (senderIds.length > 0) {
          const { data: senders, error: usersErr } = await supabase
            .from("users")
            .select("id, username, full_name, profile_image_url")
            .in("id", senderIds);

          if (usersErr) {
            console.error("[getMessages] usersErr (ดึงข้อมูลผู้ส่งล้มเหลว):", usersErr);
          }
          (senders || []).forEach((u) => { usersById[u.id] = u; });
        }

        // 5. ดึงไฟล์แนบของข้อความทั้งหมดในหน้านี้แบบ batch เดียว
        let attachmentsByMsg = {};
        if (msgIds.length > 0) {
          const { data: attachments, error: attErr } = await supabase
            .from("message_attachments")
            .select("id, message_id, file_url, file_type")
            .in("message_id", msgIds);

          if (attErr) {
            console.error("[getMessages] attErr (ดึงไฟล์แนบล้มเหลว):", attErr);
          }
          (attachments || []).forEach((a) => {
            if (!attachmentsByMsg[a.message_id]) attachmentsByMsg[a.message_id] = [];
            attachmentsByMsg[a.message_id].push(a);
          });
        }

        const combined = rawMsgs.map((m) => {
          const msgTime = new Date(m.created_at).getTime();
          // ถ้าเป็นข้อความที่ฉันส่ง: เช็คว่าคู่สนทนาอ่านหรือยัง
          const isRead = String(m.sender_id) === String(myId)
            ? (partnerLastReadTime >= msgTime)
            : true;

          return {
            id: m.id,
            conversation_id: m.conversation_id,
            sender_id: m.sender_id,
            message_type: m.message_type,
            content: m.content,
            created_at: m.created_at,
            users: usersById[m.sender_id] || null,
            message_attachments: attachmentsByMsg[m.id] || [],
            is_read: isRead,
          };
        });

        // อัปเดต last_read_at
        const now = new Date().toISOString();
        const { error: readErr } = await supabase
          .from("conversation_members")
          .update({ last_read_at: now })
          .eq("conversation_id", convId)
          .eq("user_id", myId);

        if (readErr) {
          console.error("[getMessages] readErr (อัปเดต last_read_at ล้มเหลว):", readErr);
        }

        // เคลียร์การแจ้งเตือนของห้องนี้ใน notifications table
        supabase
          .from("notifications")
          .update({ is_read: true })
          .eq("user_id", myId)
          .eq("reference_type", "conversation")
          .eq("reference_id", convId)
          .then(() => {});

        // บรอดแคสต์บอกคู่สนทนาในห้องแชทว่าอ่านแล้ว
        emitMessagesRead(convId, myId, now);

        return res.json({ messages: combined.reverse(), total: count ?? combined.length });
      }
    }

    // Fallback: ไม่ใช่สมาชิก หรือ query schema ใหม่ล้มเหลวทุกขั้น
    console.warn(`[getMessages] ไม่พบสมาชิกภาพหรือข้อความสำหรับ conversation ${convId}, user ${myId}`);
    res.json({ messages: [], total: 0 });
  } catch (err) {
    console.error("[getMessages] unexpected error:", err);
    res.json({ messages: [], total: 0 });
  }
}

// ----------------------------------------------------------------
// POST /api/chat/conversations  — เริ่มห้องแชทใหม่ (จาก product id)
// ----------------------------------------------------------------
async function createOrGetConversation(req, res, next) {
  try {
    const { productId, listingId, buyerId, partnerId } = req.body;
    const targetProdId = productId || listingId;
    const myId = req.user.id;

    if (!targetProdId) {
      return res.status(400).json({ error: "กรุณาระบุสินค้า (productId)" });
    }

    // 1. ลองค้นหาจากตาราง products (schema ใหม่)
    const isNum = !isNaN(parseInt(targetProdId));
    if (isNum) {
      const { data: product } = await supabase
        .from("products")
        .select("id, seller_id")
        .eq("id", parseInt(targetProdId))
        .single();

      if (product) {
        // หากส่ง partnerId/buyerId มา แปลว่าผู้ขายกำลังทักหาผู้ซื้อ (เช่น เสนอขายสินค้าตามโพสต์ WTB)
        // หากไม่ส่งมา แสดงว่าเป็นผู้ซื้อทักหาผู้ขาย (ค่าเริ่มต้นคือ product.seller_id)
        const explicitPartnerId = partnerId || buyerId;
        const targetPartnerId = explicitPartnerId ? parseInt(explicitPartnerId) : product.seller_id;

        if (String(targetPartnerId) === String(myId)) {
          return res.status(400).json({ error: "ไม่สามารถแชทกับตัวเองได้" });
        }

        // ค้นหาห้องแชทที่มีอยู่แล้วสำหรับสินค้านี้ + คู่สนทนานี้
        // แยก query 2 ขั้น เพราะ Supabase PostgREST ไม่ return nested relation ครบเสมอ
        const { data: existingConvs } = await supabase
          .from("conversations")
          .select("id")
          .eq("product_id", product.id);

        if (existingConvs && existingConvs.length > 0) {
          const convIds = existingConvs.map((c) => c.id);

          // ขั้น 1: หาห้องที่ myId เป็น member
          const { data: myMems } = await supabase
            .from("conversation_members")
            .select("conversation_id")
            .in("conversation_id", convIds)
            .eq("user_id", myId);

          if (myMems && myMems.length > 0) {
            const myConvIds = myMems.map((m) => m.conversation_id);

            // ขั้น 2: จากห้องที่ myId อยู่ หาห้องที่ targetPartnerId อยู่ด้วย
            const { data: partnerMems } = await supabase
              .from("conversation_members")
              .select("conversation_id")
              .in("conversation_id", myConvIds)
              .eq("user_id", targetPartnerId);

            if (partnerMems && partnerMems.length > 0) {
              // พบห้องแชทที่มีทั้งคู่อยู่แล้ว → คืน id ห้องเดิม ไม่สร้างใหม่
              return res.json({ conversationId: partnerMems[0].conversation_id, isNew: false });
            }
          }
        }

        const { data: newConv, error: createErr } = await supabase
          .from("conversations")
          .insert({ product_id: product.id })
          .select("id")
          .single();

        if (!createErr && newConv) {
          const { error: membersErr } = await supabase.from("conversation_members").insert([
            { conversation_id: newConv.id, user_id: myId },
            { conversation_id: newConv.id, user_id: targetPartnerId },
          ]);

          if (membersErr) {
            console.error("[createOrGetConversation] insert conversation_members ล้มเหลว:", membersErr.message);
            await supabase.from("conversations").delete().eq("id", newConv.id);
            return res.status(500).json({ error: "สร้างห้องแชทไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
          }

          return res.status(201).json({ conversationId: newConv.id, isNew: true });
        }
      }
    }

    // 2. Fallback: ค้นหาจาก listings (schema เดิม)
    const { data: listing } = await supabase
      .from("listings")
      .select("id, seller_id")
      .eq("id", targetProdId)
      .single();

    if (listing) {
      const explicitPartnerId = partnerId || buyerId;
      const targetPartnerId = explicitPartnerId ? explicitPartnerId : listing.seller_id;

      if (String(targetPartnerId) === String(myId)) {
        return res.status(400).json({ error: "ไม่สามารถแชทกับตัวเองได้" });
      }

      const isSeller = String(listing.seller_id) === String(myId);
      const buyer_id = isSeller ? targetPartnerId : myId;
      const seller_id = isSeller ? myId : listing.seller_id;

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("listing_id", targetProdId)
        .eq("buyer_id", buyer_id)
        .eq("seller_id", seller_id)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.json({ conversationId: existing[0].id, isNew: false });
      }

      const { data: conv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          listing_id: targetProdId,
          buyer_id,
          seller_id,
        })
        .select("id")
        .single();

      if (!convErr && conv) {
        return res.status(201).json({ conversationId: conv.id, isNew: true });
      }
    }

    console.warn("[createOrGetConversation] ไม่พบสินค้า productId:", targetProdId);
    return res.status(404).json({ error: "ไม่พบสินค้านี้ในระบบ อาจเป็นสินค้าเก่าที่ถูกลบไปแล้ว" });
  } catch (err) {
    console.error("[createOrGetConversation error]", err);
    return res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้างห้องแชท กรุณาลองใหม่อีกครั้ง" });
  }
}

// ----------------------------------------------------------------
// สร้างแจ้งเตือนข้อความใหม่ให้สมาชิกคนอื่นในห้องแชท (ใช้ร่วมกันทั้ง REST และ Socket)
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

    if (recipientIds.length === 0) return;

    const notifRows = recipientIds.map((uid) => ({
      user_id: uid,
      type: "chat_message",
      title: "ข้อความใหม่",
      message: msgType === "IMAGE"
        ? `${senderName || "ผู้ใช้"} ส่งรูปภาพถึงคุณ`
        : `${senderName || "ผู้ใช้"}: ${text || ""}`.slice(0, 120),
      reference_type: "conversation",
      reference_id: conversationId,
      is_read: false,
    }));

    const { data: insertedNotifs } = await supabase
      .from("notifications")
      .insert(notifRows)
      .select("*");

    (insertedNotifs || notifRows).forEach((n) => {
      sendNotificationToUser(n.user_id, n);
    });
  } catch (err) {
    console.warn("[notifyConversationMembers] สร้างแจ้งเตือนไม่สำเร็จ:", err?.message || err);
  }
}

// ----------------------------------------------------------------
// POST /api/chat/conversations/:id/messages  — ส่งข้อความ (REST fallback)
// ----------------------------------------------------------------
async function sendMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { message_type = "TEXT", content, fileUrl, imageUrl } = req.body;
    const finalImageUrl = fileUrl || imageUrl || null;
    const myId = req.user.id;
    const msgType = (message_type || "TEXT").toUpperCase();

    const isNum = !isNaN(parseInt(id));
    if (isNum) {
      const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .insert({
          conversation_id: parseInt(id),
          sender_id: myId,
          message_type: msgType,
          content: content || null,
        })
        .select("*")
        .single();

      if (!msgErr && msg) {
        if (finalImageUrl) {
          await supabase.from("message_attachments").insert({
            message_id: msg.id,
            file_url: finalImageUrl,
            file_type: "image",
          });
        }

        await supabase
          .from("conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", parseInt(id));

        await notifyConversationMembers(parseInt(id), myId, req.user?.display_name || req.user?.full_name, msgType, content);

        emitNewMessage(parseInt(id), {
          id: msg.id,
          conversationId: parseInt(id),
          text: content,
          message_type: msgType,
          imageUrl: finalImageUrl,
          sender: {
            id: myId,
            name: req.user?.display_name || req.user?.full_name || "ฉัน",
          },
          createdAt: msg.created_at,
          time: new Date(msg.created_at).toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });

        return res.status(201).json({ message: msg });
      } else if (msgErr) {
        console.error("[sendMessage] insert ข้อความล้มเหลว (schema ใหม่):", msgErr);
      }
    }

    const { data: oldMsg, error: oldErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        sender_id: myId,
        type: msgType.toLowerCase(),
        content: content || null,
        image_url: finalImageUrl,
      })
      .select("*")
      .single();

    if (!oldErr && oldMsg) {
      return res.status(201).json({ message: oldMsg });
    }
    if (oldErr) {
      console.error("[sendMessage] insert ข้อความล้มเหลว (fallback schema เก่า):", oldErr);
    }

    return res.status(201).json({
      message: {
        id: `msg-${Date.now()}`,
        conversation_id: id,
        sender_id: myId,
        message_type: msgType,
        content: content || null,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[sendMessage error]", err);
    res.status(201).json({
      message: {
        id: `msg-${Date.now()}`,
        conversation_id: req.params.id,
        sender_id: req.user?.id,
        content: req.body?.content,
        created_at: new Date().toISOString(),
      },
    });
  }
}

// ----------------------------------------------------------------
// Helper: ลบห้องแชทและข้อความ/ไฟล์แนบ/สมาชิกทั้งหมดที่เกี่ยวข้อง
// ----------------------------------------------------------------
async function deleteConversations(convIds) {
  if (!convIds) return;
  const ids = (Array.isArray(convIds) ? convIds : [convIds])
    .map((id) => parseInt(id))
    .filter((id) => !isNaN(id));

  if (ids.length === 0) return;

  try {
    // 1. หา id ของ messages ทั้งหมดในห้องเหล่านี้
    const { data: msgs } = await supabase
      .from("messages")
      .select("id")
      .in("conversation_id", ids);

    if (msgs && msgs.length > 0) {
      const msgIds = msgs.map((m) => m.id);
      // 2. ลบ message_attachments
      await supabase.from("message_attachments").delete().in("message_id", msgIds);
    }

    // 3. ลบ messages
    await supabase.from("messages").delete().in("conversation_id", ids);

    // 4. ลบ conversation_members
    await supabase.from("conversation_members").delete().in("conversation_id", ids);

    // 5. ลบ notifications ที่อ้างอิงถึง conversation นี้
    await supabase
      .from("notifications")
      .delete()
      .eq("reference_type", "conversation")
      .in("reference_id", ids);

    // 6. ลบ conversations
    await supabase.from("conversations").delete().in("id", ids);

    console.log(`🧹 [Chat Cleanup] ลบห้องแชทและข้อความเรียบร้อย (${ids.join(", ")})`);
  } catch (err) {
    console.error("[deleteConversations error]", err?.message || err);
  }
}

// ----------------------------------------------------------------
// DELETE /api/chat/conversations/:id  — ลบห้องแชท (สมาชิกเท่านั้น)
// ----------------------------------------------------------------
async function deleteConversation(req, res, next) {
  try {
    const { id } = req.params;
    const convId = parseInt(id);
    const myId = req.user.id;

    if (isNaN(convId)) {
      return res.status(400).json({ error: "รหัสห้องแชทไม่ถูกต้อง" });
    }

    // ตรวจสอบว่าผู้ใช้เป็นสมาชิกของห้องนี้หรือไม่
    const { data: membership } = await supabase
      .from("conversation_members")
      .select("id")
      .eq("conversation_id", convId)
      .eq("user_id", myId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ error: "ไม่มีสิทธิ์ลบห้องแชทนี้" });
    }

    await deleteConversations(convId);
    res.json({ message: "ลบห้องแชทสำเร็จ" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getConversations,
  getMessages,
  createOrGetConversation,
  sendMessage,
  deleteConversation,
  deleteConversations,
};