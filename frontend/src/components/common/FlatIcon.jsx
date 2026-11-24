import { useState } from "react";

/**
 * ไอคอนจาก Flaticon (https://www.flaticon.com/)
 *
 * วางไฟล์ไว้ที่  src/assets/icons/chat/<ชื่อ>.<นามสกุลอะไรก็ได้: png | svg | webp | jpg>
 * เช่น  src/assets/icons/chat/send.png
 *
 * ใช้ import.meta.glob ให้ Vite รวมไฟล์เข้า build เอง
 *  - ไม่ขึ้นกับ path /public และไม่ต้องตั้งค่า rewrite บน Vercel
 *  - รองรับทุกนามสกุล ไม่ต้องแก้ EXT
 *  - ถ้าไฟล์ไหนหาไม่เจอ จะแจ้งชื่อไฟล์ที่ขาดใน Console (F12)
 *
 * ชื่อที่ใช้: send, gallery, arrow-left, trash, close, fullscreen, calendar,
 *            verified, box, chat, double-check, chevron-right, wifi, alert
 *
 * หมายเหตุ: ไอคอนฟรีของ Flaticon ต้องใส่เครดิตผู้ออกแบบตามที่หน้าดาวน์โหลดระบุ
 */
const modules = import.meta.glob("/src/assets/icons/chat/*.{png,svg,webp,jpg,jpeg}", { eager: true });

// สร้างตาราง ชื่อไฟล์(ไม่รวมนามสกุล, ตัวพิมพ์เล็ก) -> URL
const ICONS = {};
for (const [path, mod] of Object.entries(modules)) {
  const base = path.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
  ICONS[base] = mod.default || mod;
}

const warned = new Set();

export function FlatIcon({ name, size = 20, className = "", alt = "" }) {
  const [failed, setFailed] = useState(false);
  const src = ICONS[String(name).toLowerCase()];

  if (!src || failed) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(
        `[FlatIcon] ไม่พบไอคอน "${name}" — วางไฟล์ไว้ที่ src/assets/icons/chat/${name}.png\n` +
          `ไฟล์ที่พบตอนนี้: ${Object.keys(ICONS).join(", ") || "(ไม่มีเลย)"}`
      );
    }
    return (
      <span
        aria-hidden="true"
        className={`inline-block shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 select-none object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}