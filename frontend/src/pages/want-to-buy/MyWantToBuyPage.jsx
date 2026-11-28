import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle, Search, Clock, Banknote, Edit3, Trash2,
  CheckCircle2, ArrowLeft, RotateCcw, PackageCheck, XCircle, AlertCircle, LayoutGrid
} from 'lucide-react';
import { useWantToBuyStore } from '@/store/wantToBuyStore';
import { useAuthStore } from '@/store/authStore';
import { categories } from '@/constants/categories';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { Modal } from '@/components/common/Modal';
import { Input } from '@/components/common/Input';
import { Textarea } from '@/components/common/Textarea';
import { Select } from '@/components/common/Select';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { formatCurrency } from '@/utils/formatCurrency';
import { api } from '@/lib/api';

const STATUS_TABS = [
  { key: 'all', label: 'ทั้งหมด', icon: LayoutGrid, activeClass: 'text-brand-600' },
  { key: 'active', label: 'กำลังตามหา', icon: Search, activeClass: 'text-orange-600' },
  { key: 'resolved', label: 'ได้ของแล้ว', icon: PackageCheck, activeClass: 'text-emerald-600' },
  { key: 'cancelled', label: 'ยกเลิกแล้ว', icon: XCircle, activeClass: 'text-red-600' },
  { key: 'expired', label: 'หมดอายุ', icon: AlertCircle, activeClass: 'text-amber-600' },
];

const STATUS_BADGE = {
  active: { label: 'กำลังตามหา', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  resolved: { label: 'ได้ของแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'ยกเลิกแล้ว', className: 'bg-red-50 text-red-600 border-red-200' },
  expired: { label: 'หมดอายุ', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

export function MyWantToBuyPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateRequest = useWantToBuyStore((s) => s.updateRequest);
  const removeRequest = useWantToBuyStore((s) => s.removeRequest);
  const resolveRequest = useWantToBuyStore((s) => s.resolveRequest);

  const [dbPosts, setDbPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('all');
  const [q, setQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [editingReq, setEditingReq] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');

  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [resolveTargetId, setResolveTargetId] = useState(null);
  const [reopenTargetId, setReopenTargetId] = useState(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const myId = String(user?.id ?? 'me');

  const isMinePost = (r) => {
    if (!r) return false;
    const authorId = String(r.author?.id || r.buyer_id || '');
    if (authorId && myId && authorId === myId) return true;

    const authorName = String(r.author?.name || '').trim().toLowerCase();
    if (!authorName) return false;

    const namesToCheck = [
      user?.displayName,
      user?.display_name,
      user?.username,
      user?.name,
      user?.fullName,
      user?.full_name,
    ].filter(Boolean).map((n) => String(n).trim().toLowerCase());

    return namesToCheck.includes(authorName);
  };

  const fetchMyPosts = async () => {
    try {
      setLoading(true);
      const res = await api.getWantToBuyPosts({ limit: 100 });
      if (res?.posts) {
        const mapped = res.posts.map((p) => {
          const statusCode = String(p.statusCode || p.status || p.wanted_post_status?.code || '').toLowerCase();
          const mappedStatus =
            statusCode === 'cancelled' || p.status_id === 3
              ? 'cancelled'
              : statusCode === 'matched' || statusCode === 'completed' || p.status_id === 2
              ? 'resolved'
              : statusCode === 'expired' || p.status_id === 4
              ? 'expired'
              : 'active';
          return {
            id: p.id,
            buyer_id: p.buyer_id,
            title: p.title,
            description: p.description,
            budget: p.budget_max || p.budget_min || 0,
            categoryId: p.categories?.slug || p.categoryId || (p.category_id ? `cat-${p.category_id}` : 'others'),
            categoryName: p.categories?.name || p.categoryName || 'ทั่วไป',
            author: {
              id: p.users?.id || p.buyer_id,
              name: p.users?.display_name || p.users?.username || 'ฉัน',
              avatarUrl: p.users?.avatar_url || p.users?.profile_image_url || null,
            },
            createdAt: p.created_at,
            status: mappedStatus,
          };
        });
        setDbPosts(mapped);
      }
    } catch (err) {
      console.warn('Could not fetch my WTB posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyPosts();
  }, [user?.id]);

  const myPosts = useMemo(() => {
    return dbPosts
      .filter((r) => isMinePost(r))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [dbPosts, myId]);

  const statusCounts = useMemo(() => {
    const counts = { all: myPosts.length, active: 0, resolved: 0, cancelled: 0, expired: 0 };
    myPosts.forEach((p) => {
      if (counts[p.status] !== undefined) counts[p.status] += 1;
    });
    return counts;
  }, [myPosts]);

  const filtered = useMemo(() => {
    return myPosts.filter((r) => {
      if (activeStatus !== 'all' && r.status !== activeStatus) return false;
      if (selectedCategory !== 'all' && r.categoryId !== selectedCategory) return false;
      if (q) {
        const qLower = q.toLowerCase().trim();
        const numQ = parseFloat(qLower);
        const titleMatch = (r.title || '').toLowerCase().includes(qLower);
        const descMatch = (r.description || '').toLowerCase().includes(qLower);
        const budgetMatch = !isNaN(numQ) && (r.budget === numQ || String(r.budget).includes(qLower));
        if (!titleMatch && !descMatch && !budgetMatch) return false;
      }
      return true;
    });
  }, [myPosts, activeStatus, selectedCategory, q]);

  const handleOpenEdit = (req) => {
    setEditingReq(req);
    setEditTitle(req.title || '');
    setEditDescription(req.description || '');
    setEditBudget(String(req.budget || ''));
    setEditCategoryId(req.categoryId || 'others');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingReq || !editTitle.trim()) return;
    const selectedCat = categories.find((c) => c.id === editCategoryId || c.slug === editCategoryId);
    const updated = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      budget: Number(editBudget) || 0,
      categoryId: editCategoryId,
      categoryName: selectedCat?.name || editingReq.categoryName,
    };
    updateRequest(editingReq.id, updated);
    setDbPosts((prev) =>
      prev.map((p) => (String(p.id) === String(editingReq.id) ? { ...p, ...updated } : p))
    );
    try {
      await api.updateWantToBuyPost(editingReq.id, {
        title: updated.title,
        description: updated.description,
        budgetMax: updated.budget,
        categoryId: editCategoryId,
      });
    } catch (err) {
      console.warn('Backend update wtb error:', err);
    }
    setEditingReq(null);
  };

  const handleConfirmResolve = async () => {
    if (!resolveTargetId) return;
    setDialogLoading(true);
    resolveRequest(resolveTargetId);
    setDbPosts((prev) =>
      prev.map((p) => (String(p.id) === String(resolveTargetId) ? { ...p, status: 'resolved' } : p))
    );
    try {
      await api.updateWantToBuyPost(resolveTargetId, { statusCode: 'MATCHED' });
    } catch (err) {
      console.warn('Backend update wtb status error:', err);
    }
    setDialogLoading(false);
    setResolveTargetId(null);
  };

  const handleConfirmReopen = async () => {
    if (!reopenTargetId) return;
    setDialogLoading(true);
    updateRequest(reopenTargetId, { status: 'active' });
    setDbPosts((prev) =>
      prev.map((p) => (String(p.id) === String(reopenTargetId) ? { ...p, status: 'active' } : p))
    );
    try {
      await api.updateWantToBuyPost(reopenTargetId, { statusCode: 'ACTIVE' });
    } catch (err) {
      console.warn('Backend reopen wtb error:', err);
    }
    setDialogLoading(false);
    setReopenTargetId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDialogLoading(true);
    removeRequest(deleteTargetId);
    setDbPosts((prev) => prev.filter((p) => String(p.id) !== String(deleteTargetId)));
    try {
      await api.deleteWantToBuyPost(deleteTargetId);
    } catch (err) {
      console.warn('Backend wtb delete error:', err);
    }
    setDialogLoading(false);
    setDeleteTargetId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
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
              <Search size={22} className="text-brand-500" />
              โพสตามหาสินค้าของฉัน
            </h1>
            <p className="mt-0.5 text-sm text-ink-500">ติดตามสถานะและจัดการโพสตามหาสินค้าทั้งหมดของคุณ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/want-to-buy"
            className="inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:text-brand-600 transition-colors"
          >
            ดูโพสทั้งหมด
          </Link>
          <Link
            to="/want-to-buy/create"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-orange-600 transition-all"
          >
            <PlusCircle size={16} />
            โพสตามหาของ
          </Link>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-surface-border bg-surface-muted/50 p-1">
        {STATUS_TABS.map((t) => {
          const Icon = t.icon;
          const active = activeStatus === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveStatus(t.key)}
              className={`flex flex-1 min-w-fit items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all whitespace-nowrap ${
                active
                  ? `bg-white shadow-sm ${t.activeClass}`
                  : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              <Icon size={15} />
              <span>{t.label}</span>
              <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs ${
                active ? 'bg-brand-50 text-brand-700' : 'bg-white/70 text-ink-500'
              }`}>
                {statusCounts[t.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-wrap gap-3">
        <div className="flex w-full max-w-sm items-center gap-2 rounded-full border border-surface-border bg-white px-4 py-2 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all sm:w-auto">
          <Search size={16} className="shrink-0 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาโพสตามหาของฉัน..."
            className="w-full bg-transparent text-sm text-ink-900 outline-none"
          />
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-full border border-surface-border bg-white px-4 py-2 text-sm text-ink-700 outline-none shadow-sm hover:border-brand-300 transition-colors"
        >
          <option value="all">ทุกหมวดหมู่</option>
          {categories
            .filter((c) => c.slug !== 'all')
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-2xl border border-surface-border bg-white/70 p-5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="ไม่มีโพสตามหาในสถานะนี้"
          description={
            activeStatus === 'all'
              ? 'เมื่อคุณต้องการหาสินค้าที่ไม่มีคนลงขาย สามารถสร้างโพสตามหาได้เลย'
              : 'ลองเลือกดูสถานะอื่น หรือสร้างโพสตามหาสินค้าใหม่'
          }
          icon={Search}
          action={
            <Link to="/want-to-buy/create">
              <Button size="sm">สร้างโพสตามหาของ</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((req) => {
            const isResolved = req.status === 'resolved';
            const isActive = req.status === 'active';
            const badge = STATUS_BADGE[req.status] || STATUS_BADGE.active;
            const catName =
              req.categoryName ||
              categories.find((c) => c.id === req.categoryId || c.slug === req.categoryId)?.name ||
              'ทั่วไป';

            return (
              <div
                key={req.id}
                className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-all duration-200 hover:shadow-md ${
                  isResolved
                    ? 'border-emerald-200 bg-emerald-50/25 shadow-sm'
                    : 'border-brand-200 bg-brand-50/20 shadow-sm'
                }`}
              >
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-brand-50 border border-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-600">
                        {catName}
                      </span>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-ink-400">
                      <Clock size={11} />
                      {timeAgo(req.createdAt)}
                    </span>
                  </div>

                  <h3 className="text-base font-bold leading-snug text-ink-900 line-clamp-2">{req.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-600 line-clamp-3">{req.description}</p>
                </div>

                <div className="flex flex-col gap-3 border-t border-surface-border pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500 font-medium">งบประมาณที่ตั้งไว้</span>
                    <div className="flex items-center gap-1 text-sm font-extrabold text-brand-600">
                      <Banknote size={14} />
                      {formatCurrency(req.budget)}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      {isActive && (
                        <button
                          onClick={() => handleOpenEdit(req)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                        >
                          <Edit3 size={12} /> แก้ไขโพส
                        </button>
                      )}
                      {!isActive && req.status !== 'expired' && (
                        <button
                          onClick={() => setReopenTargetId(req.id)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                        >
                          <RotateCcw size={12} /> เปิดตามหาอีกครั้ง
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTargetId(req.id)}
                        className="flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                        title="ลบโพสนี้"
                      >
                        <Trash2 size={12} />
                        {!isActive && <span>ลบโพส</span>}
                      </button>
                    </div>

                    {isActive ? (
                      <button
                        onClick={() => setResolveTargetId(req.id)}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <CheckCircle2 size={13} /> ได้ของแล้ว
                      </button>
                    ) : isResolved ? (
                      <div className="rounded-xl bg-emerald-50 py-1.5 text-center text-xs font-bold text-emerald-700 inline-flex items-center justify-center gap-1.5 w-full">
                        <CheckCircle2 size={13} /> ได้ของเรียบร้อยแล้ว (ซ่อนจากผู้อื่นแล้ว)
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editingReq} onClose={() => setEditingReq(null)} title="แก้ไขโพสตามหาสินค้า">
        <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
          <Input
            label="ชื่อสินค้าที่ตามหา"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            required
          />
          <Textarea
            label="รายละเอียด / สภาพที่ต้องการ"
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="งบประมาณ (บาท)"
              type="number"
              min={0}
              value={editBudget}
              onChange={(e) => setEditBudget(e.target.value)}
            />
            <Select
              label="หมวดหมู่"
              value={editCategoryId}
              onChange={(e) => setEditCategoryId(e.target.value)}
            >
              {categories
                .filter((c) => c.slug !== 'all')
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </Select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setEditingReq(null)}>
              ยกเลิก
            </Button>
            <Button type="submit" className="flex-1">
              บันทึกการแก้ไข
            </Button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="ยืนยันการลบโพสต์ตามหานี้?"
        description="เมื่อลบแล้ว โพสต์นี้จะถูกลบออกจากระบบทันที"
        confirmLabel="ลบโพสต์"
        cancelLabel="ยกเลิก"
        variant="danger"
        loading={dialogLoading}
      />

      {/* Confirm Resolve */}
      <ConfirmDialog
        open={!!resolveTargetId}
        onClose={() => setResolveTargetId(null)}
        onConfirm={handleConfirmResolve}
        title="ยืนยันว่าได้รับของแล้ว?"
        description="โพสต์นี้จะถูกเปลี่ยนสถานะเป็นได้ของแล้ว และซ่อนไม่ให้ผู้ใช้อื่นมองเห็น"
        confirmLabel="ยืนยันได้ของแล้ว"
        cancelLabel="ยกเลิก"
        variant="info"
        loading={dialogLoading}
      />

      {/* Confirm Reopen */}
      <ConfirmDialog
        open={!!reopenTargetId}
        onClose={() => setReopenTargetId(null)}
        onConfirm={handleConfirmReopen}
        title="เปิดตามหาสินค้านี้อีกครั้ง?"
        description="โพสต์นี้จะกลับมาแสดงให้ผู้ใช้อื่นเห็นและสามารถทักมาเสนอขายได้อีกครั้ง"
        confirmLabel="เปิดตามหาอีกครั้ง"
        cancelLabel="ยกเลิก"
        variant="info"
        loading={dialogLoading}
      />
    </div>
  );
}
