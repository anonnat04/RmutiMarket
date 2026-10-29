import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle, Search, MessageCircle, Clock, Banknote,
  Edit3, Trash2, CheckCircle2, User, Sparkles, ArrowLeft, Flag
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
import { formatCurrency } from '@/utils/formatCurrency';
import { api } from '@/lib/api';
import { OfferProductModal } from '@/components/chat/OfferProductModal';
import { ReportModal } from '@/components/common/ReportModal';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { sendRealtimeMessage } from '@/services/socket';


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

export function WantToBuyPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const requests = useWantToBuyStore((s) => s.requests);
  const updateRequest = useWantToBuyStore((s) => s.updateRequest);
  const removeRequest = useWantToBuyStore((s) => s.removeRequest);
  const resolveRequest = useWantToBuyStore((s) => s.resolveRequest);

  const [dbPosts, setDbPosts] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [q, setQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'budget_desc' | 'budget_asc'

  const [editingReq, setEditingReq] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBudget, setEditBudget] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');

  // state สำหรับ offer modal
  const [offerTarget, setOfferTarget] = useState(null); // โพส WTB ที่กำลังจะเสนอขายให้
  const [offerLoading, setOfferLoading] = useState(false);

  // state สำหรับ report modal
  const [reportTarget, setReportTarget] = useState(null);

  // state สำหรับ confirm dialogs
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [resolveTargetId, setResolveTargetId] = useState(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  const fetchDbPosts = async () => {
    try {
      const res = await api.getWantToBuyPosts();
      if (res?.posts) {
        const mapped = res.posts.map((p) => {
          const statusCode = p.wanted_post_status?.code?.toLowerCase();
          const mappedStatus = statusCode === 'cancelled' ? 'cancelled' : (statusCode === 'completed' ? 'resolved' : 'active');
          return {
            id: p.id,
            title: p.title,
            description: p.description,
            budget: p.budget_max || p.budget_min || 0,
            categoryId: p.categories?.slug || (p.category_id ? `cat-${p.category_id}` : 'others'),
            categoryName: p.categories?.name || 'ทั่วไป',
            author: {
              id: p.users?.id || p.buyer_id,
              name: p.users?.display_name || p.users?.username || 'สมาชิก RMUTI',
              avatarUrl: p.users?.avatar_url || p.users?.profile_image_url || null,
            },
            createdAt: p.created_at,
            status: mappedStatus,
            isDb: true,
          };
        });
        setDbPosts(mapped);
      }
    } catch (err) {
      console.warn("Could not fetch backend WTB posts:", err);
    }
  };

  useEffect(() => {
    fetchDbPosts();
  }, []);

  const myId = String(user?.id ?? 'me');

  const allRequests = [...dbPosts];
  for (const r of requests) {
    if (r.status === 'cancelled') continue;
    if (!allRequests.some((p) => String(p.id) === String(r.id))) {
      allRequests.push(r);
    }
  }

  // helper: ตรวจว่าโพสเป็นของ user ที่ login อยู่ (รองรับทั้ง number และ string id รวมถึง username/display_name)
  const isMinePost = (r) => {
    if (!r) return false;
    const authorId = String(r.author?.id || r.buyer_id || '');
    if (authorId && myId && authorId === myId) return true;
    if (authorId === 'user-1' || myId === 'user-1') return true;

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

  const filtered = allRequests.filter((r) => {
    if (r.status === 'cancelled') return false;
    if (activeTab === 'all' && r.status !== 'active') return false;
    if (activeTab === 'my' && (!isMinePost(r) || r.status === 'cancelled')) return false;
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
  }).sort((a, b) => {
    if (sortBy === 'budget_desc') return (b.budget || 0) - (a.budget || 0);
    if (sortBy === 'budget_asc') return (a.budget || 0) - (b.budget || 0);
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  // นับจาก allRequests (รวม DB) ไม่ใช่แค่ store
  const myRequestsCount = allRequests.filter((r) => r.status !== 'cancelled' && isMinePost(r)).length;

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
    const updated = {
      title: editTitle.trim(),
      description: editDescription.trim(),
      budget: Number(editBudget) || 0,
      categoryId: editCategoryId,
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
      });
    } catch (err) {
      console.warn("Backend update wtb error:", err);
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
      console.warn("Backend update wtb status error:", err);
    }
    setDialogLoading(false);
    setResolveTargetId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDialogLoading(true);
    // ลบทันทีทั้งจาก Zustand store และ dbPosts state
    removeRequest(deleteTargetId);
    setDbPosts((prev) => prev.filter((p) => String(p.id) !== String(deleteTargetId)));
    try {
      await api.deleteWantToBuyPost(deleteTargetId);
    } catch (err) {
      console.warn("Backend wtb delete error:", err);
    }
    setDialogLoading(false);
    setDeleteTargetId(null);
  };

  /**
   * เมื่อผู้ใช้เลือกสินค้าจาก OfferProductModal แล้ว:
   * 1. สร้าง/ดึงห้องแชทกับ buyer โดยใช้ listing id ของสินค้าที่เลือก
   * 2. ส่งข้อความเสนอขายพร้อมรายละเอียดสินค้าไปในห้องแชทนั้น
   * 3. navigate ไปหน้าแชท
   */
  const offeringRef = useRef(false);

  const handleOfferProduct = async (product) => {
    if (!offerTarget || offeringRef.current) return;
    offeringRef.current = true;
    setOfferLoading(true);
    try {
      const buyerId = offerTarget.author?.id || offerTarget.buyer_id;

      // 1. สร้าง/ดึง conversation ระหว่างผู้ขาย (ตัวเรา) กับผู้ซื้อ (เจ้าของโพส WTB)
      let conversationId = null;
      try {
        const convRes = await api.createOrGetConversation({
          productId: product.id,
          partnerId: buyerId,
          buyerId,
        });
        if (convRes?.conversationId) {
          conversationId = String(convRes.conversationId);
        }
      } catch (err) {
        console.warn('createOrGetConversation error:', err?.message);
      }

      // 2. แปลงสภาพสินค้าเป็นภาษาไทยชัดเจน (ดึงจาก product_conditions เป็นหลัก)
      const formatConditionThai = (cond, prod) => {
        if (prod?.product_conditions?.name) return prod.product_conditions.name;
        if (prod?.condition_name || prod?.conditionName) return prod.condition_name || prod.conditionName;
        if (!cond) return 'มือสอง';
        const c = String(cond).toLowerCase().trim();
        if (c === 'new' || c === 'like_new' || c === 'มือหนึ่ง' || c === '1' || c.includes('หนึ่ง')) return 'มือหนึ่ง';
        return 'มือสอง';
      };

      const conditionLabel = formatConditionThai(product.condition, product);
      const detailText = product.description ? `📝 รายละเอียด/สภาพ: ${product.description}\n` : '';
      const imageUrl = product.images?.[0]?.imageUrl || product.productImage || null;

      // ส่งข้อความเสนอขายพร้อมรายละเอียดสภาพสินค้า
      const offerText =
        `🛍️ สวัสดีครับ/ค่ะ! ได้เห็นโพสตามหา "${offerTarget.title}" พอดีมีสินค้าชิ้นนี้ว่างพร้อมส่งต่อครับ\n` +
        `📦 สินค้า: ${product.title}\n` +
        `💰 ราคา: ${formatCurrency(product.price)}\n` +
        `✨ สภาพ: ${conditionLabel}\n` +
        (detailText ? `${detailText}` : '') +
        `\nสนใจสอบถามรายละเอียดหรือนัดรับได้เลยครับ`;

      if (conversationId) {
        const sender = {
          id: user?.id || 'me',
          name: user?.username || user?.displayName || user?.name || user?.full_name || 'ฉัน',
        };
        sendRealtimeMessage({
          conversationId,
          text: offerText,
          message_type: 'TEXT',
          imageUrl,
          sender,
        });
      }

      // 3. ปิด modal แล้วนำทางไปยังห้องแชทโดยตรง
      setOfferTarget(null);
      if (conversationId) {
        navigate(`/chat?conversationId=${conversationId}`);
      } else {
        navigate(`/chat?productId=${product.id}&partnerId=${buyerId}`);
      }
    } catch (err) {
      console.warn('handleOfferProduct error:', err);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setOfferLoading(false);
      offeringRef.current = false;
    }
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
              ตามหาสินค้า (Want to Buy)
            </h1>
            <p className="mt-0.5 text-sm text-ink-500">ใครมีของไม่ได้ใช้ ลองดูว่ามีเพื่อน นศ. กำลังตามหาอยู่ไหม</p>
          </div>
        </div>
        <Link
          to="/want-to-buy/create"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:shadow-lg hover:from-brand-600 hover:to-orange-600 transition-all"
        >
          <PlusCircle size={16} />
          โพสตามหาของ
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-surface-border bg-surface-muted/50 p-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all duration-150 ${
            activeTab === 'all'
              ? 'bg-white text-brand-600 shadow-sm'
              : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          โพสทั้งหมด ({allRequests.filter((r) => r.status === 'active').length})
        </button>
        <button
          onClick={() => setActiveTab('my')}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-all duration-150 ${
            activeTab === 'my'
              ? 'bg-white text-brand-600 shadow-sm'
              : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          <User size={14} /> โพสของฉัน ({myRequestsCount})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex w-full max-w-sm items-center gap-2 rounded-full border border-surface-border bg-white px-4 py-2 shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all sm:w-auto">
          <Search size={16} className="shrink-0 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาโพสตามหา..."
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

        {/* Budget sort buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setSortBy('budget_desc')}
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              sortBy === 'budget_desc'
                ? 'bg-[#f95721] text-white shadow-xs'
                : 'bg-white text-gray-600 border border-surface-border hover:bg-orange-50 hover:text-[#f95721]'
            }`}
          >
            <span>⬇️ งบสูงสุด → ต่ำสุด</span>
          </button>
          <button
            onClick={() => setSortBy('budget_asc')}
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              sortBy === 'budget_asc'
                ? 'bg-[#f95721] text-white shadow-xs'
                : 'bg-white text-gray-600 border border-surface-border hover:bg-orange-50 hover:text-[#f95721]'
            }`}
          >
            <span>⬆️ งบต่ำสุด → สูงสุด</span>
          </button>
          <button
            onClick={() => setSortBy('newest')}
            className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all ${
              sortBy === 'newest'
                ? 'bg-[#f95721] text-white shadow-xs'
                : 'bg-white text-gray-600 border border-surface-border hover:bg-orange-50 hover:text-[#f95721]'
            }`}
          >
            <span>🕒 ล่าสุด</span>
          </button>
        </div>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyState
          title={activeTab === 'my' ? 'คุณยังไม่มีโพสตามหาสินค้า' : 'ไม่พบโพสตามหาสินค้า'}
          description={
            activeTab === 'my'
              ? 'เมื่อคุณต้องการหาสินค้าที่ไม่มีคนลงขาย สามารถสร้างโพสตามหาได้เลย'
              : 'ลองค้นหาคำอื่น หรือเป็นคนแรกที่โพสตามหาของที่คุณต้องการสิ'
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
            const isMine = isMinePost(req);
            const isResolved = req.status === 'resolved';
            const catName = req.categoryName || categories.find((c) => c.id === req.categoryId || c.slug === req.categoryId)?.name || 'ทั่วไป';

            return (
              <div
                key={req.id}
                className={`flex flex-col justify-between gap-4 rounded-2xl border p-5 transition-all duration-200 hover:shadow-md ${
                  isMine
                    ? 'border-brand-200 bg-brand-50/30 shadow-sm'
                    : 'border-surface-border bg-white shadow-sm'
                }`}
              >
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-100 px-2.5 py-1 text-xs font-bold text-brand-600">
                      {catName}
                    </span>
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
                    <Link
                      to={isMine ? '/profile' : (req.author?.id ? `/profile/${req.author.id}` : '#')}
                      className="flex items-center gap-2 group/author hover:opacity-85 transition-opacity"
                      title={isMine ? 'ดูโปรไฟล์ของฉัน' : 'ดูโปรไฟล์ผู้โพสต์'}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 text-xs font-bold text-white overflow-hidden shadow-2xs">
                        {req.author?.avatarUrl ? (
                          <img src={req.author.avatarUrl} alt={req.author?.name} className="h-full w-full object-cover" />
                        ) : (
                          (req.author?.name ? req.author.name.charAt(0) : 'น')
                        )}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-ink-900 group-hover/author:text-brand-600 transition-colors">
                          {isMine ? `${req.author?.name || 'ฉัน'}` : req.author?.name}
                        </span>
                        {isMine && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                            <Sparkles size={8} /> โพสของฉัน
                          </span>
                        )}
                      </div>
                    </Link>
                    <div className="flex items-center gap-1 text-sm font-extrabold text-brand-600">
                      <Banknote size={14} />
                      {formatCurrency(req.budget)}
                    </div>
                  </div>

                  {isMine ? (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenEdit(req)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                        >
                          <Edit3 size={12} /> แก้ไขโพส
                        </button>
                        <button
                          onClick={() => setDeleteTargetId(req.id)}
                          className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 transition-colors"
                          title="ลบโพสนี้"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>

                      {!isResolved ? (
                        <button
                          onClick={() => setResolveTargetId(req.id)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-colors"
                        >
                          <CheckCircle2 size={13} /> ได้ของแล้ว
                        </button>
                      ) : (
                        <div className="rounded-xl bg-emerald-50 py-1.5 text-center text-xs font-bold text-emerald-600">
                          ✅ ได้ของเรียบร้อยแล้ว
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setOfferTarget(req)}
                          disabled={offerLoading}
                          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-2 text-xs sm:text-sm font-bold text-brand-700 hover:bg-brand-100 transition-colors disabled:opacity-60"
                        >
                          <MessageCircle size={15} />
                          ทักไปเสนอขาย
                        </button>
                        {req.author?.id && (
                          <Link
                            to={`/profile/${req.author.id}`}
                            className="flex items-center justify-center rounded-xl border border-surface-border bg-white px-3 py-2 text-xs font-bold text-ink-700 hover:bg-gray-50 hover:text-brand-600 transition-colors whitespace-nowrap shadow-2xs"
                            title="ดูโปรไฟล์ผู้โพสต์"
                          >
                            ดูโปรไฟล์
                          </Link>
                        )}
                      </div>
                      <div className="flex justify-end pt-0.5">
                        <button
                          type="button"
                          onClick={() => setReportTarget(req)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-red-500 transition-colors py-0.5 px-1.5 rounded hover:bg-red-50"
                          title="รายงานโพสต์นี้"
                        >
                          <Flag size={12} />
                          <span>รายงานโพสต์ไม่เหมาะสม</span>
                        </button>
                      </div>
                    </div>
                  )}
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

      {/* Offer Product Modal — เลือกสินค้าเพื่อเสนอขายให้กับโพสตามหา */}
      <OfferProductModal
        isOpen={!!offerTarget}
        onClose={() => setOfferTarget(null)}
        onSelectProduct={handleOfferProduct}
        wantToBuyPost={offerTarget}
        isSubmitting={offerLoading}
      />

      {/* Report Modal — รายงานโพสต์ตามหาไม่เหมาะสม */}
      {reportTarget && (
        <ReportModal
          open={!!reportTarget}
          onClose={() => setReportTarget(null)}
          targetType="wanted_post"
          targetId={reportTarget.id}
          targetTitle={reportTarget.title}
          targetUser={reportTarget.author?.name || 'สมาชิก'}
          targetUserId={reportTarget.author?.id}
        />
      )}

      {/* Confirm Delete WTB Dialog */}
      <ConfirmDialog
        open={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleConfirmDelete}
        title="ยืนยันการลบโพสต์ตามหานี้?"
        description="เมื่อลบแล้ว โพสต์นี้จะหายไปจากหน้าตามหาสินค้าทันที"
        confirmLabel="ลบโพสต์"
        cancelLabel="ยกเลิก"
        variant="danger"
        loading={dialogLoading}
      />

      {/* Confirm Resolve WTB Dialog */}
      <ConfirmDialog
        open={!!resolveTargetId}
        onClose={() => setResolveTargetId(null)}
        onConfirm={handleConfirmResolve}
        title="ยืนยันว่าได้รับของแล้ว?"
        description="โพสต์นี้จะถูกทำเครื่องหมายว่าได้ของแล้ว และปิดรับข้อเสนอขายเพิ่มเติม"
        confirmLabel="ยืนยันได้ของแล้ว"
        cancelLabel="ยกเลิก"
        variant="info"
        loading={dialogLoading}
      />
    </div>
  );
}

