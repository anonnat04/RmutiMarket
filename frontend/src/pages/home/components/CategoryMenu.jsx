import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  LayoutGrid,
  Laptop,
  BookOpen,
  Shirt,
  Home,
  Dumbbell,
  Sparkles,
  Car,
  Coffee,
  PawPrint,
  MoreHorizontal,
  PenLine,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { categories } from '@/constants/categories';

const iconMap = {
  Laptop,
  BookOpen,
  Shirt,
  Home,
  Dumbbell,
  Sparkles,
  Car,
  Coffee,
  PawPrint,
  PenLine,
  MoreHorizontal,
  LayoutGrid,
};

export function CategoryBar() {
  const [searchParams] = useSearchParams();
  const currentCat = searchParams.get('category') || 'all';
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 200, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-3">
      {/* Left Arrow (Desktop Only) */}
      <button
        type="button"
        onClick={() => scroll(-1)}
        className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-brand-500 hover:border-brand-300 transition-colors"
        aria-label="เลื่อนหมวดหมู่ไปทางซ้าย"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Scrollable Category List */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-1 md:px-8 py-0.5"
      >
        {categories.map((cat) => {
          const Icon = iconMap[cat.icon] || LayoutGrid;
          const isActive = currentCat === cat.slug;

          return (
            <Link
              key={cat.id}
              to={cat.slug === 'all' ? '/products' : `/products?category=${cat.slug}`}
              className={`flex shrink-0 items-center gap-1.5 md:gap-2 rounded-full px-3.5 py-1.5 md:px-4 md:py-2 text-xs md:text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-orange-50 hover:text-brand-600'
              }`}
            >
              <Icon size={15} className={isActive ? 'text-white' : 'text-gray-400'} />
              <span className="whitespace-nowrap">{cat.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Right Arrow (Desktop Only) */}
      <button
        type="button"
        onClick={() => scroll(1)}
        className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 items-center justify-center rounded-full bg-white border border-gray-200 shadow-md text-gray-500 hover:text-brand-500 hover:border-brand-300 transition-colors"
        aria-label="เลื่อนหมวดหมู่ไปทางขวา"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// Keep the old export name for backward compatibility
export { CategoryBar as CategoryMenu };