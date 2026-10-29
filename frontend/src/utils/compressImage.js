/**
 * compressImage.js
 * ย่อขนาดรูปภาพด้วย Canvas ก่อนอัปโหลด เพื่อลดพื้นที่จัดเก็บและเวลาอัปโหลด
 *
 * @param {File|Blob} source     - ไฟล์รูปภาพต้นฉบับ
 * @param {object}   [options]
 * @param {number}   [options.maxWidth=1280]   - ความกว้างสูงสุด (px)
 * @param {number}   [options.maxHeight=1280]  - ความสูงสูงสุด (px)
 * @param {number}   [options.quality=0.82]    - คุณภาพ JPEG (0–1)
 * @param {string}   [options.mimeType='image/jpeg'] - ฟอร์แมตผลลัพธ์
 * @returns {Promise<File>} ไฟล์รูปที่ถูกบีบอัดแล้ว
 */
export function compressImage(source, {
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.82,
  mimeType = 'image/jpeg',
} = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      // คำนวณขนาดใหม่โดยรักษาสัดส่วน
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('บีบอัดรูปภาพไม่สำเร็จ'));
            return;
          }
          // ตั้งชื่อไฟล์ผลลัพธ์ให้สอดคล้องกับ mimeType
          const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
          const originalName = source instanceof File ? source.name : 'image';
          const baseName = originalName.replace(/\.[^.]+$/, '');
          resolve(new File([blob], `${baseName}.${ext}`, { type: mimeType }));
        },
        mimeType,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('โหลดรูปภาพไม่สำเร็จ'));
    };

    img.src = url;
  });
}

/**
 * compressImages — บีบอัดหลายไฟล์พร้อมกัน
 * @param {File[]} files
 * @param {object} [options] - ส่งต่อไปยัง compressImage
 * @returns {Promise<File[]>}
 */
export async function compressImages(files, options) {
  return Promise.all(files.map((f) => compressImage(f, options)));
}
