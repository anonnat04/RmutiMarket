import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Package, Store, Archive, FileText, Pencil, Trash2, Tag, CheckCircle, ArrowLeft } from 'lucide-react';
import { useMyListingsStore } from '@/store/myListingsStore';
import { useAuthStore } from '@/store/authStore';
import { ProductCard } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { api } from '@/lib/api';
import { formatListing } from '@/services/productService';

const tabs = [
  { key: 'active', label: 'กำลังขาย', icon: Package, color: 'text-emerald-600' },
  { key: 'reserved', label: 'จองแล้ว', icon: Tag, color: 'text-amber-600' },
  { key: 'sold', label: 'ขายแล้ว', icon: CheckCircle, color: 'text-sky-600' },
  { key: 'draft', label: 'แบบร่าง', icon: FileText, color: 'text-ink-400' },
];

export function MyProductsPage() {
  const navigate = useNavigate();
  const localListings = useMyListingsStore((s) => s.listings);
  const updateStatus = useMyListingsStore((s) => s.updateStatus);
  const [dbListings, setDbListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // แก้ไข: localListings จาก useMyListingsStore ถูก persist ไว้ใน localStorage
  // แบบไม่ผูกกับบัญชีไหนเลย (key เดียวใช้ร่วมกันทุกบัญชีบนเครื่องเดียวกัน)
  // ทำให้สินค้าที่เคยลงขายแบบ optimistic ไว้ตอนใช้บัญชีเก่า ยังค้างอยู่และมา
  // ปนกับสินค้าของบัญชีปัจจุบันตอน merge กับ dbListings (ซึ่งกรองถูกต้องอยู่แล้ว)
  //
  // จุดนี้ตรวจจับเองว่า user id เปลี่ยนไปหรือไม่ (login คนละบัญชี/สลับบัญชี)
  // ถ้าเปลี่ยน จะล้าง localListings ทิ้งทันที ไม่ต้องพึ่งการแก้ authStore.jsx
  // ให้เรียก clearListings() ตอน logout ก็ได้ผลลัพธ์เดียวกัน (แต่ครอบคลุมกว่า
  // เพราะทำงานแม้ authStore.jsx ยังไม่ได้ถูกแก้)
  const currentUserId = useAuthStore((s) => s.user?.id);
  const prevUserIdRef = useRef(currentUserId);

  useEffect(() => {
    if (prevUserIdRef.current !== currentUserId) {
      useMyListingsStore.getState().clearListings();
      prevUserIdRef.current = currentUserId;
    }
  }, [currentUserId]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await api.getMyListings();
        if (res?.listings) {
          setDbListings(res.listings.map(formatListing));
        }
      } catch (err) {
        console.warn("Failed to load my listings from backend:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentUserId]);

  const listings = useMemo(() => {
    const map = new Map();
    dbListings.forEach((p) => map.set(String(p.id), p));
    localListings.forEach((p) => {
      if (!map.has(String(p.id))) map.set(String(p.id), p);
    });
    return Array.from(map.values());
  }, [dbListings, localListings]);

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleting(true);
    try {
      await api.deleteListing(deleteTargetId);
    } catch (e) {
      console.warn("Delete listing API error:", e);
    }
    useMyListingsStore.getState().removeListing(deleteTargetId);
    setDbListings((prev) => prev.filter((p) => String(p.id) !== String(deleteTargetId)));
    setDeleting(false);
    setDeleteTargetId(null);
  };

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateListing(id, { status });
    } catch (e) {
      console.warn("Update listing API error:", e);
    }
    updateStatus(id, status);
    setDbListings((prev) => prev.map((p) => String(p.id) === String(id) ? { ...p, status } : p));
  };

  const filtered = listings.filter((p) => p.status === activeTab);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="flex items-center gap-2 text-xl font-extrabold text-ink-900">
              <Store size={22} className="text-brand-500" />
              สินค้าของฉัน
            </h1>
            <p className="mt-0.5 text-xs text-ink-400">จัดการประกาศขายสินค้าทั้งหมดของคุณ</p>
          </div>
        </div>
        <Link
          to="/products/create"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-orange-600 transition-all"
        >
          <Plus size={16} />
          ลงขายสินค้าใหม่
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        {tabs.map((tab) => {
          const count = listings.filter((p) => p.status === tab.key).length;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-all duration-150 ${
                activeTab === tab.key
                  ? 'border-brand-300 bg-brand-50 shadow-sm'
                  : 'border-surface-border bg-white hover:border-brand-200 hover:bg-surface-muted/60'
              }`}
            >
              <Icon size={18} className={activeTab === tab.key ? 'text-brand-500' : tab.color} />
              <span className={`text-lg font-extrabold ${activeTab === tab.key ? 'text-brand-600' : 'text-ink-900'}`}>
                {count}
              </span>
              <span className={`text-[11px] font-semibold ${activeTab === tab.key ? 'text-brand-600' : 'text-ink-500'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tab indicator */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-brand-500 to-orange-500 text-white shadow-md'
                : 'border border-surface-border bg-white text-ink-600 hover:border-brand-200 hover:bg-brand-50'
            }`}
          >
            {tab.label} ({listings.filter((p) => p.status === tab.key).length})
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="ยังไม่มีสินค้าในหมวดนี้"
          description="ลงขายสินค้าชิ้นแรกของคุณได้เลย ใช้เวลาไม่ถึงนาที"
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p) => (
            <div key={p.id} className="flex flex-col gap-2">
              <ProductCard product={p} />

              {/* Action buttons */}
              <div className="flex gap-1.5">
                <Link
                  to={`/products/${p.id}/edit`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-1.5 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                >
                  <Pencil size={12} />
                  แก้ไข
                </Link>
                <button
                  onClick={() => setDeleteTargetId(p.id)}
                  className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                  title="ลบประกาศ"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="ยืนยันการลบประกาศสินค้านี้?"
        description="เมื่อยืนยันแล้ว ประกาศนี้จะถูกนำออกจากรายการขายทันที"
        confirmLabel="ลบประกาศ"
        cancelLabel="ยกเลิก"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}