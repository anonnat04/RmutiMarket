import { useState, useEffect } from 'react';
import { useMyListingsStore } from '@/store/myListingsStore';
import { useAuthStore } from '@/store/authStore';
import { Modal } from '@/components/common/Modal';
import { EmptyState } from '@/components/common/EmptyState';
import { ShoppingBag, Tag, AlertCircle, Lock, CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency } from '@/utils/formatCurrency';
import { api } from '@/lib/api';
import { formatListing } from '@/services/productService';

// สถานะที่ไม่ว่าง / ไม่พร้อมขาย (จองแล้ว, ขายแล้ว, แบบร่าง, ปิดการขาย)
const UNAVAILABLE_STATUSES = new Set(['reserved', 'sold', 'draft', 'inactive', 'closed']);

/**
 * OfferProductModal
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - onSelectProduct: (product) => void
 *  - wantToBuyPost: { id, title, budget, categoryId, categoryName } | null
 *
 * เงื่อนไขตามที่ผู้ใช้กำหนด:
 *  1. ต้องเป็นสินค้าของผู้ใช้ที่ล็อกอินอยู่เท่านั้น (ดึงจาก my listings ของตนเอง)
 *  2. ต้องเป็นสินค้าที่ "ว่าง" เท่านั้น (status === 'active', ไม่ใช่ จองแล้ว หรือ ขายแล้ว)
 *  3. หมวดหมู่สินค้าต้องตรงกับที่คนโพสตามหา ถึงจะกดเสนอขายไปยังช่องแชทได้
 */
export function OfferProductModal({ isOpen, onClose, onSelectProduct, wantToBuyPost = null, isSubmitting = false }) {
  const currentUser = useAuthStore((s) => s.user);
  const storeListings = useMyListingsStore((s) => s.listings);
  const [dbListings, setDbListings] = useState([]);
  const [loading, setLoading] = useState(false);

  // ดึงรายการสินค้าของฉันจาก backend เมื่อเปิด Modal
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.getMyListings()
      .then((res) => {
        if (res?.listings && Array.isArray(res.listings)) {
          setDbListings(res.listings.map(formatListing).filter(Boolean));
        }
      })
      .catch((err) => {
        console.warn("OfferProductModal getMyListings error:", err);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  // รวมรายการสินค้าจาก DB และ local store (ป้องกันรายการซ้ำด้วย ID)
  const mergedListings = (() => {
    const map = new Map();
    dbListings.forEach((p) => map.set(String(p.id), p));
    storeListings.forEach((p) => {
      if (!map.has(String(p.id))) map.set(String(p.id), p);
    });
    return Array.from(map.values());
  })();

  // 1. กรองเฉพาะสินค้าของตนเองและต้อง "ว่าง / กำลังขาย" (active) เท่านั้น
  const myActiveListings = mergedListings.filter((p) => {
    // ต้องไม่เป็นสถานะที่ไม่ว่าง (reserved, sold, draft, ฯลฯ)
    if (UNAVAILABLE_STATUSES.has(p.status)) return false;
    if (p.status && p.status !== 'active') return false;

    // ตรวจสอบความเป็นเจ้าของ หากมี seller id ชัดเจนและไม่ใช่ placeholder
    const sellerId = p.seller?.id || p.seller_id;
    if (
      sellerId &&
      sellerId !== 'seller-unknown' &&
      currentUser?.id &&
      String(sellerId) !== String(currentUser.id)
    ) {
      return false;
    }

    return true;
  });

  // ฟังก์ชันตรวจสอบความตรงกันของหมวดหมู่ระหว่าง สินค้า กับ โพสตามหา
  const isCategoryMatched = (product, wtb) => {
    if (!wtb) return true;
    if (!wtb.categoryId || wtb.categoryId === 'all' || wtb.categoryId === 'cat-1') return true;

    const norm = (v) => String(v || '').toLowerCase().replace(/^cat-/, '').trim();
    const pSlug = norm(product.categoryId || product.category?.slug || product.categories?.slug);
    const wSlug = norm(wtb.categoryId || wtb.category_id);

    // เช็คด้วย slug เช่น 'books', 'electronics'
    if (pSlug && wSlug && pSlug === wSlug) return true;

    // เช็คด้วยตัวเลข ID
    const pId = String(product.category_id || product.category?.id || product.categories?.id || '');
    const wId = String(wtb.category_id || '');
    if (pId && wId && pId === wId) return true;

    // เช็คด้วยชื่อหมวดหมู่ภาษาไทย
    const pName = String(product.categoryName || product.category?.name || product.categories?.name || '').trim();
    const wName = String(wtb.categoryName || '').trim();
    if (pName && wName && (pName === wName || pName.includes(wName) || wName.includes(pName))) return true;

    return false;
  };

  // แยกสินค้าเป็น: 1) หมวดหมู่ตรง (เสนอขายได้) และ 2) หมวดหมู่อื่น (ไม่ตรงเงื่อนไข กดไม่ได้)
  const matchedListings = myActiveListings.filter((p) => isCategoryMatched(p, wantToBuyPost));
  const unmatchedListings = myActiveListings.filter((p) => !isCategoryMatched(p, wantToBuyPost));

  const targetCategoryLabel = wantToBuyPost?.categoryName || wantToBuyPost?.categoryId?.replace(/^cat-/, '') || 'หมวดหมู่ที่ระบุ';

  return (
    <Modal open={isOpen} onClose={onClose} title="เลือกสินค้าที่ต้องการเสนอขาย">
      <div className="flex flex-col gap-4">

        {/* ข้อมูลโพสที่กำลังจะเสนอขายให้ */}
        {wantToBuyPost && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-3.5 text-sm">
            <p className="font-bold text-brand-700 text-xs mb-1 flex items-center gap-1.5">
              <Tag size={13} /> กำลังเสนอขายให้กับโพสตามหา:
            </p>
            <p className="font-bold text-ink-900 text-base">{wantToBuyPost.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {wantToBuyPost.budget > 0 && (
                <span className="font-extrabold text-brand-600 bg-white border border-brand-200 px-2 py-0.5 rounded-lg">
                  งบ: {formatCurrency(wantToBuyPost.budget)}
                </span>
              )}
              <span className="text-ink-500 bg-white border border-surface-border px-2 py-0.5 rounded-lg">
                หมวดหมู่: <strong className="text-ink-800">{targetCategoryLabel}</strong>
              </span>
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              * เงื่อนไข: เสนอขายได้เฉพาะสินค้าของคุณที่ <strong>ว่างพร้อมขาย</strong> และ <strong>หมวดหมู่ตรงกัน</strong> เท่านั้น
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-ink-400">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent mr-2" />
            กำลังโหลดสินค้าของคุณ...
          </div>
        ) : myActiveListings.length === 0 ? (
          /* กรณีไม่มีสินค้าที่ว่างเลย (อาจยังไม่เคยลงขาย หรือถูกจอง/ขายหมดแล้ว) */
          <EmptyState
            title="ไม่มีสินค้าว่างพร้อมขายในขณะนี้"
            description="สินค้าทั้งหมดของคุณอาจถูกจอง ขายไปแล้ว หรือคุณยังไม่ได้ลงขายสินค้า กรุณาลงขายสินค้าใหม่ก่อนเสนอขาย"
            icon={Lock}
          />
        ) : (
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {/* แสดงสินค้าที่หมวดหมู่ตรงกับโพสตามหา (สามารถกดเสนอขายได้) */}
            {matchedListings.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 size={14} /> สินค้าที่ตรงเงื่อนไข ({matchedListings.length} ชิ้น)
                </p>
                <div className="grid gap-2.5">
                  {matchedListings.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onSelect={onSelectProduct}
                      canOffer={true}
                      isSubmitting={isSubmitting}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* แสดงสินค้าที่ว่างแต่หมวดหมู่ไม่ตรง (ปิดการกด พร้อมอธิบายชัดเจน) */}
            {unmatchedListings.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-surface-border">
                <p className="text-xs font-semibold text-ink-500 flex items-center gap-1">
                  <XCircle size={14} className="text-amber-500" />
                  สินค้าอื่นของคุณที่ว่างอยู่ (หมวดหมู่ไม่ตรง — ไม่สามารถเสนอขายโพสนี้ได้)
                </p>
                <div className="grid gap-2.5">
                  {unmatchedListings.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      canOffer={false}
                      reason={`หมวดหมู่ ${product.categoryName || 'ไม่ตรงกับ'} (${targetCategoryLabel})`}
                      isSubmitting={isSubmitting}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ถ้าไม่มีสินค้าที่ตรงหมวดเลย */}
            {matchedListings.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                <AlertCircle size={24} className="text-amber-500 mx-auto mb-2" />
                <p className="font-bold text-ink-900 text-sm">ไม่มีสินค้าในหมวดหมู่นี้</p>
                <p className="text-xs text-ink-500 mt-1">
                  คุณมีสินค้าว่างในระบบ แต่หมวดหมู่ไม่ตรงกับที่คนซื้อตามหา ({targetCategoryLabel}) จึงไม่สามารถเสนอขายได้
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function formatConditionThai(cond, prod) {
  if (prod?.product_conditions?.name) return prod.product_conditions.name;
  if (prod?.condition_name || prod?.conditionName) return prod.condition_name || prod.conditionName;
  if (!cond) return 'มือสอง';
  const c = String(cond).toLowerCase().trim();
  if (c === 'new' || c === 'like_new' || c === 'มือหนึ่ง' || c === '1' || c.includes('หนึ่ง')) return 'มือหนึ่ง';
  return 'มือสอง';
}

function ProductRow({ product, onSelect, canOffer = true, reason = '', isSubmitting = false }) {
  const conditionLabel = formatConditionThai(product.condition, product);

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
        canOffer
          ? 'border-surface-border bg-white hover:border-brand-500 hover:shadow-xs'
          : 'border-dashed border-gray-200 bg-gray-50/70 opacity-60'
      }`}
    >
      <div className="w-14 h-14 rounded-xl bg-surface-muted overflow-hidden shrink-0 border border-surface-border">
        {product.images?.[0]?.imageUrl || product.productImage ? (
          <img
            src={product.images?.[0]?.imageUrl || product.productImage}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-300">
            <ShoppingBag size={18} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm text-ink-900 truncate">{product.title}</p>
        <p className="text-brand-600 font-extrabold text-sm mt-0.5">{formatCurrency(product.price)}</p>
        
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            ● ว่าง
          </span>
          <span className="text-[10px] text-ink-600 font-medium bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
            ✨ สภาพ: {conditionLabel}
          </span>
          {product.categoryName && (
            <span className="text-[10px] text-ink-400 bg-white border border-surface-border px-1.5 py-0.5 rounded-full">
              หมวด: {product.categoryName}
            </span>
          )}
          {!canOffer && reason && (
            <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded-full">
              {reason}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-xs text-ink-500 mt-1 line-clamp-1 bg-surface-muted/50 px-2 py-0.5 rounded-md">
            📝 {product.description}
          </p>
        )}
      </div>

      <div className="shrink-0">
        {canOffer ? (
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onSelect && onSelect(product)}
            className="rounded-full bg-gradient-to-r from-brand-500 to-orange-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:from-brand-600 hover:to-orange-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'กำลังส่ง...' : 'เสนอขาย'}
          </button>
        ) : (
          <span className="rounded-full bg-gray-200 px-3 py-1 text-[11px] font-semibold text-gray-500">
            ไม่ตรงเงื่อนไข
          </span>
        )}
      </div>
    </div>
  );
}
