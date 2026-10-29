const { supabase } = require("../config/db");

// GET /api/notifications
async function getNotifications(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { data, error, count } = await supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + parseInt(limit) - 1);

    if (error) throw error;

    const { count: unreadCount } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .eq("is_read", false);

    res.json({ notifications: data || [], total: count, unreadCount: unreadCount || 0 });
  } catch (err) {
    next(err);
  }
}

// POST /api/notifications/read-all
// ── แก้ไข: เอาคอลัมน์ "read_at" ออกจาก update ──
// ตาราง notifications ใน schema.sql มีแค่ is_read (boolean) ไม่มีคอลัมน์ read_at เลย
// เดิม update พยายามเซ็ตคอลัมน์ที่ไม่มีอยู่จริง ทำให้ query ทั้งก้อน error และไม่มีอะไรถูกอัปเดต
// จริงๆ แต่โค้ดเดิมไม่เช็ค { error } เลย จึงดูเหมือนสำเร็จ (ส่ง 200 กลับไป) ทั้งที่ is_read
// ไม่เคยถูกเปลี่ยนเป็น true ใน database จริง — พอรีเฟรชหน้าเลยกลับมา "ยังไม่อ่าน" เหมือนเดิม
// เพิ่ม log error ไว้ด้วยเผื่อเกิดปัญหาอื่นในอนาคตจะได้เห็นทันที
// ----------------------------------------------------------------
async function markAllRead(req, res, next) {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", req.user.id)
      .eq("is_read", false);

    if (error) {
      console.error("[markAllRead] update ล้มเหลว:", error);
      throw error;
    }

    res.json({ message: "ทำเครื่องหมายอ่านทั้งหมดแล้ว" });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/notifications/:id/read
async function markRead(req, res, next) {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", req.user.id);

    if (error) {
      console.error("[markRead] update ล้มเหลว:", error);
      throw error;
    }

    res.json({ message: "อ่านแล้ว" });
  } catch (err) {
    next(err);
  }
}

module.exports = { getNotifications, markAllRead, markRead };