import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingBag, Package, Star,
  ShieldCheck, LogOut, ShieldAlert, Store
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

export function AdminLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    // ถ้าไม่ได้ล็อกอิน หรือไม่ใช่ admin ให้เด้งไปหน้า login
    if (!isAuthenticated || user?.role !== 'admin') {
      navigate('/login', { replace: true });
    }
  }, [isAuthenticated, user?.role, navigate]);

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { label: 'ภาพรวมระบบ', sub: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true },
    { label: 'จัดการผู้ใช้งาน', sub: 'Users', path: '/admin/users', icon: Users },
    { label: 'จัดการประกาศสินค้า', sub: 'Listings', path: '/admin/listings', icon: ShoppingBag },
    { label: 'จัดการรีวิวสินค้า/ผู้ใช้', sub: 'Reviews', path: '/admin/reviews', icon: Star },
    { label: 'สถิติหมวดหมู่สินค้า', sub: 'Categories', path: '/admin/categories', icon: Package },
    { label: 'รายงานและแจ้งปัญหา', sub: 'Reports & Help', path: '/admin/disputes', icon: ShieldAlert },
  ];


  return (
    <div className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      {/* Top Admin Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 font-extrabold text-white text-lg shadow-sm">
            R
          </span>
          <div>
            <span className="font-extrabold text-base tracking-tight text-gray-900">RmutiMarket</span>
            <span className="ml-2 text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full border border-orange-200 font-bold">
              ADMIN PORTAL
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-xs">
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-2.5 sm:px-3 py-1.5 font-bold text-xs text-orange-700 hover:bg-orange-100 transition-colors shadow-2xs"
            title="ไปดูหน้าร้านค้า / หน้าผู้ใช้งานทั่วไป"
          >
            <Store size={15} className="text-orange-600" />
            <span className="hidden sm:inline">ไปหน้าร้านค้า / หน้าผู้ใช้</span>
            <span className="sm:hidden">หน้าร้านค้า</span>
          </Link>

          <div className="hidden md:flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1.5 border border-gray-200 text-gray-700">
            <ShieldCheck size={15} className="text-orange-500" />
            <span>ผู้ดูแลระบบ: <strong className="text-gray-900">{user?.name || user?.display_name || user?.username || 'Admin มทร.อีสาน'}</strong></span>
          </div>

          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 sm:px-3 py-1.5 font-bold text-xs text-red-600 hover:bg-red-500 hover:text-white transition-colors shadow-2xs"
            title="ออกจากระบบ"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      {/* Main Admin Workspace */}
      <div className="flex flex-1">
        {/* Admin Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white p-4 md:flex flex-col justify-between shadow-sm">
          <div>
            <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">เมนูหลัก</p>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-orange-500 text-white shadow-md shadow-orange-100'
                          : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={16} className={isActive ? 'text-white' : 'text-gray-400'} />
                        <div>
                          <div>{item.label}</div>
                          <div className={`text-[9px] font-normal ${isActive ? 'text-orange-100' : 'text-gray-400'}`}>
                            {item.sub}
                          </div>
                        </div>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          <div className="rounded-xl bg-orange-50 border border-orange-100 p-3">
            <p className="text-[10px] font-bold text-orange-700 mb-1">⚠️ Admin Zone</p>
            <p className="text-[9px] text-orange-500 leading-relaxed">
              หน้านี้จำกัดสำหรับผู้ดูแลระบบเท่านั้น การกระทำทั้งหมดถูกบันทึก
            </p>
          </div>
        </aside>

        {/* Content View */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="ยืนยันการออกจากระบบ"
        message="คุณต้องการออกจากระบบผู้ดูแลระบบใช่หรือไม่?"
        confirmText="ออกจากระบบ"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}


