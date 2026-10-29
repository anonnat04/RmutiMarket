import { ShieldCheck, UserCheck, MessageSquare, Tag } from 'lucide-react';

const features = [
  {
    icon: ShieldCheck,
    title: 'นัดรับปลอดภัย',
    sub: 'นัดรับภายในมหาวิทยาลัย',
  },
  {
    icon: UserCheck,
    title: 'ตรวจสอบผู้ขายได้',
    sub: 'ระบบยืนยันตัวตน',
  },
  {
    icon: MessageSquare,
    title: 'แชทพูดคุยง่าย',
    sub: 'ติดต่อผู้ขายได้ทันที',
  },
  {
    icon: Tag,
    title: 'ลงขายฟรี',
    sub: 'ไม่มีค่าธรรมเนียม',
  },
];

export function FeatureStrip() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
      {features.map((f) => {
        const Icon = f.icon;
        return (
          <div
            key={f.title}
            className="flex items-center gap-2 sm:gap-3 rounded-2xl bg-white border border-gray-100 p-2.5 sm:px-4 sm:py-3.5 shadow-xs hover:border-orange-100 transition-colors"
          >
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#f95721]">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-bold text-ink-900 truncate">{f.title}</p>
              <p className="text-[10px] sm:text-[11px] text-gray-500 truncate">{f.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}