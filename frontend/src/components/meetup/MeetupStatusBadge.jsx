const statusStyles = {
  pending: { label: 'รอตอบรับ', className: 'bg-amber-50 text-amber-600' },
  reschedule_requested: { label: 'ขอเลื่อนนัด', className: 'bg-blue-50 text-blue-600' },
  confirmed: { label: 'นัดหมายแล้ว', className: 'bg-brand-50 text-brand-600' },
  rejected: { label: 'ถูกปฏิเสธ', className: 'bg-red-50 text-red-500' },
  completed: { label: 'ส่งมอบสำเร็จ', className: 'bg-green-50 text-green-600' },
  return_requested: { label: 'ขอคืนสินค้า', className: 'bg-orange-50 text-orange-600' },
  return_accepted: { label: 'ยอมรับการคืน', className: 'bg-green-50 text-green-600' },
  return_rejected: { label: 'ปฏิเสธการคืน', className: 'bg-red-50 text-red-500' },
};

export function MeetupStatusBadge({ status }) {
  const style = statusStyles[status] ?? statusStyles.pending;
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${style.className}`}>
      {style.label}
    </span>
  );
}
