// backend/src/utils/categories.js
// -----------------------------------------------------------------------
// Helper สำหรับแปลงค่าหมวดหมู่ที่ frontend ส่งมา (เช่น "cat-fashion", "cat-3",
// 3, "fashion") ให้เป็น category_id (ตัวเลข) ที่ตรงกับตาราง `categories`
// ใน schema.sql
//
// ลำดับ id อ้างอิงจากคำสั่ง INSERT INTO categories ใน schema.sql (SERIAL
// เริ่มจาก 1 ตามลำดับที่ insert):
//   1 = electronics        (อิเล็กทรอนิกส์)
//   2 = fashion            (เสื้อผ้าและเครื่องแต่งกาย)
//   3 = books              (หนังสือ)
//   4 = stationery         (อุปกรณ์การเรียน)
//   5 = dorm               (ของใช้ภายในหอพัก)
//   6 = beauty             (ความงามและของใช้ส่วนตัว)
//   7 = sports             (อุปกรณ์กีฬา)
//   8 = others             (อื่นๆ)
//
// หมายเหตุ: ถ้าฐานข้อมูลจริงของคุณมีการเพิ่ม/ลบ/เรียงหมวดหมู่ต่างจากนี้
// (เช่น id เปลี่ยนไปเพราะรันสคริปต์ seed คนละครั้ง) ให้แก้ SLUG_TO_ID ด้านล่าง
// ให้ตรงกับค่าจริงในตาราง categories ของคุณ
// -----------------------------------------------------------------------

const SLUG_TO_ID = {
  electronics: 1,
  fashion: 2,
  books: 3,
  stationery: 4,
  dorm: 5,
  beauty: 6,
  sports: 7,
  others: 8,
};

const DEFAULT_FALLBACK_ID = SLUG_TO_ID.others; // 8

/**
 * แปลงค่าหมวดหมู่ (จาก query string หรือ body ของ request) ให้เป็น category_id
 * ที่เป็นตัวเลข
 *
 * รองรับรูปแบบ:
 *   - ตัวเลขล้วน หรือ string ตัวเลข        เช่น 3, "3"
 *   - รูปแบบ "cat-<เลข>"                   เช่น "cat-3"
 *   - รูปแบบ "cat-<slug>"                  เช่น "cat-fashion"
 *   - slug ล้วนๆ                           เช่น "fashion"
 *
 * @param {string|number|null|undefined} value  ค่าหมวดหมู่ดิบจาก request
 * @param {number|null} [fallback=DEFAULT_FALLBACK_ID]
 *        ค่าที่จะคืนกลับถ้าแปลงไม่ได้
 *        - ปล่อยว่างไว้ (ไม่ส่ง argument ที่ 2) จะได้ id ของหมวด "others" (8)
 *          เหมาะกับตอน insert ข้อมูล เพราะ category_id เป็น NOT NULL
 *        - ส่ง null เข้ามาตรงๆ เพื่อบอกว่า "ถ้าแปลงไม่ได้ให้ไม่กรอง"
 *          เหมาะกับตอนใช้เป็นเงื่อนไข filter ใน query (if (catId) ...)
 * @returns {number|null}
 */
function resolveCategoryId(value, fallback = DEFAULT_FALLBACK_ID) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  // ตัวเลขล้วนๆ อยู่แล้ว
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  let str = String(value).trim().toLowerCase();
  if (!str || str === "all") {
    return fallback;
  }

  // ตัด prefix "cat-" ออกถ้ามี
  if (str.startsWith("cat-")) {
    str = str.slice(4);
  }

  // ถ้าเหลือเป็นตัวเลข ให้แปลงตรงๆ
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  // ถ้าเป็น slug ให้เปิดตาราง map
  if (Object.prototype.hasOwnProperty.call(SLUG_TO_ID, str)) {
    return SLUG_TO_ID[str];
  }

  // แปลงไม่ได้เลย -> คืนค่า fallback
  return fallback;
}

module.exports = {
  SLUG_TO_ID,
  DEFAULT_FALLBACK_ID,
  resolveCategoryId,
};