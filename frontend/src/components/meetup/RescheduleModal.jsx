import { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { Button } from '@/components/common/Button';

export function RescheduleModal({ open, onClose, onSubmit, title = 'ขอเลื่อนนัด' }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!date || !time) {
      setError('กรุณาเลือกวันและเวลาใหม่');
      return;
    }
    onSubmit({ date, time, reason });
    setDate('');
    setTime('');
    setReason('');
    setError('');
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="วันที่ใหม่" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="เวลาใหม่" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Textarea
          label="เหตุผล (ถ้ามี)"
          rows={3}
          placeholder="เช่น ติดเรียนช่วงเวลานั้น"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        <Button type="submit">ส่งข้อเสนอ</Button>
      </form>
    </Modal>
  );
}
