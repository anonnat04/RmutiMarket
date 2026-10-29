import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { categories } from '@/constants/categories';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { useWantToBuyStore } from '@/store/wantToBuyStore';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { api } from '@/lib/api';

const sellableCategories = categories.filter((c) => c.slug !== 'all');

export function CreateWantToBuyPage() {
  const navigate = useNavigate();
  const addRequest = useWantToBuyStore((s) => s.addRequest);
  const user = useAuthStore((s) => s.user);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [categoryId, setCategoryId] = useState(sellableCategories[0].id);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next = {};
    if (!title.trim()) next.title = 'กรุณากรอกของที่ต้องการหา';
    if (!budget || Number(budget) <= 0) next.budget = 'กรุณาระบุงบประมาณที่ถูกต้อง';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    let createdPostId;
    try {
      const res = await api.createWantToBuyPost({
        title: title.trim(),
        description: description.trim(),
        budgetMax: Number(budget),
        // ส่ง id หมวดตามที่เลือก (เช่น "cat-fashion") backend จะแปลงเป็น id จริงเอง
        // เดิมส่ง null เมื่อเป็น string ทำให้ backend ปฏิเสธและโพสต์ไม่เคยเข้า DB
        categoryId,
      });
      createdPostId = res?.postId;
    } catch (err) {
      // เดิมแค่ console.warn แล้วบันทึกลงเครื่องต่อ ทำให้โพสต์ดูเหมือนสำเร็จทั้งที่ไม่ได้เข้า DB
      console.error('Create want-to-buy error:', err);
      setErrors((prev) => ({
        ...prev,
        submit: err?.message || 'โพสต์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      }));
      setSubmitting(false);
      return;
    }

    addRequest({
      id: String(createdPostId),
      title: title.trim(),
      description: description.trim(),
      budget: Number(budget),
      categoryId,
      author: {
        id: user?.id ?? 'me',
        name: user?.name ?? 'ฉัน',
      },
      createdAt: new Date().toISOString(),
      status: 'active',
    });

    useNotificationStore.getState().addNotification({
      userId: user?.id ?? 'me',
      title: '📢 โพสตามหาสินค้าสำเร็จ',
      message: `โพสตามหา "${title.trim()}" ถูกเผยแพร่แล้ว รอผู้ขายติดต่อมา`,
      type: 'product',
      link: '/want-to-buy',
    });

    setSubmitting(false);
    navigate('/want-to-buy');
  };

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
          <h1 className="text-xl font-extrabold text-ink-900">โพสตามหาของ</h1>
          <p className="text-xs text-ink-500">
            หาของที่ต้องการไม่เจอ? โพสบอกให้ทุกคนรู้ เผื่อมีใครเก็บไว้ไม่ได้ใช้
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Input
          label="ของที่ต้องการหา"
          name="title"
          placeholder="เช่น หนังสือเรียน Calculus 1, หูฟังไร้สาย..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          maxLength={150}
        />

        <Textarea
          label="รายละเอียดเพิ่มเติม (ถ้ามี)"
          name="description"
          placeholder="บอกสเปค, ขนาด, สี, หรือสภาพที่ยอมรับได้..."
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="งบประมาณ (บาท)"
            name="budget"
            type="number"
            min={1}
            placeholder="เช่น 500"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            error={errors.budget}
          />

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
        </div>

        {errors.submit && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            ⚠️ {errors.submit}
          </div>
        )}

        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? 'กำลังโพส...' : 'โพสตามหาสินค้า'}
        </Button>
      </form>
    </div>
  );
}