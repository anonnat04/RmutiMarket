import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { categories } from '@/constants/categories';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { ImageUploader } from '@/components/product/ImageUploader';
import { useMyListingsStore } from '@/store/myListingsStore';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { api } from '@/lib/api';

const sellableCategories = categories.filter((c) => c.slug !== 'all');

const conditionOptions = [
  { value: 'new', label: 'มือหนึ่ง (ของใหม่)' },
  { value: 'used_normal', label: 'มือสอง' },
];

export function CreateProductPage() {
  const navigate = useNavigate();
  const addListing = useMyListingsStore((s) => s.addListing);
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(sellableCategories[0].id);
  const [condition, setCondition] = useState('used_normal');
  const [images, setImages] = useState([]);
  const [coverId, setCoverId] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);

  const validate = () => {
    const next = {};
    if (!title.trim()) next.title = 'กรุณากรอกชื่อสินค้า';
    if (!price || Number(price) <= 0) next.price = 'กรุณากรอกราคาที่ถูกต้อง';
    if (images.length === 0) next.images = 'กรุณาเพิ่มรูปสินค้าอย่างน้อย 1 รูป';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const token = localStorage.getItem("cm_token");
    if (!token) {
      setErrors((prev) => ({
        ...prev,
        submit: "กรุณาเข้าสู่ระบบด้วยบัญชีนักศึกษาก่อนลงขายสินค้า",
      }));
      return;
    }

    setSubmitting(true);
    try {
      // 1. อัปโหลดรูปภาพที่เลือกจากเครื่องขึ้น Supabase Storage
      const filesToUpload = images.filter((img) => img.file).map((img) => img.file);
      let uploadedUrls = [];
      if (filesToUpload.length > 0) {
        uploadedUrls = await api.uploadImages(filesToUpload);
      }

      let uploadIndex = 0;
      const finalImages = images.map((img, index) => {
        let url = img.previewUrl || img.url;
        if (img.file && uploadedUrls[uploadIndex]) {
          url = uploadedUrls[uploadIndex];
          uploadIndex++;
        }
        return {
          id: img.id || `img-${index}`,
          url,
          imageUrl: url,
          isCover: coverId ? img.id === coverId : index === 0,
          sortOrder: index,
        };
      });

      // 2. บันทึกลงฐานข้อมูล Supabase ผ่าน Backend API
      const condId = typeof condition === 'number' || !isNaN(Number(condition)) ? Number(condition) : (condition === 'new' ? 1 : 2);
      const condName = condId === 1 ? 'มือหนึ่ง' : 'มือสอง';
      const payload = {
        title: title.trim(),
        description: description.trim(),
        price: Number(price),
        condition,
        condition_id: condId,
        conditionName: condName,
        condition_name: condName,
        product_conditions: { id: condId, name: condName },
        productType: condition === 'new' ? 'new' : 'used',
        categoryId,
        images: finalImages,
      };

      const result = await api.createListing(payload);
      const createdId = String(result?.listingId || result?.listing?.id || `local-${Date.now()}`);

      const newProduct = {
        id: createdId,
        ...payload,
        quantityAvailable: 1,
        images: finalImages,
        status: "active",
        viewCount: 0,
        interestedCount: 0,
        seller: {
          id: user?.id ?? "me",
          displayName: user?.name ?? "ฉัน",
          trustScore: 5,
          reviewCount: 0,
          verificationLevel: "student_verified",
        },
        createdAt: new Date().toISOString(),
      };

      addListing(newProduct);

      // แจ้งเตือนเมื่อลงประกาศสำเร็จ
      useNotificationStore.getState().addNotification({
        userId: user?.id ?? "me",
        title: "🎉 ลงขายสินค้าสำเร็จ",
        message: `สินค้า "${title.trim()}" ของคุณเปิดขายบนตลาด RmutiMarket เรียบร้อยแล้ว`,
        type: "product",
        link: `/products/${createdId}`,
      });

      setSuccessId(createdId);
    } catch (err) {
      console.error("Create listing error:", err);
      setErrors((prev) => ({
        ...prev,
        submit: err.message || "เกิดข้อผิดพลาดในการลงขายสินค้า กรุณาลองใหม่อีกครั้ง",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  if (successId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-3xl">
          🎉
        </span>
        <h1 className="text-xl font-bold text-ink-900">ลงขายสินค้าสำเร็จ</h1>
        <p className="text-sm text-ink-500">ประกาศของคุณขึ้นแสดงในหน้าสินค้าทั้งหมดแล้ว</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/my-products')}>
            ไปดูสินค้าของฉัน
          </Button>
          <Button onClick={() => navigate(`/products/${successId}`)}>ดูประกาศนี้</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3 border-b border-surface-border pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-ink-900">ลงขายสินค้า</h1>
          <p className="text-xs text-ink-500">กรอกรายละเอียดให้ครบเพื่อให้ผู้ซื้อตัดสินใจง่ายขึ้น</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-900">รูปสินค้า</p>
          <ImageUploader
            images={images}
            onChange={setImages}
            coverId={coverId}
            onCoverChange={setCoverId}
          />
          {errors.images && <p className="mt-1.5 text-xs font-medium text-red-500">{errors.images}</p>}
        </div>

        <Input
          label="ชื่อสินค้า"
          name="title"
          placeholder="เช่น เสื้อฮู้ดสีดำ Size L สภาพดีมาก"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={200}
        />

        <Textarea
          label="รายละเอียดสินค้า"
          name="description"
          placeholder="บอกสภาพสินค้า เหตุผลที่ขาย ตำหนิ (ถ้ามี) ให้ผู้ซื้อทราบตามจริง"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Select
            label="หมวดหมู่"
            name="categoryId"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {sellableCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select
            label="สภาพสินค้า"
            name="condition"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {conditionOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="ราคาขาย (บาท)"
          name="price"
          type="number"
          min={0}
          placeholder="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={errors.price}
        />

        {/* ─── กฎการลงขาย (ข้อความเตือนสั้นๆ สีแดง) ─── */}
        <div className="rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-600 font-medium flex items-center gap-2">
          <span>⚠️</span>
          <span><strong>กฎการลงขาย:</strong> ห้ามลงขายสินค้าที่ผิดกฎหมาย ละเมิดลิขสิทธิ์ หรือผิดระเบียบของมหาวิทยาลัยโดยเด็ดขาด</span>
        </div>

        {errors.submit && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {errors.submit}
          </div>
        )}

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'กำลังลงประกาศ...' : 'ลงขายสินค้า'}
        </Button>
      </form>
    </div>
  );
}
