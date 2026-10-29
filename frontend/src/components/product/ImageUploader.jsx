import { useRef } from "react";
import { GripVertical, Star, Trash2, Upload } from "lucide-react";
import { compressImage } from "@/utils/compressImage";

export function ImageUploader({
  images,
  onChange,
  coverId,
  onCoverChange,
  maxImages = 8
}) {
  const inputRef = useRef(null);
  const dragIndex = useRef(null);

  // บีบอัดรูปแล้วค่อยเพิ่มเข้า state เพื่อลดขนาดไฟล์ก่อนอัปโหลด
  const handleFiles = async (files) => {
    if (!files) return;
    const rawFiles = Array.from(files).slice(0, Math.max(0, maxImages - images.length));

    const next = await Promise.all(
      rawFiles.map(async (file) => {
        const compressed = await compressImage(file, {
          maxWidth: 1280,
          maxHeight: 1280,
          quality: 0.82,
        });
        return {
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file: compressed,
          previewUrl: URL.createObjectURL(compressed),
        };
      })
    );

    const merged = [...images, ...next];
    onChange(merged);
    if (!coverId && merged.length > 0) onCoverChange(merged[0].id);
  };
  const removeImage = (id) => {
    const next = images.filter((img) => img.id !== id);
    onChange(next);
    if (coverId === id) onCoverChange(next[0]?.id ?? "");
  };
  const handleDragStart = (index) => {
    dragIndex.current = index;
  };
  const handleDrop = (index) => {
    if (dragIndex.current === null || dragIndex.current === index) return;
    const next = [...images];
    const [moved] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, moved);
    dragIndex.current = null;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {images.map((img, index) => (
          <div
            key={img.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-surface-border bg-surface-muted"
          >
            <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 cursor-grab items-center justify-center rounded bg-black/40 text-white">
              <GripVertical size={13} />
            </span>
            <button
              type="button"
              onClick={() => removeImage(img.id)}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors"
              aria-label="ลบรูปนี้"
            >
              <Trash2 size={13} />
            </button>
            <button
              type="button"
              onClick={() => onCoverChange(img.id)}
              className={`absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                coverId === img.id ? 'bg-brand-500 text-white shadow-xs' : 'bg-black/60 text-white hover:bg-black/80'
              }`}
            >
              <Star size={11} className={coverId === img.id ? 'fill-white' : ''} />
              {coverId === img.id ? 'รูปปก' : 'ตั้งเป็นปก'}
            </button>
          </div>
        ))}
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-surface-border text-ink-500 hover:border-brand-400 hover:text-brand-500 active:bg-orange-50/50 transition-colors"
          >
            <Upload size={20} />
            <span className="text-xs font-medium">เพิ่มรูป</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-ink-500">
        ลากรูปเพื่อจัดลำดับ กดดาวเพื่อตั้งเป็นรูปปก · ใส่ได้สูงสุด {maxImages} รูป
      </p>
    </div>
  );
}
