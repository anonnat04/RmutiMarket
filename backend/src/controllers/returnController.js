const { supabase } = require("../config/db");

// ----------------------------------------------------------------
// POST /api/returns  — ขอคืนสินค้า
// ----------------------------------------------------------------
async function createReturnRequest(req, res, next) {
  try {
    const { transactionId, reason, evidenceUrls } = req.body;

    if (!transactionId || !reason)
      return res.status(400).json({ error: "กรุณาระบุรายการและเหตุผลในการขอคืนสินค้า" });

    const { data: txn } = await supabase
      .from("transactions")
      .select("id, buyer_id, seller_id, status_id, completed_at")
      .eq("id", transactionId)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการซื้อขาย" });
    if (txn.buyer_id !== req.user.id)
      return res.status(403).json({ error: "เฉพาะผู้ซื้อเท่านั้นที่ขอคืนสินค้าได้" });
    if (Number(txn.status_id) !== 3)
      return res.status(400).json({ error: "สามารถขอคืนได้เฉพาะรายการที่สำเร็จแล้วเท่านั้น" });

    // คุ้มครองผู้ซื้อ 24 ชั่วโมงหลังปิดดีล
    if (txn.completed_at) {
      const hoursSince = (Date.now() - new Date(txn.completed_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince > 24)
        return res.status(400).json({ error: "เลยระยะเวลาขอคืนสินค้า 24 ชั่วโมงแล้ว" });
    }

    const { data: existingRequest } = await supabase
      .from("return_requests")
      .select("id")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (existingRequest) return res.status(409).json({ error: "รายการนี้มีคำขอคืนสินค้าอยู่แล้ว" });

    const { data: ret, error } = await supabase
      .from("return_requests")
      .insert({
        transaction_id: transactionId,
        requester_id: req.user.id,
        reason,
        evidence_urls: evidenceUrls || [],
      })
      .select("id")
      .single();

    if (error) throw error;

    await supabase.from("notifications").insert({
      user_id: txn.seller_id,
      type: "return_request",
      title: "มีคำขอคืนสินค้า",
      message: `ผู้ซื้อขอคืนสินค้า เหตุผล: ${reason.substring(0, 80)}`,
      reference_type: "transaction",
      reference_id: transactionId,
    });

    res.status(201).json({ message: "ส่งคำขอคืนสินค้าแล้ว รอการตรวจสอบจากทีมงาน", returnId: ret.id });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// GET /api/returns  — คำขอคืนสินค้าของฉัน
// ----------------------------------------------------------------
async function getMyReturns(req, res, next) {
  try {
    const { data: myTransactions, error: txError } = await supabase
      .from("transactions")
      .select("id")
      .or(`buyer_id.eq.${req.user.id},seller_id.eq.${req.user.id}`);
    if (txError) throw txError;
    const transactionIds = (myTransactions || []).map((t) => t.id);
    if (!transactionIds.length) return res.json({ returns: [] });

    const { data, error } = await supabase
      .from("return_requests")
      .select(`
        id, reason, status, admin_note, evidence_urls, created_at,
        transactions(
          id, buyer_id, seller_id, completed_at,
          products(id, title, price, product_images(image_url, is_primary)),
          buyer:users!buyer_id(id, username, full_name),
          seller:users!seller_id(id, username, full_name)
        )
      `)
      .in("transaction_id", transactionIds)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ returns: data || [] });
  } catch (err) {
    next(err);
  }
}

// ----------------------------------------------------------------
// PATCH /api/returns/:id — ผู้ขายตอบรับหรือปฏิเสธคำขอคืนสินค้า
// ----------------------------------------------------------------
async function respondToReturnRequest(req, res, next) {
  try {
    const { action } = req.body || {};
    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "action ต้องเป็น accept หรือ reject" });
    }
    const { data: requestRow, error: findErr } = await supabase
      .from("return_requests")
      .select("id, status, transaction_id, transactions(id, buyer_id, seller_id)")
      .eq("id", req.params.id)
      .single();
    if (findErr || !requestRow) return res.status(404).json({ error: "ไม่พบคำขอคืนสินค้า" });
    if (String(requestRow.transactions?.seller_id) !== String(req.user.id)) {
      return res.status(403).json({ error: "เฉพาะผู้ขายเท่านั้นที่ตอบคำขอคืนสินค้าได้" });
    }
    const { data: updated, error: updateErr } = await supabase
      .from("return_requests")
      .update({ status: action === "accept" ? "accepted" : "rejected" })
      .eq("id", requestRow.id)
      .in("status", ["pending", "requested", "PENDING", "REQUESTED", "return_requested"])
      .select("id");
    if (updateErr) throw updateErr;
    if (!updated?.length) return res.status(409).json({ error: "คำขอนี้ถูกดำเนินการไปแล้ว" });

    const title = action === "accept" ? "ผู้ขายยอมรับคำขอคืนสินค้า" : "ผู้ขายปฏิเสธคำขอคืนสินค้า";
    await supabase.from("notifications").insert({
      user_id: requestRow.transactions.buyer_id,
      type: "return_response", title,
      message: action === "accept" ? "โปรดติดต่อผู้ขายเพื่อนัดคืนสินค้าและรับเงินคืน" : "โปรดติดต่อผู้ขายผ่านแชตหากต้องการข้อมูลเพิ่มเติม",
      reference_type: "return", reference_id: requestRow.id,
    });
    res.json({ message: title });
  } catch (err) {
    next(err);
  }
}

module.exports = { createReturnRequest, getMyReturns, respondToReturnRequest };
