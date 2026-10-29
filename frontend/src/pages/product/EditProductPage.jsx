import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { categories, categoryFormSchemas } from '@/constants/categories';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { ImageUploader } from '@/components/product/ImageUploader';
import { useMyListingsStore } from '@/store/myListingsStore';
import { fetchProductDetail } from '@/services/productService';
import { api } from '@/lib/api';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

const sellableCategories = categories.filter((c) => c.slug !== 'all');

const CATEGORY_MAP = {
  1: 'cat-electronics',
  2: 'cat-fashion',
  3: 'cat-books',
  4: 'cat-stationery',
  5: 'cat-dorm',
  6: 'cat-beauty',
  7: 'cat-sports',
  8: 'cat-others',
  electronics: 'cat-electronics',
  fashion: 'cat-fashion',
  books: 'cat-books',
  stationery: 'cat-stationery',
  dorm: 'cat-dorm',
  beauty: 'cat-beauty',
  sports: 'cat-sports',
  others: 'cat-others',
};

const conditionOptions = [
  { value: 'new', label: 'มือหนึ่ง (ของใหม่)' },
  { value: 'used_normal', label: 'มือสอง' },
];

export function EditProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const updateListing = useMyListingsStore((s) => s.updateListing);
  const removeListing = useMyListingsStore((s) => s.removeListing);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(sellableCategories[0].id);
  const [condition, setCondition] = useState('used_normal');
  const [productType, setProductType] = useState('used');
  const [images, setImages] = useState([]);
  const [coverId, setCoverId] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProductDetail(id).then((p) => {
      if (p) {
        setTitle(p.title || '');
        setDescription(p.description || '');
        setPrice(String(p.price || ''));

        // แปลง categoryId ให้ตรงกับค่าใน sellableCategories
        let catId = p.categoryId;
        if (!catId || !sellableCategories.some((c) => c.id === catId)) {
          const raw = String(catId || p.category_id || '').replace(/^cat-/, '').toLowerCase();
          catId = CATEGORY_MAP[raw] || CATEGORY_MAP[Number(raw)] || sellableCategories[0].id;
        }
        setCategoryId(catId || sellableCategories[0].id);

        // แปลงสภาพสินค้าให้ตรงกับตัวเลือก new / used_normal
        const isNew =
          p.condition === 'new' ||
          p.condition_id === 1 ||
          String(p.conditionName || p.condition_name || '').includes('หนึ่ง');
        setCondition(isNew ? 'new' : 'used_normal');
        setProductType(isNew ? 'new' : 'used');

        if (p.images && p.images.length > 0) {
          setImages(
            p.images.map((img, idx) => ({
              id: img.id || `img-${idx}`,
              previewUrl: img.imageUrl || img.url,
            }))
          );
          const cover = p.images.find((i) => i.isCover);
          if (cover) setCoverId(cover.id);
        }
      }
      setLoading(false);
    });
  }, [id]);

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
    setSubmitting(true);

    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    const numPrice = Number(price);
    const isNew = condition === 'new' || String(condition).includes('หนึ่ง');
    const condId = isNew ? 1 : 2;
    const condName = isNew ? 'มือหนึ่ง' : 'มือสอง';

    const updatedData = {
      title: cleanTitle,
      description: cleanDesc,
      price: numPrice,
      condition: isNew ? 'new' : 'used_normal',
      condition_id: condId,
      conditionName: condName,
      condition_name: condName,
      product_conditions: { id: condId, name: condName },
      productType: isNew ? 'new' : 'used',
      categoryId,
      images: images.map((img, index) => ({
        id: img.id,
        imageUrl: img.previewUrl || img.imageUrl,
        isCover: coverId ? img.id === coverId : index === 0,
        sortOrder: index,
      })),
      updatedAt: new Date().toISOString(),
    };

    try {
      // บันทึกการแก้ไขไปยัง Backend ฐานข้อมูลจริง
      const res = await api.updateListing(id, {
        title: cleanTitle,
        description: cleanDesc,
        price: numPrice,
        categoryId: String(categoryId).replace(/^cat-/, ''),
        condition: isNew ? 'new' : 'used_good',
        condition_id: condId,
        images: images.map((img) => ({
          url: img.previewUrl || img.imageUrl,
          isCover: coverId ? img.id === coverId : false,
        })),
      });

      if (res?.listing) {
        Object.assign(updatedData, res.listing);
      }
    } catch (apiErr) {
      console.warn("Backend updateListing error:", apiErr);
    }

    updateListing(id, updatedData);
    setSubmitting(false);
    navigate(`/products/${id}`);
  };

  const handleConfirmDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteListing(id);
    } catch (err) {
      console.warn("Backend deleteListing error:", err);
    }
    removeListing(id);
    setDeleting(false);
    setShowDeleteModal(false);
    navigate('/my-products');
  };

  if (loading) {
    return <div className="cm-card h-96 animate-pulse bg-surface-muted mx-auto max-w-2xl" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/my-products"
            className="rounded-xl border border-surface-border p-2 text-ink-700 hover:bg-surface-muted"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ink-900">แก้ไขประกาศสินค้า</h1>
            <p className="text-xs text-ink-500">แก้ไขข้อมูล สภาพสินค้า หรือปรับปรุงราคา</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
        >
          <Trash2 size={14} /> ลบประกาศ
        </button>
      </div>

      <form onSubmit={handleSubmit} className="cm-card p-6 flex flex-col gap-5 border border-surface-border" noValidate>
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
          placeholder="บอกสภาพสินค้า เหตุผลที่ขาย ตำหนิ (ถ้ามี)"
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

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => navigate('/my-products')}
          >
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            <Save size={16} className="mr-1.5" />
            {submitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="ยืนยันการลบประกาศสินค้า?"
        description="เมื่อลบแล้วจะไม่สามารถกู้คืนได้ และประกาศจะถูกนำออกจากตลาดทันที"
        confirmLabel="ลบประกาศ"
        cancelLabel="ยกเลิก"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
