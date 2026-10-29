import { Outlet } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { MobileNav } from '@/components/layout/MobileNav';
import { FloatingAdminContact } from '@/components/common/FloatingAdminContact';

export function MainLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f5f5] relative">
      <Navbar />
      <div className="flex flex-1">
        <main className="flex-1 px-3 py-3 md:px-6 md:py-6 pb-24 md:pb-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
      <FloatingAdminContact />
      <MobileNav />
    </div>
  );
}


