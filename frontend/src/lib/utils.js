// เครื่องมือกลางที่ใช้ร่วมกันหลายหน้า (validation, styling helper)

export function cx(...classNames) {
  return classNames.filter(Boolean).join(" ");
}

export const UNIVERSITY_EMAIL_REGEX = /^[^\s@]+@(rmuti\.ac\.th|[a-z0-9.-]+\.rmuti\.ac\.th|gmail\.com)$/i;

// รูปแบบรหัสนักศึกษา มทร.อีสาน: 11 หลัก ตามด้วยขีด (-) และเลขหลักสุดท้าย 1 หลัก (รวม 13 ตัวอักษร) เช่น 116410400011-1
export const STUDENT_ID_REGEX = /^\d{11}-\d{1}$/;

/**
 * ฟังก์ชันช่วยจัดฟอร์แมตรหัสนักศึกษาอัตโนมัติขณะพิมพ์
 * เมื่อพิมพ์เลขครบ 11 ตัว จะใส่เครื่องหมายขีด (-) ให้อัตโนมัติก่อนพิมพ์ตัวสุดท้าย
 */
export function formatStudentId(val) {
  if (!val) return "";
  // กรองเฉพาะตัวเลข
  const clean = val.replace(/\D/g, "").slice(0, 12);
  if (clean.length <= 11) {
    return clean;
  }
  return `${clean.slice(0, 11)}-${clean.slice(11, 12)}`;
}

export function isValidStudentId(val) {
  if (!val) return false;
  return STUDENT_ID_REGEX.test(val.trim());
}

export function scorePassword(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export const STRENGTH_LABEL = ["อ่อนมาก", "อ่อน", "พอใช้", "ดี", "แข็งแรงมาก"];
export const STRENGTH_COLOR = ["#C0392B", "#E8631C", "#C24E12", "#8A5230", "#1A1A1A"];
