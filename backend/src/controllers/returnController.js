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
      .select("id, buyer_id, seller_id, status, listing_id")
      .eq("id", transactionId)
      .single();

    if (!txn) return res.status(404).json({ error: "ไม่พบรายการซื้อขาย" });
    if (txn.buyer_id !== req.user.id)
      return res.status(403).json({ error: "เฉพาะผู้ซื้อเท่านั้นที่ขอคืนสินค้าได้" });
    if (txn.status !== "completed")
      return res.status(400).json({ error: "สามารถขอคืนได้เฉพาะรายการที่สำเร็จแล้วเท่านั้น" });

    // Check 7-day window
    const { data: txnFull } = await supabase
      .from("transactions").select("completed_at").eq("id", transactionId).single();
    if (txnFull?.completed_at) {
      const daysSince = (Date.now() - new Date(txnFull.completed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 7)
        return res.status(400).json({ error: "เลยระยะเวลาขอคืนสินค้า 7 วันแล้ว" });
    }

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

    await supabase.from("transactions").update({ status: "return_requested" }).eq("id", transactionId);

    await supabase.from("notifications").insert({
      user_id: txn.seller_id,
      type: "return_request",
      title: "มีคำขอคืนสินค้า",
      body: `ผู้ซื้อขอคืนสินค้า เหตุผล: ${reason.substring(0, 80)}`,
      ref_type: "transaction",
      ref_id: transactionId,
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
    const { data, error } = await supabase
      .from("return_requests")
      .select(`
        id, reason, status, admin_note, evidence_urls, created_at,
        transactions(
          id, agreed_price,
          listings(id, title, listing_images(url, is_cover)),
          users!seller_id(id, display_name)
        )
      `)
      .eq("requester_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ returns: data || [] });
  } catch (err) {
    next(err);
  }
}

module.exports = { createReturnRequest, getMyReturns };
