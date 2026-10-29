import { useCallback, useEffect, useState } from 'react';
import {
  ShoppingBag, Search, Trash2, RefreshCw, Eye, X, Loader2, ChevronLeft, ChevronRight,
  ImageOff, Info, CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';

const PAGE_SIZE = 20;

const STATUS_META = {
  active: { label: 'ลงขายอยู่', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  reserved: { label: 'ติดจอง', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  sold: { label: 'ขายแล้ว', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const fmtPrice = (p) => `฿${Number(p || 0).toLocaleString()}`;

function Thumb({ src, alt, className = '' }) {
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className}`}>
        <ImageOff size={20} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={`object-cover bg-gray-100 ${className}`} />;
}

function StatusBadge({ status, label }) {
  const meta = STATUS_META[status] || { label: label || status, cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

// ───────────── Modal: รายละเอียดสินค้า ─────────────
function DetailModal({ item, onClose, onDelete }) {
  const [idx, setIdx] = useState(0);
  const imgs = item.images || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
          <X size={18} />
        </button>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Gallery */}
          <div>
            <Thumb src={imgs[idx]} alt={item.title} className="aspect-square w-full rounded-xl" />
            {imgs.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {imgs.map((src, i) => (
                  <button
                    key={src + i}
                    onClick={() => setIdx(i)}
                    className={`overflow-hidden rounded-lg border-2 ${
                      i === idx ? 'border-orange-500' : 'border-transparent'
                    }`}
                  >
                    <Thumb src={src} alt="" className="h-14 w-14" />
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-gray-400">{imgs.length} รูปภาพ</p>
          </div>

          {/* Details */}
          <div className="space-y-4 text-sm">
            <div className="pr-8">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} label={item.status_label} />
                {item.category && <span className="text-[11px] text-gray-500">{item.category}</span>}
              </div>
              <h2 className="text-lg font-extrabold text-gray-900">{item.title}</h2>
              <p className="mt-1 text-xl font-black text-orange-500">{fmtPrice(item.price)}</p>
            </div>

            <div>
              <p className="mb-1 text-xs font-bold text-gray-500">รายละเอียดสินค้า</p>
              <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-[13px] text-gray-700">
                {item.description || 'ผู้ขายไม่ได้ระบุรายละเอียด'}
              </p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-gray-400">สภาพสินค้า</dt>
                <dd className="font-semibold text-gray-800">{item.product_conditions?.name || item.condition_name || item.conditionName || (item.condition === 'new' ? 'มือหนึ่ง' : (item.condition === 'used_good' || item.condition === 'used_normal' ? 'มือสอง' : item.condition)) || '-'}</dd>
              </div>
              <div>
                <dt className="text-gray-400">ยอดเข้าชม</dt>
                <dd className="font-semibold text-gray-800">{(item.view_count ?? 0).toLocaleString()} ครั้ง</dd>
              </div>
              <div>
                <dt className="text-gray-400">ลงประกาศเมื่อ</dt>
                <dd className="font-semibold text-gray-800">{fmtDate(item.created_at)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">แก้ไขล่าสุด</dt>
                <dd className="font-semibold text-gray-800">{fmtDate(item.updated_at)}</dd>
              </div>
              <div>
                <dt className="text-gray-400">ธุรกรรมที่เกี่ยวข้อง</dt>
                <dd className="font-semibold text-gray-800">{item.transaction_count} รายการ</dd>
              </div>
              <div>
                <dt className="text-gray-400">รหัสสินค้า</dt>
                <dd className="font-mono font-semibold text-gray-800">#{item.id}</dd>
              </div>
            </dl>

            <div className="rounded-xl border border-gray-100 p-3">
              <p className="mb-2 text-xs font-bold text-gray-500">ผู้ลงประกาศ</p>
              <div className="flex items-center gap-3">
                {item.seller_avatar ? (
                  <img src={item.seller_avatar} alt="" className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">
                    {(item.seller_name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 text-xs">
                  <p className="font-bold text-gray-900">
                    {item.seller_name}
                    {item.seller_username && (
                      <span className="ml-1 font-normal text-gray-400">@{item.seller_username}</span>
                    )}
                  </p>
                  <p className="text-gray-500">{item.seller_email}</p>
                  {(item.seller_phone || item.seller_faculty) && (
                    <p className="text-gray-400">
                      {[item.seller_faculty, item.seller_phone].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => onDelete(item)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-bold text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
            >
              <Trash2 size={13} /> ลบประกาศนี้
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── Modal: ยืนยันการลบ ─────────────
function DeleteModal({ item, busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">ลบประกาศสินค้า</h3>
            <p className="text-xs text-gray-500 line-clamp-1">{item.title}</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-600">
          ประกาศจะถูกลบออกจากตลาดและผู้ขายจะได้รับแจ้งเตือนพร้อมเหตุผล การกระทำนี้ย้อนกลับไม่ได้
        </p>
        {item.transaction_count > 0 && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-700">
            สินค้านี้มีประวัติธุรกรรม {item.transaction_count} รายการ ระบบจะซ่อนประกาศออกจากตลาดถาวร
            และเก็บประวัติธุรกรรมไว้
          </p>
        )}

        <label className="mt-4 block text-xs font-semibold text-gray-700">เหตุผลในการลบ</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="เช่น สินค้าต้องห้าม, ข้อมูลไม่ตรงความจริง, มีพฤติกรรมหลอกลวง"
          className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs outline-none focus:border-orange-400 focus:bg-white"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            disabled={busy}
            onClick={() => onConfirm(reason.trim())}
            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ยืนยันลบ
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────── Page ─────────────
export function AdminListingsPage() {
  const token = useAdminStore((s) => s.token) || useAuthStore((s) => s.token) || localStorage.getItem('cm_admin_token') || localStorage.getItem('cm_token');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const [detail, setDetail] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await api.adminGetListings(token, {
        q: debounced,
        status: status === 'all' ? '' : status,
        page,
        limit: PAGE_SIZE,
      });
      const list = d.listings || [];
      if (!list.length && page > 1) {
        setPage(page - 1);
        return;
      }
      setItems(list);
      setTotal(d.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, debounced, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async (reason) => {
    setDeleting(true);
    setErr('');
    try {
      const r = await api.adminDeleteListing(token, toDelete.id, reason);
      setNotice(r.message || 'ลบประกาศเรียบร้อยแล้ว');
      setToDelete(null);
      setDetail(null);
      await load();
    } catch (e) {
      setErr(e.message);
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <ShoppingBag size={22} className="text-orange-500" />
            จัดการประกาศสินค้า
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">ตรวจสอบรูปและรายละเอียดสินค้า และลบประกาศที่ผิดระเบียบ</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-500 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 p-3.5 text-xs text-orange-800">
        <Info size={15} className="shrink-0" />
        <span>แอดมินลบประกาศที่ผิดระเบียบได้ แต่ไม่สามารถเปลี่ยนสถานะเป็น "จอง" หรือ "ขายแล้ว" ได้</span>
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={14} /> {notice}
          </span>
          <button onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}
      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{err}</div>}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อประกาศ, ชื่อผู้ขาย, อีเมลผู้ขาย..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-xs outline-none focus:border-orange-400 focus:bg-white transition-colors"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none"
        >
          <option value="all">ทุกสถานะ</option>
          <option value="active">ลงขายอยู่</option>
          <option value="reserved">ติดจอง</option>
          <option value="sold">ขายแล้ว</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <tr>
              <th className="p-4 font-bold">สินค้า</th>
              <th className="p-4 font-bold">ราคา</th>
              <th className="p-4 font-bold">ผู้ลงประกาศ</th>
              <th className="p-4 font-bold text-center">สถานะ</th>
              <th className="p-4 font-bold text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-800">
            {loading && !items.length && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin mr-2" />
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && !items.length && !err && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  ไม่พบประกาศสินค้า
                </td>
              </tr>
            )}

            {items.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setDetail(l)} className="relative shrink-0">
                      <Thumb
                        src={l.images && l.images[0]}
                        alt={l.title}
                        className="h-16 w-16 rounded-xl"
                      />
                      {l.images && l.images.length > 1 && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[9px] font-bold text-white">
                          {l.images.length}
                        </span>
                      )}
                    </button>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 line-clamp-1">{l.title}</p>
                      <p className="text-[11px] text-gray-500">
                        {[l.category, l.product_conditions?.name || l.condition_name || l.conditionName || (l.condition === 'new' ? 'มือหนึ่ง' : (l.condition === 'used_good' || l.condition === 'used_normal' ? 'มือสอง' : l.condition))].filter(Boolean).join(' · ') || '-'}
                      </p>
                      {l.description && (
                        <p className="mt-0.5 max-w-xs text-[11px] text-gray-400 line-clamp-2">{l.description}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-gray-400">
                        {fmtDate(l.created_at)} · {(l.view_count ?? 0).toLocaleString()} views
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-4 font-extrabold text-orange-500 whitespace-nowrap">{fmtPrice(l.price)}</td>
                <td className="p-4">
                  <p className="font-medium text-gray-800">{l.seller_name}</p>
                  <p className="text-[11px] text-gray-400">{l.seller_email}</p>
                </td>
                <td className="p-4 text-center">
                  <StatusBadge status={l.status} label={l.status_label} />
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setDetail(l)}
                      className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600 hover:border-orange-300 hover:text-orange-500 transition-colors"
                    >
                      <Eye size={12} /> ดูรายละเอียด
                    </button>
                    <button
                      onClick={() => setToDelete(l)}
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                    >
                      <Trash2 size={12} /> ลบ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          แสดง {items.length} จาก {total.toLocaleString()} รายการ
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white p-1.5 disabled:opacity-40 hover:border-orange-300"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            หน้า {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white p-1.5 disabled:opacity-40 hover:border-orange-300"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {detail && (
        <DetailModal item={detail} onClose={() => setDetail(null)} onDelete={(it) => setToDelete(it)} />
      )}
      {toDelete && (
        <DeleteModal
          item={toDelete}
          busy={deleting}
          onCancel={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

export default AdminListingsPage;
