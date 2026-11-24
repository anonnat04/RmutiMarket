const { supabase } = require("../config/db");
const { emitNewMessage } = require("./chatSocket");

// ----------------------------------------------------------------
// ส่งการ์ดนัดรับ (MEETUP_SUMMARY) ลงห้องแชทของคู่ค้าจากฝั่งเซิร์ฟเวอร์
//
// event:
//   "requested" → มีคำขอนัดรับใหม่ (การ์ดมีปุ่มยืนยัน/ปฏิเสธ)
//   "confirmed" → ผู้ขาย/อีกฝ่ายยืนยันแล้ว → สรุป สินค้า ราคา วัน เวลา จุดนัด + ปุ่มไปหน้าเช็คอิน
//   "rejected"  → ปฏิเสธคำขอ (ยกเลิกตอนยังรอยืนยัน)
//   "cancelled" → ยกเลิกนัดที่ยืนยันแล้ว
//
// ข้อมูลทุกอย่างอ่านจากฐานข้อมูลตอนนั้น (ไม่เชื่อค่าจาก client) เพื่อให้ราคา/เวลาตรงจริงเสมอ
// ไม่ throw: ถ้าส่งแชทไม่สำเร็จ ต้องไม่ทำให้การยืนยัน/ยกเลิกนัดล้มเหลว
// ----------------------------------------------------------------
async function postMeetupChatMessage({ appointmentId, event, actorId }) {
  try {
    const { data: appt, error } = await supabase
      .from("appointments")
      .select(`
        id, appointment_date, appointment_time, meeting_detail, location_detail, created_by,
        locations(name),
        transactions(id, product_id, buyer_id, seller_id, agreed_price)
      `)
      .eq("id", appointmentId)
      .maybeSingle();
    if (error || !appt?.transactions) {
      console.warn("[meetupChat] ไม่พบนัดหมาย:", appointmentId, error?.message);
      return null;
    }
    const txn = appt.transactions;

    const [{ data: product }, { data: users }, { data: convs }] = await Promise.all([
      supabase.from("products").select("title, price").eq("id", txn.product_id).maybeSingle(),
      supabase.from("users").select("id, username, full_name").in("id", [txn.buyer_id, txn.seller_id]),
      supabase.from("conversations").select("id, product_id, listing_id, buyer_id, seller_id")
        .or(`product_id.eq.${txn.product_id},listing_id.eq.${txn.product_id}`),
    ]);

    // หาห้องแชทที่มีทั้งผู้ซื้อและผู้ขายของนัดนี้
    let conversationId = null;

    // 1. ตรวจสอบจาก conversation_members
    for (const c of convs || []) {
      const { data: mems } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", c.id);
      const uids = (mems || []).map((m) => String(m.user_id));
      if (uids.includes(String(txn.buyer_id)) && uids.includes(String(txn.seller_id))) {
        conversationId = c.id;
        break;
      }
    }

    // 2. ถ้ายังไม่พบ ตรวจสอบจาก buyer_id และ seller_id บนตาราง conversations โดยตรง (รองรับ schema เดิม)
    if (!conversationId) {
      for (const c of convs || []) {
        const directUids = [String(c.buyer_id), String(c.seller_id)];
        if (directUids.includes(String(txn.buyer_id)) && directUids.includes(String(txn.seller_id))) {
          conversationId = c.id;
          break;
        }
      }
    }

    // 3. ถ้ายังไม่พบ หาจากห้องที่มีข้อความคุยกันของคู่นี้ในสินค้านี้
    if (!conversationId && convs?.length) {
      for (const c of convs) {
        const { data: msgs } = await supabase
          .from("messages")
          .select("sender_id")
          .eq("conversation_id", c.id)
          .limit(10);
        const senders = (msgs || []).map((m) => String(m.sender_id));
        if (senders.includes(String(txn.buyer_id)) || senders.includes(String(txn.seller_id))) {
          conversationId = c.id;
          break;
        }
      }
      if (!conversationId) conversationId = convs[0].id;
    }

    // 3.5 ถ้ายังไม่พบ หาจากห้องใดๆ ที่มีทั้งผู้ซื้อและผู้ขายคู่นี้ (ไม่จำกัดเฉพาะ product_id)
    if (!conversationId) {
      const { data: buyerMems } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", txn.buyer_id);
      if (buyerMems && buyerMems.length > 0) {
        const candidateIds = buyerMems.map((m) => m.conversation_id);
        const { data: commonMems } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .in("conversation_id", candidateIds)
          .eq("user_id", txn.seller_id);
        if (commonMems && commonMems.length > 0) {
          conversationId = commonMems[0].conversation_id;
        }
      }
    }

    // 4. ยังไม่มีห้องแชทของคู่นี้ → สร้างให้ใหม่โดยใส่ครบทุกฟิลด์เพื่อความเข้ากันได้
    if (!conversationId) {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          product_id: txn.product_id,
          listing_id: txn.product_id,
          buyer_id: txn.buyer_id,
          seller_id: txn.seller_id,
        })
        .select("id")
        .maybeSingle();

      if (newConv) {
        conversationId = newConv.id;
        await supabase.from("conversation_members").insert([
          { conversation_id: newConv.id, user_id: txn.buyer_id },
          { conversation_id: newConv.id, user_id: txn.seller_id },
        ]).catch(() => {});
      } else if (convErr) {
        console.warn("[meetupChat] สร้างห้องแชทไม่สำเร็จ:", convErr?.message);
        // Fallback: ลอง insert เฉพาะ product_id
        const { data: fallbackConv } = await supabase
          .from("conversations")
          .insert({ product_id: txn.product_id })
          .select("id")
          .maybeSingle();
        if (fallbackConv) conversationId = fallbackConv.id;
      }
    }

    if (!conversationId) {
      console.warn("[meetupChat] ไม่พบห้องแชทสำหรับนัดหมาย:", appointmentId);
      return null;
    }

    const nameOf = (id, fallback) => {
      const u = (users || []).find((x) => String(x.id) === String(id));
      return u?.username || u?.full_name || fallback;
    };
    const actorName = nameOf(actorId, "ผู้ใช้");

    const status = event === "completed" ? "completed" : event === "confirmed" ? "confirmed" : event === "requested" ? "pending" : "cancelled";
    const payload = {
      kind: "MEETUP",
      event,
      status,
      meetupId: appt.id,
      createdBy: appt.created_by || null,
      productId: txn.product_id,
      productTitle: product?.title || "สินค้า",
      price: Number(txn.agreed_price ?? product?.price ?? 0),
      date: appt.appointment_date,
      time: String(appt.appointment_time || "").slice(0, 5),
      locationName: appt.locations?.name || appt.location_detail || "Safe Point มหาวิทยาลัย",
      note: appt.meeting_detail || null,
      buyerId: txn.buyer_id,
      buyerName: nameOf(txn.buyer_id, "ผู้ซื้อ"),
      sellerId: txn.seller_id,
      sellerName: nameOf(txn.seller_id, "ผู้ขาย"),
    };

    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: actorId,
        message_type: "MEETUP_SUMMARY",
        content: JSON.stringify(payload),
      })
      .select("*")
      .single();
    if (msgErr || !msg) {
      console.warn("[meetupChat] insert ข้อความล้มเหลว:", msgErr?.message);
      return null;
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // รูปแบบเดียวกับ sendMessage ใน chatController (มี conversationId/sender/text)
    // isSystem = true → ฝั่งหน้าบ้านต้องแสดงให้ทุกคน "รวมคนที่กดเอง" เพราะไม่ได้มี optimistic bubble
    emitNewMessage(conversationId, {
      id: msg.id,
      conversationId,
      conversation_id: conversationId,
      text: msg.content,
      content: msg.content,
      message_type: "MEETUP_SUMMARY",
      isSystem: true,
      sender: { id: actorId, name: actorName },
      sender_id: actorId,
      createdAt: msg.created_at,
      time: new Date(msg.created_at).toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      }),
    });

    return msg;
  } catch (err) {
    console.warn("[meetupChat] postMeetupChatMessage error:", err?.message || err);
    return null;
  }
}

module.exports = { postMeetupChatMessage };