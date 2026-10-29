import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart } from "lucide-react";
import { useWishlistStore } from "@/store/cartWishlistStore";
import { fetchProducts } from "@/services/productService";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/common/Button";

export function WishlistPage() {
  const navigate = useNavigate();
  const productIds = useWishlistStore((s) => s.productIds);
  const fetchWishlist = useWishlistStore((s) => s.fetchWishlist);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWishlist();
  }, []);

  useEffect(() => {
    fetchProducts().then((all) => {
      setProducts(all.filter((p) => productIds.includes(p.id)));
      setLoading(false);
    });
  }, [productIds]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header with Back button */}
      <div className="flex items-center gap-3 border-b border-surface-border pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-ink-900 flex items-center gap-2">
            <Heart size={20} className="fill-[#f95721] text-[#f95721]" />
            รายการโปรดของฉัน
          </h1>
          <p className="text-xs text-gray-500">
            สินค้าที่คุณบันทึกไว้ ({products.length} รายการ)
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="ยังไม่มีสินค้าที่บันทึกไว้"
          description="กดรูปหัวใจที่การ์ดสินค้าเพื่อบันทึกไว้ดูทีหลัง"
          action={
            <Link to="/products">
              <Button variant="outline" size="sm">
                เลือกดูสินค้า
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

