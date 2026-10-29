import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Grid3x3, Plus, MessageCircle, Menu } from 'lucide-react';
import { QuickMenuModal } from './QuickMenuModal';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';

export function MobileNav() {
  const location = useLocation();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
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

          {/* 3. ปุ่มลงขาย (เด่นตรงกลางแบบ Center Floating Action) */}
          <NavLink
            to="/products/create"
            className="flex flex-col items-center justify-center -mt-5 group"
          >
            {({ isActive }) => (
              <>
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform duration-200 active:scale-95 border-2 border-white ${
                    isActive
                      ? 'bg-gradient-to-tr from-orange-600 to-amber-500 shadow-orange-300'
                      : 'bg-gradient-to-tr from-brand-500 to-orange-400 shadow-orange-200 group-hover:scale-105'
                  }`}
                >
                  <Plus size={24} className="stroke-[3]" />
                </div>
                <span className="text-[10px] font-extrabold text-brand-600 mt-1">ลงขาย</span>
              </>
            )}
          </NavLink>

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

      <QuickMenuModal open={quickMenuOpen} onClose={() => setQuickMenuOpen(false)} />
    </>
  );
}
