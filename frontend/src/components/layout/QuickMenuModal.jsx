import { NavLink } from 'react-router-dom';
import {
  Home,
  Grid3x3,
  Search,
  Store,
  CalendarClock,
  RotateCcw,
  Award,
  MessageCircle,
  Heart,
  Receipt,
  ShieldCheck,
  Bell,
  PlusCircle,
  User,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const allNavItems = [
  { label: 'หน้าหลัก', path: '/', icon: Home, desc: 'หน้าแรกของตลาด', color: 'bg-sky-50 text-sky-600' },
  { label: 'สินค้าทั้งหมด', path: '/products', icon: Grid3x3, desc: 'ค้นหาและเลือกซื้อสินค้า', color: 'bg-brand-50 text-brand-600' },
  { label: 'ตามหาของ', path: '/want-to-buy', icon: Search, desc: 'โพสต์ตามหาสินค้า', color: 'bg-purple-50 text-purple-600' },
  { label: 'ลงขายสินค้า', path: '/products/create', icon: PlusCircle, desc: 'โพสต์ขายสินค้าของคุณ', color: 'bg-emerald-50 text-emerald-600' },
  { label: 'สินค้าของฉัน', path: '/my-products', icon: Store, desc: 'จัดการประกาศขาย', color: 'bg-amber-50 text-amber-600' },
  { label: 'นัดรับสินค้า', path: '/meetups', icon: CalendarClock, desc: 'เช็คอินและนัดหมาย', color: 'bg-teal-50 text-teal-600' },
  { label: 'การแจ้งเตือน', path: '/notifications', icon: Bell, desc: 'ข้อความแจ้งเตือน', color: 'bg-orange-50 text-orange-600' },
  { label: 'แชทข้อความ', path: '/chat', icon: MessageCircle, desc: 'พูดคุยกับผู้ซื้อ/ผู้ขาย', color: 'bg-indigo-50 text-indigo-600' },
  { label: 'รายการโปรด', path: '/wishlist', icon: Heart, desc: 'สินค้าที่บันทึกไว้', color: 'bg-pink-50 text-pink-600' },
  { label: 'รีวิว & ความน่าเชื่อถือ', path: '/reviews', icon: Award, desc: 'Trust Score และคะแนน', color: 'bg-yellow-50 text-yellow-600' },
  { label: 'ประวัติการซื้อขาย', path: '/transactions', icon: Receipt, desc: 'บิลและประวัติทำรายการ', color: 'bg-slate-50 text-slate-600' },
  { label: 'โปรไฟล์ของฉัน', path: '/profile', icon: User, desc: 'ข้อมูลส่วนตัว & คะแนน', color: 'bg-brand-50 text-brand-700' },
  { label: 'ระบบ Admin', path: '/admin', icon: ShieldCheck, desc: 'Admin Portal', color: 'bg-orange-50 text-orange-600', adminBadge: true },
];

export function QuickMenuModal({ open, onClose }) {
  const user = useAuthStore((s) => s.user);
  if (!open) return null;

  const visibleItems = allNavItems.filter((item) => !item.adminBadge || user?.role === 'admin');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[80vh] animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-surface-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 font-extrabold text-white shadow-sm">
              R
            </span>
            <div>
              <h2 className="text-base font-extrabold text-ink-900 leading-tight">เมนูทั้งหมด</h2>
              <p className="text-[11px] text-ink-400">RmutiMarket — เลือกหน้าที่ต้องการ</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-ink-500 hover:bg-surface-border hover:text-ink-900 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto scrollbar-thin p-4 sm:p-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] flex-1 overscroll-contain">
          <div className="grid grid-cols-3 gap-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `group flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all duration-150 ${
                      isActive
                        ? 'border-brand-300 bg-brand-50 shadow-sm'
                        : 'border-surface-border bg-white hover:border-brand-200 hover:bg-surface-muted/60 hover:shadow-sm'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150 ${
                          isActive ? 'bg-brand-500 text-white shadow-md' : item.color
                        }`}
                      >
                        <Icon size={18} />
                      </span>
                      <div className="w-full">
                        <div className="flex items-center justify-center gap-1">
                          <p className="text-[11px] font-bold leading-snug text-ink-800 line-clamp-2">{item.label}</p>
                          {item.adminBadge && (
                            <span className="shrink-0 rounded bg-orange-500 px-1 text-[8px] font-extrabold text-white">
                              ADM
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
