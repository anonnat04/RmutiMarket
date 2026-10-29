import { useEffect, useState } from 'react';
import { fetchProducts } from '@/services/productService';
import { CategoryBar } from './components/CategoryMenu';
import { HeroBanner } from './components/HeroBanner';
import { WantToBuyMarquee } from './components/WantToBuyMarquee';
import { RecommendedProducts } from './components/RecommendedProducts';

export function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts().then((data) => {
      setProducts(data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-5">
      {/* ─── Hero Banner (full width) ─── */}
      <HeroBanner />

      {/* ─── โพสต์ตามหาสินค้า เลื่อนโชว์สดตลอดเวลา (Want To Buy Marquee) ─── */}
      <WantToBuyMarquee />

      {/* ─── Category Horizontal Scrollbar ─── */}
      <CategoryBar />

      {/* ─── สินค้าแนะนำ ─── */}
      <RecommendedProducts products={products} loading={loading} />
    </div>
  );
}