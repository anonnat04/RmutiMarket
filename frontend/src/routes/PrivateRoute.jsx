import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

/**
 * PrivateRoute — บังคับล็อกอินก่อนเข้าใช้งาน
 * หากยังไม่ได้เข้าสู่ระบบ จะ Redirect ไปที่ /login พร้อมเก็บ path เดิมไว้
 * เพื่อให้เมื่อล็อกอินเสร็จแล้ว ระบบจะพากลับมาทำธุรกรรมต่อได้ทันที
 */
export function PrivateRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const location = useLocation();

  // หาก Zustand persist ยังโหลด session จาก localStorage ไม่เสร็จ ให้รอก่อน
  // ป้องกันการเด้งไปหน้า login ก่อนเวลาอันควรเมื่อผู้ใช้รีเฟรชหน้าเว็บ
  if (!isHydrated) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }

  return <Outlet />;
}
