import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles, Settings2 } from 'lucide-react';
import { ProductCard } from '@/components/product/ProductCard';
import { useWishlistStore } from '@/store/cartWishlistStore';
import { useFeedStore } from '@/store/feedStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

export function RecommendedProducts({ products = [], loading }) {
  const wishlistIds = useWishlistStore((s) => s.productIds);
  const viewCounts = useFeedStore((s) => s.viewCounts);
  const likedCategories = useFeedStore((s) => s.likedCategories);
  const searchKeywords = useFeedStore((s) => s.searchKeywords);
  const seededInterests = useFeedStore((s) => s.seededInterests);
  const interests = useAuthStore((s) => s.interests);

  // แก้ไข: เดิม import "interestCategories" จาก constants/categories.jsx
  // ซึ่งถูกลบไปแล้ว (เพราะใช้ id ปลอมแบบ "cat-electronics" ไม่ตรงกับ
  // categories.id จริงใน DB ที่ authStore.interests เก็บอยู่ตอนนี้)
  // แก้เป็นดึงรายชื่อหมวดหมู่จริงจาก backend แทน (มี id, name, color ติดมาด้วยอยู่แล้ว)
  const [dbCategories, setDbCategories] = useState([]);

  useEffect(() => {
    api
      .getCategories()
      .then((res) => setDbCategories(res?.categories || []))
      .catch((err) => console.warn('โหลดหมวดหมู่ไม่สำเร็จ:', err));
  }, []);

  // Compute smart personalized sorting for recommended products
  const smartProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    return useFeedStore.getState().getRecommendedFeed(products, wishlistIds);
  }, [products, wishlistIds, viewCounts, likedCategories, searchKeywords, seededInterests]);

  // ตรวจสอบว่ามีการ personalize แล้วหรือยัง
  const hasInterests = interests && interests.length > 0;
  const hasPersonalization =
    hasInterests ||
    Object.keys(viewCounts).length > 0 ||
    wishlistIds.length > 0 ||
    (searchKeywords && searchKeywords.length > 0);

  // แปลง interest IDs (จาก DB จริง) เป็นชื่อ + สีหมวดหมู่ (จาก DB จริงเช่นกัน)
  const interestLabels = useMemo(() => {
    if (!hasInterests || dbCategories.length === 0) return [];
    return interests
      .map((id) => dbCategories.find((c) => c.id === id))
      .filter(Boolean)
      .slice(0, 4); // แสดงสูงสุด 4 หมวด
  }, [interests, dbCategories]);

  return (
    <section>
      {/* ─── Personalized Interest Banner (แสดงเฉพาะเมื่อมี interests) ─── */}
      {hasInterests && (
        <div className="mb-4 rounded-2xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles size={15} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink-800">
                ฟีดของคุณถูกปรับตามความสนใจแล้ว ✨
              </p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {interestLabels.map((cat) => (
                  <span
                    key={cat.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: cat.color || '#94A3B8' }}
                  >
                    {cat.name}
                  </span>
                ))}
                {interests.length > 4 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                    +{interests.length - 4} อื่นๆ
                  </span>
                )}
              </div>
            </div>
          </div>
          <Link
            to="/register/interests"
            className="shrink-0 flex items-center gap-1 text-xs text-ink-400 hover:text-brand-500 font-medium whitespace-nowrap transition-colors"
          >
            <Settings2 size={13} />
            แก้ไขความสนใจ
          </Link>
        </div>
      )}

      {/* ─── Section Header ─── */}
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-5 sm:h-6 bg-brand-500 rounded-full shrink-0" />
          <h2 className="text-base sm:text-lg font-black text-ink-900 whitespace-nowrap shrink-0">
            สินค้าแนะนำ
          </h2>
          {hasPersonalization && (
            <span className="hidden xs:inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-brand-600 border border-orange-200/70 whitespace-nowrap">
              <Sparkles size={11} className="text-brand-500 shrink-0" />
              <span className="hidden sm:inline">คัดสรรตามความสนใจของคุณ</span>
              <span className="sm:hidden">สำหรับคุณ</span>
            </span>
          )}
        </div>

        <Link
          to="/products"
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-orange-50 hover:bg-orange-100/90 text-[#f95721] px-3 py-1 sm:px-3.5 sm:py-1.5 text-xs sm:text-[13px] font-bold border border-orange-200/80 shadow-2xs hover:border-orange-300 active:scale-95 transition-all"
        >
          <span className="whitespace-nowrap">ดูทั้งหมด</span>
          <ChevronRight size={14} className="stroke-[2.5]" />
        </Link>
      </div>

      {/* ─── Product Grid ─── */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {smartProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}