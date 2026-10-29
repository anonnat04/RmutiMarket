import { Link } from "react-router-dom";
import { ImageOff, Heart, MapPin, Clock } from "lucide-react";
import { formatCurrency } from "@/utils/formatCurrency";
import { useWishlistStore } from "@/store/cartWishlistStore";
import { useFeedStore } from "@/store/feedStore";

export function ProductCard({ product }) {
  const cover = product.images?.find((i) => i.isCover) ?? product.images?.[0];
  const isSaved = useWishlistStore((s) => s.isSaved(product.id));
  const toggleWishlist = useWishlistStore((s) => s.toggle);
  const recordView = useFeedStore((s) => s.recordView);
  const recordLike = useFeedStore((s) => s.recordLike);

  const handleLike = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nextSaved = !isSaved;
    toggleWishlist(product.id);
    recordLike(product, nextSaved);
  };

  const handleProductClick = () => {
    recordView(product);
  };

  const badgeText = product.badgeText || (product.condition === 'new' ? 'ใหม่' : null);
  const location = product.location || product.seller?.location || "มทร.อีสาน นครราชสีมา";

  return (
    <Link
      to={`/products/${product.id}`}
      onClick={handleProductClick}
      className="group flex flex-col overflow-hidden rounded-xl bg-white border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Image container */}
      <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
        {cover?.imageUrl ? (
          <img
            src={cover.imageUrl}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-ink-300">
            <ImageOff size={28} />
            <span className="text-[11px]">ไม่มีรูปภาพ</span>
          </div>
        )}

        {/* Top-left Badge */}
        {badgeText && (
          <span className="absolute left-2 top-2 rounded-md bg-brand-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            {badgeText}
          </span>
        )}

        {/* Top-right Heart Button */}
        <button
          type="button"
          onClick={handleLike}
          aria-pressed={isSaved}
          aria-label={isSaved ? "นำออกจากรายการโปรด" : "บันทึกเป็นรายการโปรด"}
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-xs transition-transform duration-150 hover:scale-110 ${
            isSaved ? "text-brand-500" : "text-gray-400 hover:text-brand-500"
          }`}
        >
          <Heart size={14} className={isSaved ? "fill-brand-500 text-brand-500" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col justify-between p-2.5 sm:p-3">
        {/* Title */}
        <h3 className="line-clamp-2 text-[13px] font-medium text-ink-900 leading-snug group-hover:text-brand-600 transition-colors">
          {product.title}
        </h3>

        {/* Price */}
        <div className="mt-1.5 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-base font-extrabold text-brand-500">
            {formatCurrency(product.price)}
          </span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[11px] text-gray-400 line-through">
              {formatCurrency(product.originalPrice)}
            </span>
          )}
        </div>

        {/* Location */}
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
          <MapPin size={10} className="shrink-0" />
          <span className="truncate">{location}</span>
        </div>
      </div>
    </Link>
  );
}
