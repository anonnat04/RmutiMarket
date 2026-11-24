import { useState } from "react";

/**
 * ไอคอนจาก Flaticon (https://www.flaticon.com/)
 * วางไฟล์ที่ดาวน์โหลดไว้ที่  public/icons/chat/<name>.png  (หรือเปลี่ยน EXT เป็น "svg")
 *
 * ชื่อไฟล์ที่ ChatPage ใช้ (ค้นคำในวงเล็บบน Flaticon):
 *   send          (send / paper plane)
 *   gallery       (image / gallery)
 *   arrow-left    (left arrow / back)
 *   trash         (trash / delete)
 *   close         (close / cross)
 *   fullscreen    (expand / fullscreen)
 *   calendar      (calendar / appointment)
 *   verified      (verified / shield check)
 *   box           (package / box)
 *   chat          (chat bubble / message)
 *   double-check  (double check / read)
 *   chevron-right (right chevron)
 *   wifi          (signal / wifi / online)
 *   alert         (warning / alert)
 *
 * หมายเหตุ: ไอคอนฟรีของ Flaticon ต้องใส่เครดิตผู้ออกแบบ (Attribution)
 * ตามที่หน้าดาวน์โหลดระบุ หรือใช้แพ็กเกจ Premium เพื่อไม่ต้องใส่เครดิต
 */
const BASE = "/icons/chat";
const EXT = "png";

export function FlatIcon({ name, size = 20, className = "", alt = "" }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    // ไม่มีไฟล์ไอคอน → เว้นพื้นที่ไว้ ไม่ให้เลย์เอาต์พัง
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
      src={`${BASE}/${name}.${EXT}`}
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