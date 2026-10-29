import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, ShieldCheck, ArrowLeft, CheckCircle, MessageSquare, Award, Camera, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function ReviewsPage() {
  const { userId } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const targetId = userId || currentUser?.id;

  const [dbReviews, setDbReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStar, setFilterStar] = useState('all');
  const [activeImage, setActiveImage] = useState(null);

  useEffect(() => {
    if (!targetId) return;
    setLoading(true);
    setDbReviews([]);
    api.getUserReviews(targetId)
      .then((res) => {
        if (res?.reviews) {
          setDbReviews(res.reviews);
        }
      })
      .catch((err) => console.warn('Could not load reviews from db:', err))
      .finally(() => setLoading(false));
  }, [targetId]);

  // แมป DB reviews เท่านั้น — ไม่มี mock/store
  const reviews = useMemo(() =>
    dbReviews.map((r) => ({
      id: r.id,
      reviewerId: r.reviewer?.id || null,
      reviewerName: r.reviewer?.display_name || 'ผู้ใช้งาน',
      reviewerAvatar: r.reviewer?.avatar_url || null,
      reviewerRole: r.reviewer_role || null,
      rating: Number(r.rating),
      comment: r.comment || '',
      images: r.images || [],
      productTitle: r.product_title || null,
      productImage: r.product_image || null,
      createdAt: r.created_at,
    })),
  [dbReviews]);

  // คำนวณสถิติจาก DB reviews จริงเท่านั้น
  const stats = useMemo(() => {
    const total = reviews.length;

    if (total === 0) {
      return {
        trustScore: 0,
        averageRating: 0,
        totalReviews: 0,
        starsBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      };
    }

    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sumRating = 0;

    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(r.rating)));
      counts[star] = (counts[star] || 0) + 1;
      sumRating += r.rating;
    });

    const avg = parseFloat((sumRating / total).toFixed(1));

    // % ของแต่ละดาว (จำนวนรีวิวดาวนั้น / ทั้งหมด)
    const starsBreakdown = {};
    [5, 4, 3, 2, 1].forEach((star) => {
      starsBreakdown[star] = Math.round((counts[star] / total) * 100);
    });

    // Trust Score = สัดส่วนคะแนนเฉลี่ยต่อ 5 ดาว × 100 (ปัดให้แม่นยำ)
    const trustScore = Math.min(100, Math.round((sumRating / (total * 5)) * 100));

    return { trustScore, averageRating: avg, totalReviews: total, starsBreakdown };
  }, [reviews]);

  const filteredReviews = filterStar === 'all'
    ? reviews
    : reviews.filter((r) => Math.round(r.rating) === Number(filterStar));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            to={userId ? `/profile/${userId}` : '/profile'}
            className="rounded-xl border border-surface-border p-2 text-ink-700 hover:bg-surface-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ink-900 flex items-center gap-2">
              <Award className="text-brand-500" size={24} />
              รีวิว &amp; คะแนนความน่าเชื่อถือ
            </h1>
            <p className="text-xs text-ink-500">
              ความน่าเชื่อถือที่ผ่านการยืนยันตัวตนด้วยอีเมลมหาวิทยาลัยและประวัติการส่งมอบจริง
            </p>
          </div>
        </div>
      </div>

      {/* Top Section: Trust Score & Rating Breakdown */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        {/* Trust Score Box */}
        <div className="cm-card flex flex-col items-center justify-center p-6 text-center shadow-sm border border-surface-border bg-gradient-to-b from-orange-50/50 to-white">
          <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-orange-500 text-white shadow-md">
            <ShieldCheck size={44} className="text-white" />
            <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-emerald-500 p-1 text-white ring-2 ring-white">
              <CheckCircle size={14} />
            </span>
          </div>

          <p className="text-xs font-bold text-ink-500 uppercase tracking-wider">Trust Score</p>
          <div className="mt-1 flex items-baseline gap-1">
            {loading ? (
              <Loader2 size={28} className="animate-spin text-brand-400" />
            ) : (
              <>
                <span className="text-4xl font-extrabold text-brand-600">
                  {stats.totalReviews === 0 ? '—' : stats.trustScore}
                </span>
                {stats.totalReviews > 0 && (
                  <span className="text-base font-semibold text-ink-400">/100</span>
                )}
              </>
            )}
          </div>

          {/* ดาวเฉลี่ย — แสดงทศนิยมจริง */}
          <div className="mt-2 flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => {
              const avg = stats.averageRating;
              const filled = star <= Math.floor(avg);
              const half = !filled && star === Math.ceil(avg) && avg % 1 >= 0.3;
              return (
                <Star
                  key={star}
                  size={16}
                  className={
                    filled
                      ? 'fill-brand-500 text-brand-500'
                      : half
                      ? 'fill-brand-200 text-brand-400'
                      : 'text-surface-border'
                  }
                />
              );
            })}
          </div>
          <p className="mt-1 text-xs font-medium text-ink-500">
            {stats.totalReviews === 0
              ? 'ยังไม่มีรีวิว'
              : `เฉลี่ย ${stats.averageRating} จาก ${stats.totalReviews} รีวิว`}
          </p>

          <div className="mt-4 w-full rounded-xl bg-emerald-50 p-2.5 text-center text-xs font-semibold text-emerald-700 border border-emerald-100 flex items-center justify-center gap-1.5">
            <CheckCircle size={14} />
            ยืนยันตัวตน นศ. มทร.อีสาน แล้ว
          </div>
        </div>

        {/* Rating Breakdown Bar Chart */}
        <div className="cm-card flex flex-col justify-center p-6 shadow-sm border border-surface-border">
          <h2 className="mb-4 text-sm font-bold text-ink-900">สรุปคะแนนความพึงพอใจ</h2>
          <div className="space-y-2.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const pct = stats.starsBreakdown[star] ?? 0;
              const count = reviews.filter((r) => Math.round(r.rating) === star).length;
              return (
                <div key={star} className="flex items-center gap-3 text-xs">
                  <span className="flex w-8 items-center gap-1 font-semibold text-ink-700">
                    {star} <Star size={12} className="fill-brand-500 text-brand-500" />
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-bold text-ink-500">
                    {count > 0 ? `${count} (${pct}%)` : '0'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-surface-border">
            <button
              onClick={() => setFilterStar('all')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                filterStar === 'all'
                  ? 'bg-brand-500 text-white'
                  : 'bg-surface-muted text-ink-600 hover:bg-surface-border'
              }`}
            >
              ทั้งหมด ({reviews.length})
            </button>
            {[5, 4, 3, 2, 1].map((star) => {
              const cnt = reviews.filter((r) => Math.round(r.rating) === star).length;
              return (
                <button
                  key={star}
                  onClick={() => setFilterStar(String(star))}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    filterStar === String(star)
                      ? 'bg-brand-500 text-white'
                      : 'bg-surface-muted text-ink-600 hover:bg-surface-border'
                  }`}
                >
                  {star} ดาว {cnt > 0 && `(${cnt})`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
          <MessageSquare size={18} className="text-brand-500" />
          รีวิวและข้อเสนอแนะ ({filteredReviews.length})
          {loading && <Loader2 size={16} className="animate-spin text-ink-400" />}
        </h2>

        {loading ? (
          <div className="cm-card py-12 flex items-center justify-center gap-2 text-sm text-ink-400">
            <Loader2 size={20} className="animate-spin" />
            กำลังโหลดรีวิว...
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="cm-card py-12 text-center text-sm text-ink-400">
            {filterStar === 'all' ? 'ยังไม่มีรีวิว' : `ไม่มีรีวิว ${filterStar} ดาว`}
          </div>
        ) : (
          filteredReviews.map((r) => (
            <div
              key={r.id}
              className="cm-card p-4 shadow-sm border border-surface-border flex flex-col gap-3 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  {/* Avatar จริงจาก DB หรือ fallback ตัวอักษร */}
                  {r.reviewerAvatar ? (
                    <img
                      src={r.reviewerAvatar}
                      alt={r.reviewerName}
                      className="h-9 w-9 rounded-full object-cover border border-surface-border"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-sm">
                      {r.reviewerName?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-ink-900 flex items-center gap-1">
                      {r.reviewerId ? (
                        <Link
                          to={`/profile/${r.reviewerId}`}
                          className="hover:text-brand-600 hover:underline"
                        >
                          {r.reviewerName}
                        </Link>
                      ) : (
                        r.reviewerName
                      )}
                      <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">
                        {r.reviewerRole || 'ผู้ซื้อ'}
                      </span>
                    </p>
                    <p className="text-[11px] text-ink-400">{formatDate(r.createdAt)}</p>
                  </div>
                </div>

                {/* ดาวตาม rating จริง (integer) */}
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={14}
                      className={
                        star <= Math.round(r.rating)
                          ? 'fill-brand-500 text-brand-500'
                          : 'text-surface-border'
                      }
                    />
                  ))}
                </div>
              </div>

              {r.comment && (
                <p className="text-xs leading-relaxed text-ink-700 bg-surface-muted/50 p-2.5 rounded-xl">
                  {r.comment}
                </p>
              )}

              {/* รูปถ่ายรีวิว จาก review_images table */}
              {r.images && r.images.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-ink-600 flex items-center gap-1">
                    <Camera size={13} className="text-brand-500" /> รูปถ่ายจบงาน / สภาพสินค้าจริง:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {r.images.map((imgUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImage(imgUrl)}
                        className="group relative h-20 w-20 overflow-hidden rounded-xl border border-surface-border bg-surface-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <img
                          src={imgUrl}
                          alt="รูปถ่ายจบงาน"
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* สินค้าที่ซื้อ-ขาย จาก listing จริง */}
              {(r.productTitle || r.productImage) && (
                <div className="flex items-center gap-2 rounded-xl bg-surface-muted/60 border border-surface-border p-2">
                  {r.productImage && (
                    <img
                      src={r.productImage}
                      alt={r.productTitle || 'สินค้า'}
                      className="h-10 w-10 rounded-lg object-cover border border-surface-border flex-shrink-0"
                    />
                  )}
                  <p className="text-[11px] font-medium text-ink-500">
                    📦 สินค้าที่ซื้อ-ขาย:{' '}
                    <span className="font-semibold text-ink-800">{r.productTitle}</span>
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Lightbox */}
      {activeImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActiveImage(null)}
        >
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white p-2">
            <img src={activeImage} alt="รูปรีวิวขนาดเต็ม" className="max-h-[80vh] w-auto rounded-xl object-contain mx-auto" />
            <button
              onClick={() => setActiveImage(null)}
              className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewsPage;
