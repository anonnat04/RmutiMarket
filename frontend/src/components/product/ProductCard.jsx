import { Link } from "react-router-dom";
import { ImageOff, Heart, Clock } from "lucide-react";
import { formatCurrency } from "@/utils/formatCurrency";
import { formatTimeAgo } from "@/utils/dateTime";
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

  const isNew = product.condition === 'new' || product.condition_id === 1 || String(product.conditionName).includes('หนึ่ง');
  const badgeText = product.badgeText || (isNew ? 'มือหนึ่ง' : 'มือสอง');

  const statusId = Number(product.status_id ?? product.statusId);
  const statusStr = String(product.status || '').toLowerCase();
  const isSold = statusId === 3 || statusStr === 'sold';
  const isReserved = statusId === 2 || statusStr === 'reserved';
  const statusBadge = isSold
    ? { label: 'ขายแล้ว', cls: 'bg-gray-100 text-gray-600 border-gray-200' }
    : isReserved
    ? { label: 'ติดจอง', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
    : product.showStatus
    ? { label: 'ว่าง', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    : null;

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

        {/* Top-left Condition Badge (มือหนึ่ง / มือสอง) */}
        {badgeText && (
          <span className={`absolute left-2 top-2 rounded-md px-2 py-0.5 text-[11px] font-bold text-white shadow-xs ${
            isNew ? "bg-emerald-600" : "bg-orange-500"
          }`}>
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

        {/* Posting Time & Status Badge */}
        <div className="mt-1.5 flex items-center justify-between gap-1.5 text-[11px] text-gray-500">
          <span className="flex items-center gap-1 min-w-0">
            <Clock size={11} className="shrink-0 text-gray-400" />
            <span className="truncate">{formatTimeAgo(product.createdAt || product.created_at)}</span>
          </span>
          {statusBadge && (
            <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-none ${statusBadge.cls}`}>
              {statusBadge.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
