const { query } = require('../config/db');

exports.createTicket = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
    }

    const category = String(req.body.category || '').trim();
    const message = String(req.body.message || '').trim();

    if (!message) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดปัญหา' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: 'ข้อความยาวเกินไป (สูงสุด 2000 ตัวอักษร)' });
    }

    const subject = message.slice(0, 60);

    const { rows } = await query(
      `INSERT INTO support_tickets (user_id, category_id, status_id, subject, message)
       SELECT $1, sc.id, st.id, $3, $4
       FROM support_categories sc, support_ticket_status st
       WHERE sc.name = $2 AND st.code = 'OPEN'
       RETURNING id`,
      [userId, category, subject, message]
    );

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'ไม่พบหมวดหมู่ที่เลือก' });
    }

    res.status(201).json({ success: true, data: { id: rows[0].id } });
  } catch (e) {
    next(e);
  }
};