import { useState, useRef } from 'react';
import { Star, Camera, ImagePlus, X, Loader2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { Textarea } from '@/components/common/Textarea';
import { Button } from '@/components/common/Button';
import { api } from '@/lib/api';
import { compressImages } from '@/utils/compressImage';

export function ReviewModal({ open, onClose, onSubmit, revieweeName }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [images, setImages] = useState([]); // array of { file, previewUrl }
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remainingSlots = 4 - images.length;
    if (remainingSlots <= 0) {
      alert('คุณสามารถแนบรูปถ่ายได้สูงสุด 4 รูป');
      return;
    }

    const selectedFiles = files.slice(0, remainingSlots);
    const newItems = selectedFiles.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setImages((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index) => {
    setImages((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleClose = () => {
    if (submitting) return;
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setRating(5);
    setComment('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let uploadedUrls = [];
      if (images.length > 0) {
        const filesToUpload = images.map((img) => img.file);
        // บีบอัดรูปรีวิวก่อนอัปโหลด (สูงสุด 1024×1024, quality 0.80)
        const compressedFiles = await compressImages(filesToUpload, {
          maxWidth: 1024,
          maxHeight: 1024,
          quality: 0.80,
        });
        uploadedUrls = await api.uploadImages(compressedFiles);
      }

      await onSubmit({ rating, comment, images: uploadedUrls });

      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImages([]);
      setRating(5);
      setComment('');
    } catch (err) {
      alert(err.message || 'ส่งรีวิวไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title={`⭐ ให้คะแนน ${revieweeName ?? 'อีกฝ่าย'}`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Star Rating */}
        <div className="flex flex-col items-center gap-1.5 py-1">
          <div className="flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} ดาว`}
                className="hover:scale-110 transition-transform"
              >
                <Star
                  size={32}
                  className={n <= rating ? 'fill-brand-500 text-brand-500' : 'text-surface-border'}
                />
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-ink-600">
            {rating === 5 && 'ยอดเยี่ยมมาก ⭐⭐⭐⭐⭐'}
            {rating === 4 && 'ดีมาก ⭐⭐⭐⭐'}
            {rating === 3 && 'ปานกลาง ⭐⭐⭐'}
            {rating === 2 && 'ต้องปรับปรุง ⭐⭐'}
            {rating === 1 && 'ไม่ประทับใจ ⭐'}
          </span>
        </div>

        {/* Comment Box */}
        <Textarea
          label="ความคิดเห็น"
          rows={3}
          placeholder="แชร์ความประทับใจ การส่งมอบสินค้า สภาพสินค้าตรงปกไหม นัดตรงเวลาหรือไม่..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />

        {/* Photo Upload for Completion Proof / Product condition */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
              <Camera size={14} className="text-brand-500" />
              รูปถ่ายจบงาน / สภาพสินค้าจริง <span className="text-ink-400 font-normal">(ไม่บังคับ)</span>
            </label>
            <span className="text-[11px] text-ink-400">{images.length}/4 รูป</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple
            className="hidden"
          />

          {/* Image Previews */}
          <div className="flex flex-wrap gap-2.5 items-center">
            {images.map((img, idx) => (
              <div key={idx} className="relative h-20 w-20 rounded-xl overflow-hidden border border-gray-200 group bg-gray-50">
                <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}

            {images.length < 4 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-20 w-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-brand-500 hover:bg-orange-50/50 flex flex-col items-center justify-center gap-1 text-ink-400 hover:text-brand-600 transition-all text-xs"
              >
                <ImagePlus size={20} />
                <span className="text-[10px] font-semibold">เพิ่มรูปถ่าย</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-ink-400">
            📸 สามารถถ่ายรูปขณะส่งมอบสินค้า หรือสภาพของที่ได้รับเพื่อเป็นหลักฐานและแสดงในหน้ารีวิว
          </p>
        </div>

        {/* Submit Button */}
        <Button type="submit" disabled={submitting} className="mt-2 w-full">
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              กำลังส่งรีวิว...
            </span>
          ) : (
            'ส่งรีวิว'
          )}
        </Button>
      </form>
    </Modal>
  );
}
