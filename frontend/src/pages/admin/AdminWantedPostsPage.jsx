import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Trash2, RefreshCw, Eye, X, Loader2, ChevronLeft, ChevronRight,
  Info, CheckCircle2, ShieldCheck, ExternalLink, Filter, HelpCircle,
  Tag, Clock, User, Phone, Mail, GraduationCap, AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';
import { categories } from '@/constants/categories';

const PAGE_SIZE = 20;

const STATUS_META = {
  active: { label: 'กำลังตามหา', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  matched: { label: 'เจอสินค้าแล้ว', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  cancelled: { label: 'ยกเลิกโพสต์', cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  expired: { label: 'ครบ 7 วัน (หมดอายุ)', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  return dt.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtBudget = (min, max, budget) => {
  const nMin = min != null ? Number(min) : null;
  const nMax = max != null ? Number(max) : null;
  const nB = budget != null ? Number(budget) : null;

  if (nMin && nMax && nMin !== nMax) {
    return `฿${nMin.toLocaleString()} - ฿${nMax.toLocaleString()}`;
  }
  const single = nMax || nMin || nB;
  if (single && single > 0) {
    return `฿${single.toLocaleString()}`;
  }
  return 'ไม่ระบุงบ';
};

const trustCls = (n) => (n >= 80 ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : n >= 50 ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-red-600 bg-red-50 border-red-200');

function Avatar({ src, name, size = 38 }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        style={style}
        className="rounded-full object-cover bg-gray-100 shrink-0 border border-gray-200"
      />
    );
  }
  return (
    <div
      style={style}
      className="rounded-full bg-orange-100 text-orange-600 font-bold text-sm flex items-center justify-center shrink-0 border border-orange-200"
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function StatusBadge({ status, label }) {
  const meta = STATUS_META[status] || { label: label || status, cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${meta.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ───────────── Modal: รายละเอียดโพสต์ตามหา ─────────────
function DetailModal({ post, onClose, onDelete, onStatusChange, updatingStatus }) {
  const [selectedStatus, setSelectedStatus] = useState(post.status_id || (post.status === 'matched' ? 2 : post.status === 'cancelled' ? 3 : post.status === 'expired' ? 4 : 1));
  const buyer = post.buyer || post.user || {};
  const score = buyer.trust_score ?? buyer.trustScore ?? 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-5 pb-4 border-b border-gray-100 pr-8">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-gray-400">รหัสโพสต์ #{post.id}</span>
            <StatusBadge status={post.status} label={post.statusName} />
            <span className="rounded-md bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700 border border-orange-200">
              {post.categoryName || post.categories?.name || 'ทั่วไป'}
            </span>
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 leading-snug">{post.title}</h2>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xs text-gray-500">งบประมาณที่ต้องการ:</span>
            <span className="text-lg font-black text-orange-600">
              {fmtBudget(post.budgetMin, post.budgetMax, post.budget)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-5">
          {/* ข้อมูลผู้โพสต์ (Buyer Profile Card) */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4">
            <p className="text-xs font-bold text-gray-500 mb-3 flex items-center gap-1.5">
              <User size={14} className="text-orange-500" /> ข้อมูลผู้โพสต์ตามหาสินค้า
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Avatar
                  src={buyer.avatar_url || buyer.profile_image_url}
                  name={buyer.full_name || buyer.username}
                  size={46}
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-gray-900">{buyer.full_name || buyer.username || 'สมาชิก RMUTI'}</span>
                    {buyer.username && <span className="text-xs text-gray-400">(@{buyer.username})</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {buyer.university_email && (
                      <span className="flex items-center gap-1">
                        <Mail size={12} /> {buyer.university_email}
                      </span>
                    )}
                    {buyer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} /> {buyer.phone}
                      </span>
                    )}
                  </div>
                  {(buyer.faculties?.name || buyer.faculty_name) && (
                    <p className="mt-0.5 text-[11px] text-gray-400 flex items-center gap-1">
                      <GraduationCap size={12} />
                      {buyer.faculties?.name || buyer.faculty_name} {buyer.majors?.name ? `• ${buyer.majors.name}` : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex sm:flex-col items-center sm:items-end gap-2 w-full sm:w-auto justify-between sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border ${trustCls(score)}`}>
                  <ShieldCheck size={13} /> Trust Score {score}
                </span>
                {buyer.id && (
                  <Link
                    to={`/profile/${buyer.id}`}
                    target="_blank"
                    className="text-[11px] text-orange-600 hover:text-orange-700 font-semibold inline-flex items-center gap-1 hover:underline"
                  >
                    ดูโปรไฟล์สาธารณะ <ExternalLink size={10} />
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* รายละเอียดสิ่งที่ต้องการ */}
          <div>
            <p className="mb-1.5 text-xs font-bold text-gray-500">รายละเอียดเพิ่มเติม</p>
            <div className="whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800 leading-relaxed min-h-[80px]">
              {post.description || <span className="italic text-gray-400">ผู้โพสต์ไม่ได้ระบุรายละเอียดเพิ่มเติม</span>}
            </div>
          </div>

          {/* ไทม์ไลน์วันเวลา */}
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
            <div>
              <span className="text-gray-400">วันที่สร้างโพสต์:</span>
              <p className="font-semibold text-gray-800 mt-0.5">{fmtDate(post.created_at)}</p>
            </div>
            <div>
              <span className="text-gray-400">อัปเดตล่าสุด:</span>
              <p className="font-semibold text-gray-800 mt-0.5">{fmtDate(post.updated_at || post.created_at)}</p>
            </div>
          </div>

          {/* การปรับสถานะโดยแอดมิน */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-xs font-bold text-blue-900 mb-2 flex items-center gap-1.5">
              <RefreshCw size={13} className="text-blue-600" /> ปรับเปลี่ยนสถานะโพสต์ (Admin Action)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(Number(e.target.value))}
                className="rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800 outline-none focus:border-blue-400"
              >
                <option value={1}>1 - กำลังตามหา (ACTIVE)</option>
                <option value={2}>2 - เจอสินค้าแล้ว (MATCHED)</option>
                <option value={3}>3 - ยกเลิกโพสต์ (CANCELLED)</option>
                <option value={4}>4 - ครบ 7 วัน / หมดอายุ (EXPIRED)</option>
              </select>

              <button
                disabled={updatingStatus || selectedStatus === post.status_id}
                onClick={() => onStatusChange(post.id, selectedStatus)}
                className="flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {updatingStatus ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                บันทึกสถานะ
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
          <Link
            to="/want-to-buy"
            target="_blank"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 font-semibold"
          >
            <ExternalLink size={13} /> ไปดูหน้ากระดานตามหาสินค้า
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              ปิดหน้าต่าง
            </button>
            <button
              onClick={() => onDelete(post)}
              className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 transition-colors shadow-xs"
            >
              <Trash2 size={13} /> ลบโพสต์นี้
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────── Modal: ยืนยันการลบโพสต์ ─────────────
function DeleteModal({ post, busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState('เนื้อหาไม่เหมาะสม / ผิดระเบียบการใช้งาน');

  const presetReasons = [
    'เนื้อหาไม่เหมาะสม / มีคำหยาบคาย',
    'โพสต์สแปม หรือโปรโมทสิ่งผิดกฎหมาย',
    'ตามหาสิ่งของต้องห้ามตามระเบียบมหาวิทยาลัย',
    'ข้อมูลซ้ำซ้อน หรือมีพฤติกรรมน่าสงสัย',
    'ผู้ใช้ส่งคำขอให้แอดมินลบออก',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2.5 text-red-600">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-500">
            <Trash2 size={20} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-gray-900">ยืนยันลบโพสต์ตามหาสินค้า</h3>
            <p className="text-xs text-gray-500">การกระทำนี้จะลบโพสต์ออกจากระบบและรายงานที่เกี่ยวข้อง</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs">
          <p className="font-bold text-gray-800">{post.title}</p>
          <p className="text-gray-500 mt-0.5">
            ผู้โพสต์: <span className="font-semibold text-gray-700">{post.buyer?.full_name || post.buyer?.username || 'สมาชิก'}</span>
          </p>
        </div>

        <label className="text-xs font-bold text-gray-700">เหตุผลในการลบ (จะถูกบันทึกลง Audit Log):</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="ระบุเหตุผลในการลบ..."
          className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs outline-none focus:border-red-400 focus:bg-white"
        />

        <div className="mt-2 flex flex-wrap gap-1">
          {presetReasons.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              className="text-[10px] rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-0.5 transition-colors"
            >
              + {p}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
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
            className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60 transition-colors shadow-xs"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ยืนยันการลบ
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────── หน้าหลัก Admin Wanted Posts ─────────────
export function AdminWantedPostsPage() {
  const token = useAdminStore((s) => s.token) || useAuthStore((s) => s.token) || localStorage.getItem('cm_admin_token') || localStorage.getItem('cm_token');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');

  const [detailPost, setDetailPost] = useState(null);
  const [toDeletePost, setToDeletePost] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load data
  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await api.adminGetWantedPosts(token, {
        q: debounced,
        status: status === 'all' ? '' : status,
        category: category === 'all' ? '' : category,
        page,
        limit: PAGE_SIZE,
      });

      const list = res.posts || [];
      if (!list.length && page > 1) {
        setPage(page - 1);
        return;
      }
      setPosts(list);
      setTotal(res.total || 0);

      // ถ้ากำลังเปิด modal ดูรายละเอียดอยู่ ให้อัปเดตข้อมูลโพสต์ใน modal ด้วย
      if (detailPost) {
        const updated = list.find((p) => p.id === detailPost.id);
        if (updated) setDetailPost(updated);
      }
    } catch (e) {
      setErr(e.message || 'โหลดข้อมูลโพสต์ตามหาสินค้าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [token, debounced, status, category, page, detailPost?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Handle Delete
  const confirmDelete = async (reason) => {
    if (!toDeletePost) return;
    setDeleting(true);
    setErr('');
    try {
      const res = await api.adminDeleteWantedPost(token, toDeletePost.id, reason);
      setNotice(res.message || 'ลบโพสต์ตามหาสินค้าเรียบร้อยแล้ว');
      setToDeletePost(null);
      setDetailPost(null);
      await load();
    } catch (e) {
      setErr(e.message || 'ลบโพสต์ไม่สำเร็จ');
      setToDeletePost(null);
    } finally {
      setDeleting(false);
    }
  };

  // Handle Status Change
  const handleStatusChange = async (postId, newStatusId) => {
    setUpdatingStatus(true);
    setErr('');
    try {
      const res = await api.adminUpdateWantedPostStatus(token, postId, newStatusId);
      setNotice(res.message || 'อัปเดตสถานะโพสต์เรียบร้อยแล้ว');
      await load();
    } catch (e) {
      setErr(e.message || 'อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Search size={22} className="text-orange-500" />
            จัดการโพสต์ตามหาสินค้า
            <span className="ml-2 rounded-full bg-orange-100 text-orange-700 px-2.5 py-0.5 text-xs font-bold border border-orange-200">
              {total.toLocaleString()} รายการ
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            ตรวจสอบโพสต์ตามหาของจากนักศึกษา ลบโพสต์ที่ไม่เหมาะสม และจัดการสถานะโพสต์ในระบบ
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-500 disabled:opacity-50 transition-colors shadow-2xs"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin text-orange-500' : ''} />
          รีเฟรช
        </button>
      </div>

      {/* Info Notice Banner */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-orange-200 bg-orange-50/80 p-3.5 text-xs text-orange-800">
        <Info size={16} className="shrink-0 text-orange-600" />
        <span>
          แอดมินสามารถตรวจสอบรายละเอียดผู้โพสต์ งบประมาณ สิ่งที่ตามหา เปลี่ยนสถานะโพสต์ (เช่น ปิดโพสต์ หรือระบุว่าเจอสินค้าแล้ว) และลบโพสต์ที่ละเมิดข้อกำหนดได้
        </span>
      </div>

      {/* Notifications */}
      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={15} /> {notice}
          </span>
          <button onClick={() => setNotice('')} className="text-emerald-500 hover:text-emerald-700">
            <X size={14} />
          </button>
        </div>
      )}
      {err && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          <span className="flex items-center gap-1.5">
            <AlertCircle size={15} /> {err}
          </span>
          <button onClick={() => setErr('')} className="text-red-500 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อโพสต์, รายละเอียด, ชื่อผู้โพสต์, รหัสนักศึกษา/อีเมล..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-8 py-2 text-xs outline-none focus:border-orange-400 focus:bg-white transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-orange-400 focus:bg-white"
          >
            <option value="all">สถานะทั้งหมด</option>
            <option value="active">กำลังตามหา (Active)</option>
            <option value="matched">เจอสินค้าแล้ว (Matched)</option>
            <option value="cancelled">ยกเลิกโพสต์ (Cancelled)</option>
            <option value="expired">ครบ 7 วัน / หมดอายุ (Expired)</option>
          </select>

          {/* Category filter */}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-orange-400 focus:bg-white"
          >
            <option value="all">หมวดหมู่ทั้งหมด</option>
            {categories
              .filter((c) => c.slug !== 'all')
              .map((c) => (
                <option key={c.id || c.slug} value={c.slug || c.id}>
                  {c.name}
                </option>
              ))}
          </select>

          {(status !== 'all' || category !== 'all' || search) && (
            <button
              onClick={() => {
                setStatus('all');
                setCategory('all');
                setSearch('');
              }}
              className="rounded-xl border border-gray-200 bg-gray-100 hover:bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 transition-colors"
            >
              รีเซ็ต
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Loader2 size={32} className="animate-spin text-orange-500 mb-2" />
            <p className="text-xs">กำลังโหลดโพสต์ตามหาสินค้า...</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
            <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-300 mb-3">
              <Search size={26} />
            </div>
            <p className="font-bold text-sm text-gray-700">ไม่พบโพสต์ตามหาสินค้า</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              {search || status !== 'all' || category !== 'all'
                ? 'ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองสถานะและหมวดหมู่'
                : 'ยังไม่มีนักศึกษาโพสต์ตามหาสินค้าในขณะนี้'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/75 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  <th className="py-3 px-4">ผู้โพสต์ (นักศึกษา)</th>
                  <th className="py-3 px-4">สิ่งที่ตามหา</th>
                  <th className="py-3 px-4">หมวดหมู่</th>
                  <th className="py-3 px-4">งบประมาณ</th>
                  <th className="py-3 px-4">วันที่ประกาศ</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {posts.map((post) => {
                  const buyer = post.buyer || post.user || {};
                  const score = buyer.trust_score ?? buyer.trustScore ?? 100;

                  return (
                    <tr key={post.id} className="hover:bg-orange-50/30 transition-colors">
                      {/* ผู้โพสต์ */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={buyer.avatar_url || buyer.profile_image_url}
                            name={buyer.full_name || buyer.username}
                            size={34}
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-gray-900 leading-tight">
                                {buyer.full_name || buyer.username || 'สมาชิก'}
                              </span>
                              <span className={`text-[9px] font-bold rounded-md px-1.5 py-0.2 border ${trustCls(score)}`}>
                                {score}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-tight mt-0.5">
                              {buyer.university_email || `@${buyer.username || 'user'}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* สิ่งที่ตามหา */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div>
                          <p className="font-bold text-gray-900 line-clamp-1">{post.title}</p>
                          {post.description && (
                            <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{post.description}</p>
                          )}
                        </div>
                      </td>

                      {/* หมวดหมู่ */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                          {post.categoryName || post.categories?.name || 'ทั่วไป'}
                        </span>
                      </td>

                      {/* งบประมาณ */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-black text-orange-600">
                          {fmtBudget(post.budgetMin, post.budgetMax, post.budget)}
                        </span>
                      </td>

                      {/* วันที่ประกาศ */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-gray-500 text-[11px]">
                        {fmtDate(post.created_at)}
                      </td>

                      {/* สถานะ */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={post.status} label={post.statusName} />
                      </td>

                      {/* จัดการ */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailPost(post)}
                            title="ดูรายละเอียดโพสต์"
                            className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-600 hover:border-orange-300 hover:text-orange-500 transition-colors shadow-2xs"
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => setToDeletePost(post)}
                            title="ลบโพสต์"
                            className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-500 hover:bg-red-500 hover:text-white transition-colors shadow-2xs"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 p-4 text-xs text-gray-500">
            <span>
              แสดง {Math.min((page - 1) * PAGE_SIZE + 1, total)} - {Math.min(page * PAGE_SIZE, total)} จากทั้งหมด {total.toLocaleString()} รายการ
            </span>

            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage(page - 1)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={14} /> ก่อนหน้า
              </button>
              <span className="px-2 font-bold text-gray-800">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages || loading}
                onClick={() => setPage(page + 1)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                ถัดไป <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {detailPost && (
        <DetailModal
          post={detailPost}
          onClose={() => setDetailPost(null)}
          onDelete={(p) => {
            setDetailPost(null);
            setToDeletePost(p);
          }}
          onStatusChange={handleStatusChange}
          updatingStatus={updatingStatus}
        />
      )}

      {toDeletePost && (
        <DeleteModal
          post={toDeletePost}
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setToDeletePost(null)}
        />
      )}
    </div>
  );
}

export default AdminWantedPostsPage;
