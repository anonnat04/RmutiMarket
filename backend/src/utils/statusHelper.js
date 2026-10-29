// backend/src/utils/statusHelper.js
/**
 * Helper definitions and mappings for database status, categories, and conditions.
 * Ensures 100% compatibility with the latest PostgreSQL database schema.
 */

// Category UI Metadata (Categories table only has: id, name, created_at, updated_at)
const CATEGORY_META = {
  1: { slug: "electronics", icon: "Laptop", color: "#60A5FA" },
  2: { slug: "fashion", icon: "Shirt", color: "#F472B6" },
  3: { slug: "books", icon: "BookOpen", color: "#818CF8" },
  4: { slug: "stationery", icon: "PenLine", color: "#2DD4BF" },
  5: { slug: "dorm", icon: "Home", color: "#34D399" },
  6: { slug: "beauty", icon: "Sparkles", color: "#FB923C" },
  7: { slug: "sports", icon: "Dumbbell", color: "#F59E0B" },
  8: { slug: "others", icon: "LayoutGrid", color: "#94A3B8" },
};

const SLUG_TO_CATEGORY_ID = {
  electronics: 1,
  fashion: 2,
  books: 3,
  stationery: 4,
  dorm: 5,
  beauty: 6,
  sports: 7,
  others: 8,
};

// Status mappings
const PRODUCT_STATUS = {
  AVAILABLE: { id: 1, code: "AVAILABLE", name: "ว่าง", ui: "active" },
  RESERVED: { id: 2, code: "RESERVED", name: "ติดจอง", ui: "reserved" },
  SOLD: { id: 3, code: "SOLD", name: "ขายแล้ว", ui: "sold" },
};

const TRANSACTION_STATUS = {
  PENDING: { id: 1, code: "PENDING", name: "รอยืนยัน", ui: "pending" },
  CONFIRMED: { id: 2, code: "CONFIRMED", name: "ยืนยันแล้ว", ui: "confirmed" },
  COMPLETED: { id: 3, code: "COMPLETED", name: "ซื้อขายเสร็จ", ui: "completed" },
  CANCELLED: { id: 4, code: "CANCELLED", name: "ยกเลิก", ui: "cancelled" },
};

const APPOINTMENT_STATUS = {
  PENDING: { id: 1, code: "PENDING", name: "รอการยืนยัน", ui: "pending" },
  CONFIRMED: { id: 2, code: "CONFIRMED", name: "นัดหมายเรียบร้อย", ui: "confirmed" },
  COMPLETED: { id: 3, code: "COMPLETED", name: "นัดรับเสร็จ", ui: "completed" },
  CANCELLED: { id: 4, code: "CANCELLED", name: "ยกเลิก", ui: "cancelled" },
  NO_SHOW: { id: 5, code: "NO_SHOW", name: "ไม่มาตามนัด", ui: "no_show" },
};

const WANTED_POST_STATUS = {
  ACTIVE: { id: 1, code: "ACTIVE", name: "กำลังตามหา", ui: "active" },
  MATCHED: { id: 2, code: "MATCHED", name: "เจอสินค้าแล้ว", ui: "matched" },
  CANCELLED: { id: 3, code: "CANCELLED", name: "ยกเลิกโพสต์", ui: "cancelled" },
  EXPIRED: { id: 4, code: "EXPIRED", name: "ครบ 7 วัน", ui: "expired" },
};

const PRODUCT_CONDITIONS = {
  NEW: { id: 1, code: "NEW", name: "มือหนึ่ง", ui: "new" },
  USED: { id: 2, code: "USED", name: "มือสอง", ui: "used_good" },
};

function getStatusId(table, key) {
  if (key === undefined || key === null || key === "") return null;
  if (typeof key === "number" && !isNaN(key)) return key;

  const str = String(key).trim();
  const upper = str.toUpperCase();

  let dict = null;
  if (table === "product_status") dict = PRODUCT_STATUS;
  else if (table === "transaction_status") dict = TRANSACTION_STATUS;
  else if (table === "appointment_status") dict = APPOINTMENT_STATUS;
  else if (table === "wanted_post_status") dict = WANTED_POST_STATUS;
  else if (table === "product_conditions") dict = PRODUCT_CONDITIONS;

  if (dict) {
    if (dict[upper]) return dict[upper].id;
    for (const item of Object.values(dict)) {
      if (item.name === str || item.code === upper || item.ui === str.toLowerCase() || String(item.id) === str) {
        return item.id;
      }
    }
  }

  const parsed = parseInt(str, 10);
  return !isNaN(parsed) ? parsed : null;
}

function formatStatus(table, statusObj) {
  if (!statusObj) return { id: null, code: "UNKNOWN", name: "" };
  const id = statusObj.id || (typeof statusObj === "number" ? statusObj : null);
  const name = statusObj.name || "";

  let dict = null;
  if (table === "product_status") dict = PRODUCT_STATUS;
  else if (table === "transaction_status") dict = TRANSACTION_STATUS;
  else if (table === "appointment_status") dict = APPOINTMENT_STATUS;
  else if (table === "wanted_post_status") dict = WANTED_POST_STATUS;
  else if (table === "product_conditions") dict = PRODUCT_CONDITIONS;

  if (dict) {
    for (const item of Object.values(dict)) {
      if (item.id === id || (name && item.name === name)) {
        return { id: item.id, code: item.code, name: item.name, ui: item.ui };
      }
    }
  }

  return { id, code: name ? name.toUpperCase() : "UNKNOWN", name };
}

function formatCategory(cat) {
  if (!cat) return null;
  const meta = CATEGORY_META[cat.id] || { slug: `cat-${cat.id}`, icon: "ShoppingBag", color: "#60A5FA" };
  return {
    id: cat.id,
    name: cat.name,
    slug: meta.slug,
    icon: meta.icon,
    color: meta.color,
  };
}

function formatUser(u) {
  if (!u) return null;
  const facultyName = u.faculties?.name || u.faculty || "";
  const majorName = u.majors?.name || u.major || "";
  const cleanUsername = u.username ? u.username.replace(/^@+/, "").trim() : "";
  const displayName = cleanUsername || u.full_name || "นักศึกษา มทร.อีสาน";

  return {
    id: u.id,
    username: cleanUsername,
    fullName: u.full_name,
    full_name: u.full_name,
    displayName,
    display_name: displayName,
    email: u.university_email || u.email,
    universityEmail: u.university_email,
    studentId: u.student_id,
    student_id: u.student_id,
    facultyId: u.faculty_id,
    majorId: u.major_id,
    faculty: facultyName,
    major: majorName,
    phone: u.phone,
    role: u.role || "user",
    status: u.status || "active",
    banReason: u.ban_reason,
    trustScore: u.trust_score ?? 100,
    trust_score: u.trust_score ?? 100,
    successfulDealCount: u.successful_deal_count || 0,
    successful_deal_count: u.successful_deal_count || 0,
    averageRating: Number(u.average_rating || 0),
    average_rating: Number(u.average_rating || 0),
    reviewCount: u.review_count || 0,
    review_count: u.review_count || 0,
    avatarUrl: u.avatar_url || u.profile_image_url || null,
    avatar_url: u.avatar_url || u.profile_image_url || null,
    profileImageUrl: u.profile_image_url || u.avatar_url || null,
    profile_image_url: u.profile_image_url || u.avatar_url || null,
    verificationLevel: u.email_verified_at ? "email_verified" : "student_id_verified",
    verification_level: u.email_verified_at ? "email_verified" : "student_id_verified",
    createdAt: u.created_at,
    created_at: u.created_at,
    lastSeenAt: u.last_seen_at,
  };
}

module.exports = {
  CATEGORY_META,
  SLUG_TO_CATEGORY_ID,
  PRODUCT_STATUS,
  TRANSACTION_STATUS,
  APPOINTMENT_STATUS,
  WANTED_POST_STATUS,
  PRODUCT_CONDITIONS,
  getStatusId,
  formatStatus,
  formatCategory,
  formatUser,
};
