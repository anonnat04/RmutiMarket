import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Star, Search, Trash2, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  MessageSquare, User, AlertCircle, CheckCircle2, X
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';

const PAGE_SIZE = 20;

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

function Stars({ rating }) {
  return (
    <div className="flex items-center gap-0.5 text-yellow-400">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={13}
          className={s <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}
        />
      ))}
      <span className="ml-1 font-bold text-gray-700 text-xs">{rating}</span>
    </div>
  );
}

function UserCard({ name, email, avatar, roleLabel }) {
  return (
    <div className="flex items-center gap-2.5">
      {avatar ? (
        <img src={avatar} alt={name} className="h-8 w-8 rounded-full object-cover bg-gray-100 shrink-0" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-600 font-bold text-xs flex items-center justify-center shrink-0">
          {(name || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-gray-900 truncate text-xs">{name}</p>
        {email && <p className="text-[10px] text-gray-400 truncate">{email}</p>}
        {roleLabel && <span className="text-[9px] text-gray-400">{roleLabel}</span>}
      </div>
    </div>
  );
}

export function AdminReviewsPage() {
  const token = useAdminStore((s) => s.token) || useAuthStore((s) => s.token) || localStorage.getItem('cm_admin_token') || localStorage.getItem('cm_token');
  const [searchParams, setSearchParams] = useSearchParams();
  const initialUserId = searchParams.get('userId') || '';

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [userFilter, setUserFilter] = useState(initialUserId);
  const [page, setPage] = useState(1);

  const [reviews, setReviews] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  // Delete modal state
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

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
      const d = await api.adminGetReviews(token, {
        q: debounced,
        userId: userFilter,
        rating: ratingFilter,
        page,
        limit: PAGE_SIZE,
      });
      setReviews(d.reviews || []);
      setTotal(d.total || 0);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, debounced, userFilter, ratingFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setErr('');
    try {
      const res = await api.adminDeleteReview(token, toDelete.id, deleteReason.trim());
      setNotice(res.message || 'ลบรีวิวสำเร็จ');
      setToDelete(null);
      setDeleteReason('');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Star size={22} className="text-yellow-500 fill-yellow-500" />
            จัดการรีวิวและคะแนนผู้ใช้
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            ตรวจสอบรีวิวการซื้อขาย ความคิดเห็น และลบรีวิวที่ผิดระเบียบหรือไม่เหมาะสม
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-500 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
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

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{err}</div>
      )}

      {userFilter && (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
          <span>กำลังกรองเฉพาะรีวิวของผู้ใช้ ID: <strong>{userFilter}</strong></span>
          <button
            onClick={() => {
              setUserFilter('');
              searchParams.delete('userId');
              setSearchParams(searchParams);
            }}
            className="text-xs text-blue-600 underline font-semibold hover:text-blue-800"
          >
            ล้างตัวกรองผู้ใช้
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาข้อความในรีวิว..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-xs text-gray-900 outline-none focus:border-orange-400 focus:bg-white transition-colors"
          />
        </div>
        <select
          value={ratingFilter}
          onChange={(e) => {
            setRatingFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none"
        >
          <option value="">ทุกคะแนนดาว (1 - 5 ⭐)</option>
          <option value="5">5 ดาว ⭐⭐⭐⭐⭐</option>
          <option value="4">4 ดาว ⭐⭐⭐⭐</option>
          <option value="3">3 ดาว ⭐⭐⭐</option>
          <option value="2">2 ดาว ⭐⭐</option>
          <option value="1">1 ดาว ⭐</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[950px] text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <tr>
              <th className="p-4 font-bold">ผู้เขียนรีวิว</th>
              <th className="p-4 font-bold">ผู้ได้รับรีวิว</th>
              <th className="p-4 font-bold">คะแนน</th>
              <th className="p-4 font-bold">ข้อความความคิดเห็น</th>
              <th className="p-4 font-bold">วันที่รีวิว</th>
              <th className="p-4 font-bold text-right">การจัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-800">
            {loading && !reviews.length && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin mr-2" />
                  กำลังโหลดข้อมูลรีวิว...
                </td>
              </tr>
            )}
            {!loading && !reviews.length && !err && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-gray-400">
                  ไม่พบรีวิวในระบบ
                </td>
              </tr>
            )}

            {reviews.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  <UserCard
                    name={r.reviewer_name}
                    email={r.reviewer_email}
                    avatar={r.reviewer_avatar}
                    roleLabel={r.is_anonymous ? '(ไม่ระบุชื่อ)' : 'ผู้รีวิว'}
                  />
                </td>
                <td className="p-4">
                  <UserCard
                    name={r.reviewee_name}
                    email={r.reviewee_email}
                    avatar={r.reviewee_avatar}
                    roleLabel="ผู้ถูกรีวิว"
                  />
                </td>
                <td className="p-4 whitespace-nowrap">
                  <Stars rating={r.rating} />
                </td>
                <td className="p-4 max-w-xs">
                  <p className="text-gray-800 whitespace-pre-wrap line-clamp-3">
                    {r.comment || <span className="text-gray-400 italic">ไม่มีข้อความรีวิว</span>}
                  </p>
                  {r.images && r.images.length > 0 && (
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {r.images.map((img, idx) => (
                        <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                          <img src={img} alt="" className="h-10 w-10 object-cover rounded-lg border border-gray-200 hover:opacity-80" />
                        </a>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-4 text-gray-500 whitespace-nowrap">
                  {fmtDate(r.created_at)}
                </td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => {
                      setToDelete(r);
                      setDeleteReason('');
                    }}
                    className="flex items-center gap-1.5 ml-auto rounded-xl bg-red-50 border border-red-200 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                  >
                    <Trash2 size={12} /> ลบรีวิว
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          แสดง {reviews.length} จาก {total.toLocaleString()} รีวิว
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

      {/* Confirm Delete Modal */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !deleting && setToDelete(null)}>
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">ยืนยันการลบรีวิว</h3>
                <p className="text-xs text-gray-500">รีวิวคะแนน {toDelete.rating} ดาว</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-semibold text-gray-900 mb-1">ข้อความรีวิว:</p>
              <p className="italic">{toDelete.comment || 'ไม่มีข้อความ'}</p>
            </div>

            <label className="mt-4 block text-xs font-semibold text-gray-700">เหตุผลในการลบ</label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              placeholder="เช่น มีคำหยาบคาย, ข้อมูลเท็จ, รีวิวกลั่นแกล้ง"
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs outline-none focus:border-orange-400 focus:bg-white"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                disabled={deleting}
                onClick={() => setToDelete(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                disabled={deleting}
                onClick={confirmDelete}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
              >
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ยืนยันลบรีวิว
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminReviewsPage;
