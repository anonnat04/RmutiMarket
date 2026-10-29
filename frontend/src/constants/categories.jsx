/**
 * Interest Category Presentation — mapping ข้อมูลตกแต่ง (รูปภาพ, คำอธิบาย, สี)
 * คีย์ด้วย "slug" ให้ตรงกับ categories.slug ใน DB จริง (ไม่ใช่ id ปลอมแบบเดิม)
 * ใช้คู่กับข้อมูลจริงจาก GET /api/listings/categories เท่านั้น
 * เดิมไฟล์นี้มี array "interestCategories" ที่ผูก id ปลอม (cat-fashion, cat-gaming ฯลฯ)
 * ไม่ตรงกับ categories.id จริงใน DB เลย ทำให้บันทึก user_interests ไม่ได้จริง
 */
export const interestCategoryPresentation = {
  fashion: {
    icon: "Shirt",
    image: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400&q=80",
    color: "#F472B6",
  },
  electronics: {
    icon: "Laptop",
    image: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&q=80",
    color: "#60A5FA",
  },
  books: {
    icon: "BookOpen",
    image: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&q=80",
    color: "#818CF8",
  },
  dorm: {
    icon: "Home",
    image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80",
    color: "#34D399",
  },
  beauty: {
    icon: "Sparkles",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&q=80",
    color: "#FB923C",
  },
  sports: {
    icon: "Dumbbell",
    image: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&q=80",
    color: "#F59E0B",
  },
  stationery: {
    icon: "PenLine",
    image: "https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=400&q=80",
    color: "#2DD4BF",
  },
  others: {
    icon: "LayoutGrid",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
    color: "#94A3B8",
  },
  // หมายเหตุ: ตัด "เกมและอุปกรณ์" (cat-gaming) ออก เพราะไม่มีอยู่จริงใน DB (categories table)
  // ถ้าอยากได้หมวดนี้จริง ต้อง insert เพิ่มเข้า categories table ก่อน แล้วเพิ่ม mapping ที่นี่ด้วย slug ที่ตรงกัน
};

// รายชื่อหมวดหมู่สำหรับ Sidebar/ตัวกรองสินค้า — ยังคงไว้ตามเดิม (ใช้ slug อ้างอิงกับ DB อยู่แล้ว ถูกต้อง)
export const categories = [
  { id: "cat-1", name: "ทั้งหมด", slug: "all", icon: "LayoutGrid" },
  { id: "cat-electronics", name: "อิเล็กทรอนิกส์", slug: "electronics", icon: "Laptop" },
  { id: "cat-fashion", name: "เสื้อผ้าและเครื่องแต่งกาย", slug: "fashion", icon: "Shirt" },
  { id: "cat-books", name: "หนังสือ", slug: "books", icon: "BookOpen" },
  { id: "cat-stationery", name: "อุปกรณ์การเรียน", slug: "stationery", icon: "PenLine" },
  { id: "cat-dorm", name: "ของใช้ภายในหอพัก", slug: "dorm", icon: "Home" },
  { id: "cat-beauty", name: "ความงามและของใช้ส่วนตัว", slug: "beauty", icon: "Sparkles" },
  { id: "cat-sports", name: "อุปกรณ์กีฬา", slug: "sports", icon: "Dumbbell" },
  { id: "cat-others", name: "อื่นๆ", slug: "others", icon: "MoreHorizontal" }
];

export const categoryFormSchemas = {
  "cat-books": [
    { key: "isbn", label: "เลขที่ ISBN", placeholder: "เช่น 978-616-xxx-xxx-x" },
    { key: "course_code", label: "รหัสวิชา", placeholder: "เช่น 03-xxx-xxx" }
  ],
  "cat-electronics": [
    { key: "brand_model", label: "ยี่ห้อ/รุ่น", placeholder: "เช่น Apple iPad Air 5, Sony WH-CH520" }
  ]
};

export const sidebarNav = [
  { label: "หน้าหลัก", path: "/", icon: "Home" },
  { label: "สินค้าทั้งหมด", path: "/products", icon: "Grid3x3" },
  { label: "ของที่อยากได้ (ตามหาของ)", path: "/want-to-buy", icon: "Search" },
  { label: "สินค้าของฉัน", path: "/my-products", icon: "Store" },
  { label: "นัดรับสินค้า", path: "/meetups", icon: "CalendarClock" },
  { label: "รีวิว & ความน่าเชื่อถือ", path: "/reviews", icon: "Award" },
  { label: "แชท", path: "/chat", icon: "MessageCircle" },
  { label: "รายการโปรดของฉัน", path: "/wishlist", icon: "Heart" },
  { label: "ประวัติการซื้อขาย", path: "/transactions", icon: "Receipt" },
  { label: "ระบบผู้ดูแล (Admin)", path: "/admin", icon: "ShieldCheck" },
  { label: "แจ้งเตือนภัย", path: "/scam-alerts", icon: "ShieldAlert" },
  { label: "ตั้งค่า", path: "/settings", icon: "Settings" }
];