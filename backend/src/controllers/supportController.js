const { supabase } = require('../config/db');

function normalizeStatus(code, name) {
  const value = `${code || ''} ${name || ''}`.toLowerCase();
  if (/(dismiss|reject|ignore|เพิกเฉย|ปฏิเสธ)/.test(value)) return 'dismissed';
  if (/(progress|กำลัง)/.test(value)) return 'in_progress';
  if (/(resolv|closed|complete|done|เสร็จ|ปิด|แก้ไข)/.test(value)) return 'resolved';
  return 'pending';
}

function categoryMatches(categoryName, categoryInput) {
  const name = String(categoryName || '').toLowerCase();
  const input = String(categoryInput || '').toLowerCase();
  if (name === input || name.includes(input) || input.includes(name)) return true;
  if (input.includes('ทั่วไป')) return /(general|other|ทั่วไป|อื่น)/.test(name);
  if (input.includes('โกง') || input.includes('มิจฉาชีพ')) return /(scam|fraud|โกง|มิจฉาชีพ)/.test(name);
  if (input.includes('ระบบ')) return /(system|technical|ระบบ)/.test(name);
  return false;
}

exports.createTicket = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
    }

    const category = String(req.body.category || '').trim();
    const message = String(req.body.message || '').trim();

    if (/สอบถามทั่วไป|general inquiry/i.test(category)) {
      return res.status(400).json({
        success: false,
        message: 'ช่องนี้รับเฉพาะรายงานปัญหา กรุณาใช้กลุ่ม LINE สำหรับสอบถามทั่วไป',
      });
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรายละเอียดปัญหา' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: 'ข้อความยาวเกินไป (สูงสุด 2000 ตัวอักษร)' });
    }

    const subject = message.slice(0, 60);

    const [{ data: categories, error: categoryError }, { data: statuses, error: statusError }] = await Promise.all([
      supabase.from('support_categories').select('id, name').order('id'),
      supabase.from('support_ticket_status').select('id, code, name'),
    ]);
    if (categoryError) throw categoryError;
    if (statusError) throw statusError;
    const matchedCategory = (categories || []).find((item) => categoryMatches(item.name, category));
    const openStatus = (statuses || []).find((item) => /open|pending|new|รอ/i.test(`${item.code} ${item.name}`));
    if (!matchedCategory || !openStatus) {
      return res.status(400).json({ success: false, message: 'ไม่พบหมวดหมู่ที่เลือก' });
    }

    const { data: ticket, error: insertError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        category_id: matchedCategory.id,
        status_id: openStatus.id,
        subject,
        message,
      })
      .select('id')
      .single();
    if (insertError) throw insertError;

    res.status(201).json({ success: true, data: { id: ticket.id } });
  } catch (e) {
    next(e);
  }
};

exports.getAdminTickets = async (_req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('id, subject, message, created_at, updated_at, resolved_at, support_categories(name), support_ticket_status(code, name), users!support_tickets_user_id_fkey(id, username, full_name, university_email, phone)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;

    const tickets = (data || []).map((ticket) => {
      const user = Array.isArray(ticket.users) ? ticket.users[0] : ticket.users;
      const category = Array.isArray(ticket.support_categories) ? ticket.support_categories[0] : ticket.support_categories;
      const status = Array.isArray(ticket.support_ticket_status) ? ticket.support_ticket_status[0] : ticket.support_ticket_status;
      return {
        id: ticket.id,
        target_type: 'support_ticket',
        target_title: ticket.subject,
        category: category?.name || 'รายงานปัญหา',
        description: ticket.message,
        status: normalizeStatus(status?.code, status?.name),
        status_label: status?.name || null,
        reporter_name: user?.full_name || user?.username || 'ผู้ใช้ในระบบ',
        reporter_email: user?.university_email || null,
        reporter_phone: user?.phone || null,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        resolved_at: ticket.resolved_at,
      };
    });
    res.json({ tickets });
  } catch (error) {
    next(error);
  }
};

exports.resolveAdminTicket = async (req, res, next) => {
  try {
    const finalStatus = req.body.status === 'dismissed' ? 'dismissed' : 'resolved';
    const { data: statuses, error: statusError } = await supabase
      .from('support_ticket_status')
      .select('id, code, name');
    if (statusError) throw statusError;
    const targetStatus = (statuses || []).find((item) => normalizeStatus(item.code, item.name) === finalStatus);
    if (!targetStatus) return res.status(400).json({ error: 'ไม่พบสถานะที่ต้องการในฐานข้อมูล' });

    const update = {
      status_id: targetStatus.id,
      admin_id: req.admin?.id || null,
      updated_at: new Date().toISOString(),
      resolved_at: finalStatus === 'resolved' || finalStatus === 'dismissed' ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase
      .from('support_tickets')
      .update(update)
      .eq('id', req.params.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'ไม่พบรายการแจ้งปัญหา' });
    res.json({ success: true, message: 'อัปเดตสถานะรายการแจ้งปัญหาแล้ว' });
  } catch (error) {
    next(error);
  }
};
