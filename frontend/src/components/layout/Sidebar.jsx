import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { ChevronDown, LayoutGrid } from 'lucide-react';
import { categories } from '@/constants/categories';

export function Sidebar() {
  const [searchParams] = useSearchParams();
  const currentCat = searchParams.get('category') || 'all';

  // State สำหรับเปิด-ปิด Expand/Collapse
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside className="w-72 shrink-0">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)]">
        {/* แถบหัวข้อสีส้ม (Header Banner) กดเพื่อ Expand / Collapse ได้ */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group flex w-full items-center gap-3 bg-gradient-to-r from-[#FF4F18] to-[#FF7A3D] px-5 py-4 text-white transition-all hover:from-[#FF5A28] hover:to-[#FF8A4D]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <LayoutGrid size={18} className="shrink-0" />
          </span>
          <span className="flex-1 text-left text-sm font-semibold tracking-wide">
            หมวดหมู่ทั้งหมด
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-white/80 transition-transform duration-300 ${
              isOpen ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>

        {/* ส่วนรายการหมวดหมู่แบบ Expandable Animation */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            <nav className="flex flex-col gap-0.5 p-2.5">
              {/* รายการ "ทั้งหมด" */}
              <Link
                to="/products"
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                  currentCat === 'all'
                    ? 'bg-orange-50 text-[#FF4F18]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all ${
                    currentCat === 'all'
                      ? 'bg-[#FF4F18] text-white'
                      : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                  }`}
                >
                  <LayoutGrid size={17} />
                </span>
                <span className="truncate">ทั้งหมด</span>
                {currentCat === 'all' && (
                  <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-[#FF4F18]" />
                )}
              </Link>

              {categories
                .filter((c) => c.slug !== 'all')
                .map((cat) => {
                  const Icon = Icons[cat.icon ?? 'Package'] ?? Icons.Package;
                  const isActive = currentCat === cat.slug;

                  return (
                    <Link
                      key={cat.id}
                      to={`/products?category=${cat.slug}`}
                      className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-orange-50 text-[#FF4F18]'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-[#FF4F18]" />
                      )}
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all ${
                          isActive
                            ? 'bg-[#FF4F18] text-white shadow-sm shadow-orange-200'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                        }`}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="truncate">{cat.name}</span>
                      {isActive && (
                        <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-[#FF4F18]" />
                      )}
                    </Link>
                  );
                })}
            </nav>
          </div>
        </div>
      </div>
    </aside>
  );
}
