import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Grid3x3, Plus, MessageCircle, Menu, PlusCircle, Search, X } from 'lucide-react';
import { QuickMenuModal } from './QuickMenuModal';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) => s.getUnreadCount(user?.id ?? 'me'));
  const unreadChatCount = useChatStore((s) => s.unreadCount);

  // บนหน้ารายละเอียดสินค้า จะใช้ Sticky Action Bar ของสินค้านั้นแทน เพื่อให้กด ซื้อ/แชท/บันทึก ได้สะดวก
  const isProductDetailPage = /^\/products\/[^/]+$/.test(location.pathname) && location.pathname !== '/products/create';
  if (isProductDetailPage) {
    return null;
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200/80 bg-white/95 backdrop-blur-md md:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom,0px)]">
        <div className="grid grid-cols-5 h-16 items-center px-1">
          {/* 1. หน้าหลัก */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-all ${
                isActive ? 'text-brand-500 font-bold' : 'text-gray-400 hover:text-gray-700'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`p-1 rounded-xl transition-all ${isActive ? 'bg-orange-50 text-brand-500' : ''}`}>
                  <Home size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
                </span>
                <span>หน้าแรก</span>
              </>
            )}
          </NavLink>

          {/* 2. ค้นหาสินค้า */}
          <NavLink
            to="/products"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-all ${
                isActive ? 'text-brand-500 font-bold' : 'text-gray-400 hover:text-gray-700'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`p-1 rounded-xl transition-all ${isActive ? 'bg-orange-50 text-brand-500' : ''}`}>
                  <Grid3x3 size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
                </span>
                <span>สินค้า</span>
              </>
            )}
          </NavLink>

          {/* 3. ปุ่มลงขาย / โพสต์ตามหา (Center Floating Action แยกเป็น 2 ตัวเลือกเมื่อกด) */}
          <button
            type="button"
            onClick={() => setCreateMenuOpen((prev) => !prev)}
            className="flex flex-col items-center justify-center -mt-5 group"
            aria-label="สร้างโพสต์ใหม่"
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-200 active:scale-95 border-2 border-white ${
                createMenuOpen
                  ? 'bg-gray-800 shadow-gray-400 rotate-45'
                  : 'bg-gradient-to-tr from-brand-500 to-orange-400 shadow-orange-300 group-hover:scale-105'
              }`}
            >
              <Plus size={24} className="stroke-[3]" />
            </div>
            <span className="text-[10px] font-extrabold text-brand-600 mt-1">ลงขาย</span>
          </button>

          {/* 4. แชท */}
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-all ${
                isActive ? 'text-brand-500 font-bold' : 'text-gray-400 hover:text-gray-700'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`relative p-1 rounded-xl transition-all ${isActive ? 'bg-orange-50 text-brand-500' : ''}`}>
                  <MessageCircle size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
                  {unreadChatCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-brand-500 text-[9px] font-black text-white px-1 border-2 border-white shadow-xs">
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </span>
                  )}
                </span>
                <span>แชท</span>
              </>
            )}
          </NavLink>

          {/* 5. เมนูเพิ่มเติม */}
          <button
            type="button"
            onClick={() => setQuickMenuOpen(true)}
            className={`flex flex-col items-center justify-center gap-1 py-1 text-[11px] font-semibold transition-all ${
              quickMenuOpen ? 'text-brand-500 font-bold' : 'text-gray-400 hover:text-gray-700'
            }`}
          >
            <span className={`relative p-1 rounded-xl transition-all ${quickMenuOpen ? 'bg-orange-50 text-brand-500' : ''}`}>
              <Menu size={20} className={quickMenuOpen ? 'stroke-[2.5]' : 'stroke-[1.8]'} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-black text-white border-2 border-white shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </span>
            <span>เมนู</span>
          </button>
        </div>
      </nav>

      {/* ─── Create Action Sheet (แยก 2 ตัวเลือก: ลงขายสินค้า / โพสต์ตามหาสินค้า) ─── */}
      {createMenuOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+74px)] animate-fade-in md:hidden"
          onClick={() => setCreateMenuOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-4 shadow-2xl space-y-2.5 border border-gray-100 animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-1 px-1">
              <span className="text-xs font-bold text-gray-500">เลือกประเภทที่ต้องการ</span>
              <button
                type="button"
                onClick={() => setCreateMenuOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="ปิดเมนู"
              >
                <X size={16} />
              </button>
            </div>

            {/* ปุ่ม 1: ลงขายสินค้า */}
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                navigate('/products/create');
              }}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50/50 border border-orange-200/80 hover:border-orange-300 text-left transition-all active:scale-[0.98] group"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f95721] to-orange-500 text-white shadow-sm group-hover:scale-105 transition-transform">
                <PlusCircle size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-ink-900 group-hover:text-[#f95721] transition-colors flex items-center justify-between">
                  <span>ลงขายสินค้า</span>
                  <span className="text-[11px] font-bold text-orange-500">ขายของ &rarr;</span>
                </p>
                <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                  มีของอยากส่งต่อ โพสต์ขายในรั้ว มทร.อีสาน
                </p>
              </div>
            </button>

            {/* ปุ่ม 2: โพสต์ตามหาสินค้า */}
            <button
              type="button"
              onClick={() => {
                setCreateMenuOpen(false);
                navigate('/want-to-buy/create');
              }}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-gradient-to-r from-purple-50 to-indigo-50/50 border border-purple-200/80 hover:border-purple-300 text-left transition-all active:scale-[0.98] group"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-sm group-hover:scale-105 transition-transform">
                <Search size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-ink-900 group-hover:text-purple-600 transition-colors flex items-center justify-between">
                  <span>โพสต์ตามหาสินค้า</span>
                  <span className="text-[11px] font-bold text-purple-600">ตามหาของ &rarr;</span>
                </p>
                <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                  กำลังหาของชิ้นไหน โพสต์ให้เพื่อนๆ มาเสนอขาย
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      <QuickMenuModal open={quickMenuOpen} onClose={() => setQuickMenuOpen(false)} />
    </>
  );
}
