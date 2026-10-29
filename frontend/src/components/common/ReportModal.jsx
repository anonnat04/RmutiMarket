import { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { ShieldAlert, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { useReportStore } from '@/store/reportStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

const PRODUCT_CATEGORIES = [
  'ต้องสงสัยว่าโกง / ขอให้โอนเงินก่อน',
  'สินค้าผิดกฎหมาย / ผิดระเบียบมหาวิทยาลัย',
  'ข้อมูลสินค้าหรือราคาเป็นเท็จ / หลอกลวง',
  'รูปภาพสินค้าไม่เหมาะสม / ละเมิดลิขสิทธิ์',
  'โพสต์ขายสินค้าซ้ำ / สแปม',
  'อื่นๆ',
];

const POST_CATEGORIES = [
  'โพสต์ขอซื้อสินค้าผิดกฎหมาย / ผิดระเบียบ',
  'มีพฤติกรรมหลอกลวง / สแปม',
  'ใช้คำหยาบคาย / คุกคาม / ก่อกวน',
  'เนื้อหาโพสต์ไม่เหมาะสม',
  'อื่นๆ',
];

export function ReportModal({
  open,
  onClose,
  targetType = 'product', // 'product' | 'wanted_post'
  targetId,
  targetTitle,
  targetUser,
  targetUserId,
}) {
  const user = useAuthStore((s) => s.user);
  const submitReport = useReportStore((s) => s.submitReport);

  const categories = targetType === 'wanted_post' ? POST_CATEGORIES : PRODUCT_CATEGORIES;
  const [category, setCategory] = useState(categories[0]);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim() || loading) return;

    setLoading(true);
    setErrorMsg('');

    const reporterName = user?.name || user?.full_name || user?.display_name || user?.username || 'ผู้ใช้ในระบบ';
    const reporterEmail = user?.email || 'student@rmuti.ac.th';

    const reportData = {
      targetType,
      targetId,
      targetTitle: targetTitle || (targetType === 'product' ? `สินค้า #${targetId}` : `โพสต์ #${targetId}`),
      targetUser: typeof targetUser === 'string' ? targetUser : (targetUser?.name || targetUser?.username || 'ผู้ใช้'),
      targetUserId: targetUserId || (typeof targetUser === 'object' ? targetUser?.id : null),
      reporterName,
      reporterEmail,
      category,
      description: description.trim(),
    };

    try {
      // 1. ส่งไปยัง Backend API
      await api.createReport({
        targetType,
        targetId,
        targetTitle: reportData.targetTitle,
        targetUserId: reportData.targetUserId,
        targetUserName: reportData.targetUser,
        category,
        description: description.trim(),
      });
    } catch (err) {
      console.warn('API createReport error (will sync with local store):', err?.message);
    }

    // 2. ซิงค์ลง local store เสมอ
    submitReport(reportData);

    setLoading(false);
    setSubmitted(true);

    setTimeout(() => {
      setSubmitted(false);
      setDescription('');
      onClose();
    }, 1800);
  };

  const isPost = targetType === 'wanted_post';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPost ? '🚩 รายงานโพสต์ตามหาที่ไม่เหมาะสม' : '🚩 รายงานสินค้าที่ไม่เหมาะสม'}
    >
      {submitted ? (
        <div className="py-8 text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-base font-bold text-ink-900">ส่งรายงานเรียบร้อยแล้ว</h3>
          <p className="text-xs text-ink-500 max-w-xs mx-auto">
            ทีมผู้ดูแลระบบ (Admin) จะตรวจสอบข้อมูลในหน้าข้อพิพาทและดำเนินการตามมาตรการโดยเร็วที่สุด
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 border border-amber-200">
            <ShieldAlert size={18} className="shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">
                รายงานนี้จะถูกส่งไปยัง <strong>ผู้ดูแลระบบ (Admin) หน้าพิพาท</strong>
              </p>
              <p className="text-amber-700 mt-0.5 text-[11px]">
                {targetTitle ? `เป้าหมาย: "${targetTitle}"` : ''}
              </p>
            </div>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-600 border border-red-200">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-bold text-ink-700">หัวข้อการรายงาน <span className="text-red-500">*</span></label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-surface-muted px-3 py-2 text-xs font-semibold text-ink-900 outline-none focus:border-brand-500 focus:bg-white"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-ink-700">
              รายละเอียดและเหตุผลที่รายงาน <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุพฤติกรรม ข้อความที่ไม่เหมาะสม หรือเหตุผลที่ต้องการรายงาน..."
              className="w-full rounded-xl border border-surface-border bg-surface-muted p-3 text-xs text-ink-900 outline-none focus:border-brand-500 focus:bg-white"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
              ยกเลิก
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
              disabled={!description.trim() || loading}
            >
              {loading ? (
                <span className="flex items-center gap-1.5 justify-center">
                  <Loader2 size={14} className="animate-spin" />
                  กำลังส่ง...
                </span>
              ) : (
                'ส่งรายงาน'
              )}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

