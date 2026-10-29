import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Star,
  Package,
  Calendar,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Award,
  MessageCircle,
  Clock,
  Search,
  UserX,
  Sparkles
} from 'lucide-react';
import { api } from '@/lib/api';
import { ProductCard } from '@/components/product/ProductCard';
import { formatCurrency } from '@/utils/formatCurrency';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

function StarRow({ rating, size = 16 }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          className={s <= Math.round(rating) ? 'fill-[#f95721] text-[#f95721]' : 'text-gray-200'}
        />
      ))}
    </span>
  );
}

export function PublicProfilePage({ targetId, navigate }) {
  const [activeTab, setActiveTab] = useState('listings');
  const [publicUser, setPublicUser] = useState(null);
  const [userListings, setUserListings] = useState([]);
  const [userWantToBuys, setUserWantToBuys] = useState([]);
  const [backendReviews, setBackendReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!targetId || targetId === 'me') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    api.getPublicProfile(targetId)
      .then((res) => {
        if (res?.user) {
          setPublicUser(res.user);
          const listings = res.listings || [];
          const wantedPosts = res.wanted_posts || [];
          setUserListings(listings);
          if (res?.reviews) setBackendReviews(res.reviews);
          setUserWantToBuys(wantedPosts);

          // เลือก tab เริ่มต้นให้เหมาะสมกับข้อมูลที่มี
          if (listings.length > 0) {
            setActiveTab('listings');
          } else if (wantedPosts.length > 0) {
            setActiveTab('wantToBuy');
          } else {
            setActiveTab('detail');
          }
        } else {
          setNotFound(true);
        }
      })
      .catch((err) => {
        console.warn("Failed to load public profile:", err);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [targetId]);

  const displayReviews = useMemo(
    () =>
      backendReviews.map((r) => ({
        id: r.id,
        reviewerName: r.users?.display_name || r.users?.username || r.reviewer?.display_name || 'ผู้ใช้',
        reviewerRole: r.reviewer_role || null,
        rating: r.rating,
        comment: r.comment,
        images: r.images || (r.review_images || []).map((img) => img.image_url) || [],
      })),
    [backendReviews]
  );

  const ratingBreakdown = useMemo(() => {
    const total = displayReviews.length;
    return [5, 4, 3, 2, 1].map((star) => {
      const count = displayReviews.filter((r) => Math.round(r.rating) === star).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return { star, count, pct };
    });
  }, [displayReviews]);

  const topAverageRating = Number(publicUser?.average_rating ?? 0);
  const topReviewCount = Number(publicUser?.review_count ?? displayReviews.length ?? 0);

  const tabs = [
    { key: 'listings', label: `สินค้าของผู้ขาย (${userListings.length})` },
    { key: 'wantToBuy', label: `โพสตามหาสินค้า (${userWantToBuys.length})` },
    { key: 'reviews', label: `รีวิว (${topReviewCount})` },
    { key: 'detail', label: 'รายละเอียดผู้ใช้' },
  ];

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-[#f95721] transition-colors"
        >
          <ArrowLeft size={16} /> ย้อนกลับ
        </button>
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm animate-pulse space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-2xl bg-gray-200" />
            <div className="space-y-2 flex-1">
              <div className="h-5 w-48 bg-gray-200 rounded-md" />
              <div className="h-3 w-32 bg-gray-100 rounded-md" />
              <div className="h-3 w-64 bg-gray-100 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !publicUser) {
    return (
      <div className="mx-auto max-w-md text-center py-16 px-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-orange-50 text-[#f95721] mb-4">
            <UserX size={32} />
          </div>
          <h2 className="text-lg font-extrabold text-ink-900">ไม่พบโปรไฟล์ผู้ใช้นี้</h2>
          <p className="text-xs text-gray-500 mt-2 leading-relaxed">
            ผู้ใช้นี้อาจไม่มีอยู่ในระบบ หรือบัญชีอาจถูกระงับการใช้งาน
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#f95721] px-5 py-2.5 text-xs font-bold text-white hover:bg-orange-600 transition-colors shadow-sm"
          >
            <ArrowLeft size={15} /> ย้อนกลับ
          </button>
        </div>
      </div>
    );
  }

  const avatarUrl = publicUser.avatar_url || publicUser.profile_image_url;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-[#f95721] transition-colors"
      >
        <ArrowLeft size={16} /> ย้อนกลับ
      </button>

      {/* Profile Header Card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={publicUser.display_name}
                  className="h-20 w-20 rounded-2xl object-cover shadow-md border border-gray-100"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5722] to-[#ff8a65] text-3xl font-black text-white shadow-md">
                  {(publicUser.username || publicUser.display_name || publicUser.full_name || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-emerald-500" title="ยืนยันตัวตนแล้ว">
                <CheckCircle2 size={14} />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-ink-900">
                  {publicUser.username || publicUser.display_name || publicUser.full_name || 'สมาชิก RMUTI'}
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <CheckCircle2 size={11} /> นักศึกษา มทร.อีสาน
                </span>
              </div>

              {(publicUser.full_name || publicUser.display_name) && (
                <p className="text-xs font-semibold text-gray-600 mt-0.5">
                  {publicUser.full_name || publicUser.display_name}
                </p>
              )}

              <p className="text-xs text-gray-600 mt-1">
                📍 {publicUser.campus || 'มทร.อีสาน นครราชสีมา'}
                {publicUser.faculty ? ` · คณะ${publicUser.faculty}` : ''}
                {publicUser.major ? ` · สาขา${publicUser.major}` : ''}
              </p>

              <p className={`mt-2 text-xs font-medium ${publicUser.bio ? 'text-gray-700' : 'text-gray-400'}`}>
                {publicUser.bio || 'ยังไม่มีคำแนะนำตัว'}
              </p>

              {publicUser.created_at && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-gray-400">
                  <Calendar size={12} />
                  สมาชิกตั้งแต่ {new Date(publicUser.created_at).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          {/* Stats Bar */}
          <div className="flex gap-6 border-t sm:border-t-0 sm:border-l border-gray-100 pt-3 sm:pt-0 sm:pl-6">
            <div className="text-center">
              <p className="text-[11px] font-semibold text-gray-400">คะแนนรวม</p>
              {topReviewCount > 0 ? (
                <>
                  <p className="text-2xl font-black text-ink-900">{topAverageRating.toFixed(1)}</p>
                  <StarRow rating={topAverageRating} size={11} />
                  <p className="text-[10px] text-gray-400 mt-0.5">({topReviewCount} รีวิว)</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-gray-300">—</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">ยังไม่มีรีวิว</p>
                </>
              )}
            </div>
            <div className="text-center">
              <p className="text-[11px] font-semibold text-gray-400">สำเร็จการซื้อขาย</p>
              <p className="text-2xl font-black text-ink-900 mt-0.5">{publicUser.successful_deal_count || 0}</p>
              <p className="text-[10px] text-gray-400">รายการ</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 bg-white rounded-t-2xl px-2 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-[#f95721] text-[#f95721]'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: สินค้าของผู้ขาย */}
      {activeTab === 'listings' && (
        <div>
          {userListings.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-xs text-gray-400">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              ผู้ใช้นี้ยังไม่มีสินค้าที่ลงขายในขณะนี้
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {userListings.map((p) => {
                const coverImg = p.images?.find((img) => img.isCover || img.is_cover)?.imageUrl ||
                  p.images?.[0]?.imageUrl ||
                  p.listing_images?.[0]?.url;

                return (
                  <ProductCard
                    key={p.id}
                    product={{
                      id: String(p.id),
                      title: p.title,
                      price: p.price,
                      condition: p.condition || 'used',
                      images: [
                        {
                          imageUrl: coverImg,
                          isCover: true,
                        },
                      ],
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: โพสตามหาสินค้า (Want to Buy) */}
      {activeTab === 'wantToBuy' && (
        <div>
          {userWantToBuys.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center text-xs text-gray-400">
              <Search size={32} className="mx-auto text-gray-300 mb-2" />
              ผู้ใช้นี้ยังไม่มีโพสตามหาสินค้าในขณะนี้
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {userWantToBuys.map((item) => {
                const isResolved = item.status === 'resolved';

                return (
                  <div
                    key={item.id}
                    className="flex flex-col justify-between rounded-2xl border border-surface-border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div>
                      <div className="mb-2.5 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-600">
                          {item.categoryName}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-ink-400">
                          <Clock size={11} />
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-ink-900 leading-snug line-clamp-2">{item.title}</h3>
                      {item.description && (
                        <p className="mt-1.5 text-xs text-ink-600 leading-relaxed line-clamp-3">{item.description}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-surface-border flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-gray-400 block">งบประมาณ</span>
                        <span className="text-sm font-extrabold text-brand-600">
                          {formatCurrency(item.budget)}
                        </span>
                      </div>

                      {isResolved ? (
                        <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                          ✅ ได้ของแล้ว
                        </span>
                      ) : (
                        <button
                          onClick={() => navigate(`/chat?partnerId=${publicUser.id}`)}
                          className="inline-flex items-center gap-1 rounded-xl bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 px-3 py-1.5 text-xs font-bold transition-colors"
                        >
                          <MessageCircle size={13} /> ทักเสนอของ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: รีวิว */}
      {activeTab === 'reviews' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Left: rating breakdown */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            {topReviewCount > 0 ? (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-[#f95721]">
                    <Star size={24} className="fill-[#f95721]" />
                  </div>
                  <div>
                    <span className="text-3xl font-black text-ink-900">{topAverageRating.toFixed(1)}</span>
                    <StarRow rating={topAverageRating} />
                    <p className="text-[11px] text-gray-400">({topReviewCount} รีวิว)</p>
                  </div>
                </div>
                {ratingBreakdown.map(({ star, count, pct }) => (
                  <div key={star} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="w-8 text-right text-gray-600">{star} ดาว</span>
                    <div className="h-2 flex-1 rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-[#f95721]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-gray-400">{count}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="py-8 text-center">
                <Star size={32} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">ยังไม่มีรีวิวสำหรับผู้ใช้นี้</p>
              </div>
            )}
          </div>

          {/* Right: review cards */}
          <div className="space-y-2.5">
            {displayReviews.length > 0 ? (
              displayReviews.map((r) => (
                <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-[#f95721]">
                      {r.reviewerName?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-ink-900">{r.reviewerName}</span>
                          {r.reviewerRole && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              r.reviewerRole === 'ผู้ซื้อ'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-green-50 text-green-700'
                            }`}>
                              {r.reviewerRole}
                            </span>
                          )}
                        </div>
                        <StarRow rating={r.rating} size={11} />
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{r.comment}</p>
                      {r.images && r.images.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.images.map((imgUrl, i) => (
                            <a key={i} href={imgUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={imgUrl}
                                alt="รูปถ่ายจบงาน"
                                className="h-14 w-14 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-xs text-gray-400">
                ยังไม่มีรีวิวจากผู้ซื้อ
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: รายละเอียดผู้ใช้ */}
      {activeTab === 'detail' && (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4 text-xs text-gray-700">
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
            <span>ยืนยันตัวตนเป็นนักศึกษา มทร.อีสาน เรียบร้อยแล้ว</span>
          </div>
          {publicUser.faculty && (
            <div className="flex items-center gap-3">
              <span className="text-base shrink-0">🏛️</span>
              <span>{publicUser.faculty} {publicUser.major ? `(${publicUser.major})` : ''}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Package size={18} className="text-[#f95721] shrink-0" />
            <span>สินค้าที่ลงขาย {userListings.length} รายการ</span>
          </div>
          <div className="flex items-center gap-3">
            <Search size={18} className="text-sky-500 shrink-0" />
            <span>โพสตามหาสินค้า {userWantToBuys.length} รายการ</span>
          </div>
          <div className="flex items-center gap-3">
            <Award size={18} className="text-amber-500 shrink-0" />
            <span>สำเร็จการซื้อขาย {publicUser.successful_deal_count || 0} รายการ</span>
          </div>
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-purple-500 shrink-0" />
            <span>คะแนนความน่าเชื่อถือ {publicUser.trust_score ?? 100} คะแนน</span>
          </div>
        </div>
      )}
    </div>
  );
}