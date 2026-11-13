const { supabase } = require("../config/db");

// เกณฑ์ขั้นต่ำที่ทำธุรกรรมได้ (ต่ำกว่านี้ดูสินค้าได้อย่างเดียว)
const MIN_TRUST_TO_TRANSACT = 50;

// ใช้ต่อจาก requireUserAuth เฉพาะเส้นทางที่ "เริ่มธุรกรรมใหม่"
async function requireTrustScore(req, res, next) {
  try {
    // ดึงค่าสดจาก DB ทุกครั้ง ไม่เชื่อค่าใน token/session ที่อาจเก่า
    const { data, error } = await supabase
      .from("users")
      .select("trust_score")
      .eq("id", req.user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "ไม่พบบัญชีผู้ใช้" });
    }

    const score = data.trust_score ?? 100;
    if (score < MIN_TRUST_TO_TRANSACT) {
      return res.status(403).json({
        error: `Trust Score ของคุณต่ำกว่า ${MIN_TRUST_TO_TRANSACT} คะแนน (ตอนนี้ ${score}) จึงยังไม่สามารถลงขาย ซื้อ หรือตามหาสินค้าได้ ดูสินค้าได้ตามปกติ คะแนนจะได้รับคืนอัตโนมัติทุกสัปดาห์`,
        code: "TRUST_SCORE_TOO_LOW",
        trustScore: score,
        minRequired: MIN_TRUST_TO_TRANSACT,
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireTrustScore, MIN_TRUST_TO_TRANSACT };