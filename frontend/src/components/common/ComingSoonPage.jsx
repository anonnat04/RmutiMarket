import { Link } from "react-router-dom";
import { Construction } from "lucide-react";
export function ComingSoonPage({ title }) {
  return <div className="flex flex-col items-center justify-center gap-3 py-24 text-center"><span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500"><Construction size={26} /></span><h1 className="text-lg font-bold text-ink-900">{title}</h1><p className="max-w-xs text-sm text-ink-500">
        โมดูลนี้กำลังอยู่ระหว่างพัฒนา จะทยอยเปิดใช้งานในเวอร์ชันถัดไป
      </p><Link to="/" className="text-sm font-semibold text-brand-600 hover:underline">
        กลับหน้าหลัก
      </Link></div>;
}
