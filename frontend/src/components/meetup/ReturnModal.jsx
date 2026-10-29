import { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { AlertTriangle } from 'lucide-react';

export function ReturnModal({ open, onClose, onSubmit }) {
  const [reason, setReason] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onSubmit(reason);
    setReason('');
  };

  return (
    <Modal open={open} onClose={onClose} title="ขอคืนสินค้า / คืนเงิน">
      <div className="mb-4 flex items-start gap-3 rounded-xl bg-orange-50 p-3.5 text-xs text-orange-900 border border-orange-200 leading-relaxed">
        <AlertTriangle size={20} className="shrink-0 text-orange-600 mt-0.5" />
        <p>
          คุณสามารถส่งคำร้องขอคืนสินค้าได้ภายใน <strong>3 วัน (72 ชั่วโมง)</strong> หลังจากการยืนยันรับสินค้าเสร็จสิ้น
          <br />
          <span className="text-red-600 font-bold mt-1 inline-block">
            ⚠️ หากสินค้ามีตำหนิไม่ตรงตามที่ผู้ขายแจ้งไว้ ผู้ขายจะถูกตัดคะแนนความน่าเชื่อถือทันที 1 ดาว
          </span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink-700">เหตุผลที่ต้องการคืนสินค้า</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น สินค้ามีรอยขาดที่ไม่ตรงกับที่แจ้งไว้, เปิดไม่ติด..."
            className="w-full rounded-xl border border-surface-border bg-surface-muted px-4 py-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
            rows={4}
            required
          />
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button type="submit" className="flex-1 bg-red-600 hover:bg-red-700" disabled={!reason.trim()}>
            ส่งคำร้องขอคืน
          </Button>
        </div>
      </form>
    </Modal>
  );
}
