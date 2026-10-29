import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import {
  LogOut,
  Star,
  Package,
  Calendar,
  ChevronRight,
  Heart,
  CalendarClock,
  Receipt,
  Search,
  Home,
  MessageCircle,
  Bell,
  Store,
  Phone,
  Pencil,
  Edit2,
  X,
} from 'lucide-react';
import { useReviewStore } from '@/store/reviewStore';
import { useMeetupStore } from '@/store/meetupStore';
import { useMyListingsStore } from '@/store/myListingsStore';
import { useWantToBuyStore } from '@/store/wantToBuyStore';
import { useNotificationStore } from '@/store/notificationStore';
import { useWishlistStore } from '@/store/cartWishlistStore';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/common/Button';
import { ProductCard } from '@/components/product/ProductCard';
import { formatListing } from '@/services/productService';

// ─── ตั้งค่าตัวครอปรูปโปรไฟล์วงกลม ───
const CROP_DISPLAY_SIZE = 260; // px, ขนาดวงกลมที่เห็นตอนลากปรับตำแหน่ง
const CROP_OUTPUT_SIZE = 360;  // px, ขนาดไฟล์ผลลัพธ์ที่อัปโหลดขึ้นเซิร์ฟเวอร์ (ลดจาก 480 → 360 เพื่อประหยัดพื้นที่)

// สถานะสินค้าที่ไม่อยากให้แสดงใน "สินค้าของฉัน" อีกต่อไป (นัดรับ/จองแล้ว/ขายแล้ว)
const HIDDEN_LISTING_STATUSES = ['reserved', 'sold', 'booked'];

function isHiddenListing(product) {
  const raw = String(
    product?.status ?? product?.statusCode ?? product?.status_code ?? ''
  ).toLowerCase();
  return HIDDEN_LISTING_STATUSES.includes(raw);
}

// สเกลพื้นฐานที่ทำให้รูป cover วงกลมพอดี (ด้านสั้นสุดของรูป = เส้นผ่านศูนย์กลางวงกลม)
function getBaseScale(naturalSize) {
  if (!naturalSize) return 1;
  return Math.max(
    CROP_DISPLAY_SIZE / naturalSize.width,
    CROP_DISPLAY_SIZE / naturalSize.height
  );
}

// จำกัดระยะเลื่อนไม่ให้ลากจนเห็นขอบรูป (ต้องเต็มวงกลมเสมอ)
function clampCropOffset(offset, naturalSize, zoom) {
  const baseScale = getBaseScale(naturalSize);
  const scale = baseScale * zoom;
  const drawWidth = naturalSize.width * scale;
  const drawHeight = naturalSize.height * scale;
  const maxX = Math.max(0, (drawWidth - CROP_DISPLAY_SIZE) / 2);
  const maxY = Math.max(0, (drawHeight - CROP_DISPLAY_SIZE) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(-maxY, offset.y)),
  };
}

// วาดผลลัพธ์ตามตำแหน่ง/ซูมที่เลือกไว้ลง canvas วงกลม แล้ว export เป็น Blob
function getCroppedAvatarBlob(src, offset, zoom, naturalSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = CROP_OUTPUT_SIZE;
        canvas.height = CROP_OUTPUT_SIZE;
        const ctx = canvas.getContext('2d');

        const outputFactor = CROP_OUTPUT_SIZE / CROP_DISPLAY_SIZE;
        const baseScale = getBaseScale(naturalSize);
        const drawWidth = naturalSize.width * baseScale * zoom * outputFactor;
        const drawHeight = naturalSize.height * baseScale * zoom * outputFactor;
        const dx = (CROP_OUTPUT_SIZE - drawWidth) / 2 + offset.x * outputFactor;
        const dy = (CROP_OUTPUT_SIZE - drawHeight) / 2 + offset.y * outputFactor;

        ctx.beginPath();
        ctx.arc(CROP_OUTPUT_SIZE / 2, CROP_OUTPUT_SIZE / 2, CROP_OUTPUT_SIZE / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();

        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);

        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('สร้างรูปไม่สำเร็จ'))),
          'image/jpeg',
          0.85
        );
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'));
    img.src = src;
  });
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

export function SelfProfilePage({ user, logout, navigate }) {
  const listings = useMyListingsStore((s) => s.listings);
  const setListings = useMyListingsStore((s) => s.setListings);
  const requests = useWantToBuyStore((s) => s.requests);
  const wishlistIds = useWishlistStore((s) => s.productIds);
  const fetchWishlist = useWishlistStore((s) => s.fetchWishlist);
  const meetups = useMeetupStore((s) => s.meetups);
  const notifications = useNotificationStore((s) => s.notifications);

  // ไม่แสดงสินค้าที่ "นัดรับแล้ว/จองแล้ว/ขายแล้ว" ในหน้าโปรไฟล์ตัวเองอีกต่อไป
  const visibleListings = useMemo(
    () => listings.filter((p) => !isHiddenListing(p)),
    [listings]
  );

  const [profileData, setProfileData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef(null);

  // ─── สถานะตัวครอปรูปโปรไฟล์ ───
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [imgNaturalSize, setImgNaturalSize] = useState(null);
  const dragStateRef = useRef(null);

  const loadProfile = async () => {
    try {
      const res = await api.getMyProfile();
      if (res?.user) {
        setProfileData(res.user);
        setStatsData(res.stats);
        setEditForm({
          username: res.user.username || '',
          phone: res.user.phone || '',
        });
      }
    } catch (err) {
      console.warn('Could not load backend profile:', err);
    }
  };

  const loadMyListings = async () => {
    try {
      const res = await api.getMyListings();
      setListings((res?.listings ?? []).map(formatListing));
    } catch (err) {
      console.warn('Could not load my listings:', err);
    }
  };

  const [dbReviews, setDbReviews] = useState([]);

  const loadReviews = async () => {
    const uid = user?.id;
    if (!uid) return;
    try {
      const res = await api.getUserReviews(uid);
      if (res?.reviews) {
        setDbReviews(res.reviews);
      }
    } catch (err) {
      console.warn('Could not load user reviews:', err);
    }
  };

  useEffect(() => {
    loadProfile();
    loadMyListings();
    loadReviews();
    fetchWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateProfile(editForm);
      await loadProfile();
      setIsEditOpen(false);
    } catch (err) {
      alert(err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  // ─── เลือกรูปโปรไฟล์ → เปิดหน้าต่างครอปแทนการอัปโหลดทันที ───
  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // เคลียร์ไว้ก่อน เผื่อเลือกไฟล์เดิมซ้ำในครั้งถัดไป
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    setCropSrc(URL.createObjectURL(file));
    setCropOffset({ x: 0, y: 0 });
    setCropZoom(1);
    setImgNaturalSize(null);
    setCropOpen(true);
  };

  const closeCropModal = () => {
    setCropOpen(false);
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setImgNaturalSize(null);
  };

  const handleZoomChange = (value) => {
    const zoom = Number(value);
    setCropZoom(zoom);
    if (imgNaturalSize) {
      setCropOffset((prev) => clampCropOffset(prev, imgNaturalSize, zoom));
    }
  };

  const handleCropPointerDown = (e) => {
    if (!imgNaturalSize) return;
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originX: cropOffset.x,
      originY: cropOffset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCropPointerMove = (e) => {
    if (!dragStateRef.current || !imgNaturalSize) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    setCropOffset(
      clampCropOffset(
        { x: dragStateRef.current.originX + dx, y: dragStateRef.current.originY + dy },
        imgNaturalSize,
        cropZoom
      )
    );
  };

  const handleCropPointerUp = () => {
    dragStateRef.current = null;
  };

  const handleConfirmCrop = async () => {
    if (!cropSrc || !imgNaturalSize) return;
    setUploadingAvatar(true);
    try {
      const blob = await getCroppedAvatarBlob(cropSrc, cropOffset, cropZoom, imgNaturalSize);
      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });

      const urls = await api.uploadImages([croppedFile]);
      const newUrl = urls?.[0];
      if (!newUrl) throw new Error('อัปโหลดไม่สำเร็จ ไม่ได้รับ URL รูปภาพกลับมา');

      await api.updateProfile({ avatarUrl: newUrl });
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.setState({
          user: {
            ...currentUser,
            avatar_url: newUrl,
            avatarUrl: newUrl,
            profile_image_url: newUrl,
          },
        });
      }
      await loadProfile();
      closeCropModal();
    } catch (err) {
      alert(err.message || 'อัปโหลดรูปโปรไฟล์ไม่สำเร็จ');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const myId = user?.id ?? 'me';

  const allReviews = useReviewStore((s) => s.reviews);
  const storeReviews = useMemo(
    () => allReviews.filter((r) => String(r.targetUserId) === String(myId)),
    [allReviews, myId]
  );

  const combinedReviews = useMemo(() => {
    const list = dbReviews.map((r) => ({
      id: r.id,
      reviewerName: r.reviewer?.display_name || 'ผู้ใช้งาน',
      reviewerRole: r.reviewer_role || null,
      rating: Number(r.rating || 5),
      comment: r.comment || '',
      images: r.images || [],
      createdAt: r.created_at,
    }));
    const dbIds = new Set(list.map((r) => String(r.id)));
    storeReviews.forEach((r) => {
      if (!dbIds.has(String(r.id))) {
        list.push({
          id: r.id,
          reviewerName: r.reviewerName || 'ผู้ใช้งาน',
          reviewerRole: r.reviewerRole || null,
          rating: Number(r.rating || 5),
          comment: r.comment || '',
          images: r.images || [],
          createdAt: r.createdAt,
        });
      }
    });
    return list;
  }, [dbReviews, storeReviews]);

  const topReviewCount = Number(statsData?.reviewCount ?? combinedReviews.length ?? 0);
  const topAverageRating = Number(statsData?.averageRating ?? (combinedReviews.length ? combinedReviews.reduce((sum, r) => sum + r.rating, 0) / combinedReviews.length : 0));

  const cardReviewCount = combinedReviews.length;
  const cardAverageRating = cardReviewCount
    ? combinedReviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / cardReviewCount
    : 0;

  const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => {
    const count = combinedReviews.filter((r) => Math.round(r.rating) === star).length;
    const pct = cardReviewCount > 0 ? Math.round((count / cardReviewCount) * 100) : 0;
    return { star, count, pct };
  });

  const myMeetups = meetups.filter(
    (m) => String(m.buyerId) === String(myId) || String(m.sellerId) === String(myId)
  );
  const myRequests = requests.filter((r) => String(r.author?.id) === String(myId));

  const unread = notifications.filter((n) => !n.read).length;

  const sidebarLinks = [
    { label: 'หน้าหลักโปรไฟล์', icon: Home, path: '/profile' },
    { label: 'สินค้าของฉัน', icon: Store, path: '/my-products' },
    { label: 'โพสตามหาสินค้าของฉัน', icon: Search, path: '/want-to-buy' },
    { label: 'แชท', icon: MessageCircle, path: '/chat' },
    { label: 'แจ้งเตือน', icon: Bell, path: '/notifications', badge: unread > 0 ? unread : null },
    { label: 'รายการโปรด', icon: Heart, path: '/wishlist' },
    { label: 'การนัดรับสินค้า', icon: CalendarClock, path: '/meetups' },
    { label: 'ประวัติการซื้อขาย', icon: Receipt, path: '/transactions' },
    { label: 'รีวิวของฉัน', icon: Star, path: '/reviews' },
  ];

  const quickStats = [
    { label: 'สินค้าของฉัน', icon: Store, value: visibleListings.length, path: '/my-products' },
    { label: 'โพสตามหาสินค้า', icon: Search, value: myRequests.length, path: '/want-to-buy' },
    { label: 'รายการโปรด', icon: Heart, value: wishlistIds.length, path: '/wishlist' },
    { label: 'การนัดรับสินค้า', icon: CalendarClock, value: myMeetups.length, unit: 'นัดหมาย', path: '/meetups' },
    { label: 'ประวัติการซื้อขาย', icon: Receipt, value: statsData?.transactionCount ?? 0, unit: 'รายการ', path: '/transactions' },
  ];

  const avatarUrl = profileData?.avatar_url || profileData?.profile_image_url;

  return (
    <div className="flex flex-col md:flex-row gap-5">
      {/* ─── Profile Navigation Sidebar ─── */}
      <aside className="w-full md:w-60 shrink-0 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          {sidebarLinks.map((item) => {
            const Icon = item.icon;
            const active = window.location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 text-xs font-semibold transition-colors border-b border-gray-50 last:border-0 ${
                  active
                    ? 'bg-[#f95721] font-bold text-white'
                    : 'text-gray-700 hover:bg-orange-50 hover:text-[#f95721]'
                }`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Help Card */}
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 text-center">
          <div className="mb-2 flex justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-[#f95721]">
              <Phone size={18} />
            </div>
          </div>
          <p className="text-xs font-bold text-ink-900">ต้องการความช่วยเหลือ?</p>
          <p className="mt-0.5 text-[11px] text-gray-500">ติดต่อทีมงาน RmutiMarket ได้ตลอดเวลา</p>
          <button className="mt-3 w-full rounded-xl bg-[#f95721] py-2 text-xs font-bold text-white hover:bg-orange-600 transition-colors shadow-xs">
            ติดต่อเรา
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <div className="flex-1 space-y-5 min-w-0">
        {/* Profile Header Card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#ff5722] to-[#ff8a65] text-3xl font-black text-white shadow-md">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    (profileData?.username || profileData?.display_name || user?.name || 'U').charAt(0).toUpperCase()
                  )}
                </div>
                <button
                  onClick={handleAvatarClick}
                  disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md border border-gray-100 text-gray-500 hover:text-[#f95721] disabled:opacity-50"
                  title="เปลี่ยนรูปโปรไฟล์"
                >
                  <Pencil size={11} />
                </button>
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 text-[9px] font-bold text-white">
                    กำลังอัปโหลด...
                  </div>
                )}
              </div>

              {/* Info */}
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-extrabold text-ink-900">
                    {profileData?.username || profileData?.display_name || profileData?.full_name || user?.name || 'สมาชิก RMUTI'}
                  </h1>
                  <button onClick={() => setIsEditOpen(true)} className="p-1 rounded-lg hover:bg-orange-50 text-gray-400 hover:text-[#f95721] transition-colors" title="แก้ไขโปรไฟล์">
                    <Edit2 size={15} />
                  </button>
                </div>

                {(profileData?.full_name || profileData?.display_name || user?.name) && (
                  <p className="text-xs font-semibold text-gray-600 mt-0.5">
                    {profileData?.full_name || profileData?.display_name || user?.name}
                  </p>
                )}

                {profileData?.created_at && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                    <Calendar size={12} />
                    สมาชิกตั้งแต่ {new Date(profileData.created_at).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })}
                  </p>
                )}

                <p className="text-xs text-gray-500 mt-0.5">
                  📍 {profileData?.campus || 'มทร.อีสาน นครราชสีมา'} {profileData?.faculty ? `· คณะ${profileData.faculty}` : ''}
                </p>

                <p className={`mt-2 text-xs font-medium ${profileData?.bio ? 'text-gray-700' : 'text-gray-400'}`}>
                  {profileData?.bio || 'ยังไม่มีคำแนะนำตัว'}
                </p>

                {profileData?.phone && (
                  <p className="mt-1 text-[11px] text-gray-500">📞 {profileData.phone}</p>
                )}
              </div>
            </div>

            {/* Top stats */}
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
                <p className="text-[11px] font-semibold text-gray-400">การตอบกลับ</p>
                <p className="text-xl font-black text-gray-300 mt-1">ยังไม่มีข้อมูล</p>
                <p className="text-[10px] text-gray-400 mt-1">รอข้อมูลจากการแชท</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          {quickStats.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.path}
                to={s.path}
                className="flex flex-col items-center gap-1 text-center p-2 rounded-xl hover:bg-orange-50/50 transition-colors group"
              >
                <Icon size={20} className="text-[#f95721]" />
                <span className="text-lg font-black text-ink-900 group-hover:text-[#f95721]">{s.value}</span>
                <span className="text-[11px] text-gray-500">{s.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Reviews Section */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Rating Breakdown */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-ink-900">รีวิวและความน่าเชื่อถือ</h2>
            {cardReviewCount > 0 ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-[#f95721]">
                    <Star size={24} className="fill-[#f95721]" />
                  </div>
                  <div>
                    <span className="text-3xl font-black text-ink-900">{cardAverageRating.toFixed(1)}</span>
                    <StarRow rating={cardAverageRating} />
                    <p className="text-[11px] text-gray-400">คำนวณจาก {cardReviewCount} รีวิวผู้ซื้อจริง</p>
                  </div>
                </div>
                {ratingBreakdown.map(({ star, count, pct }) => (
                  <div key={star} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="w-6 text-right font-medium text-gray-600">{star} ดาว</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-[#f95721] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-gray-400">{count}</span>
                  </div>
                ))}
              </>
            ) : (
              <div className="py-6 text-center">
                <Star size={28} className="mx-auto text-gray-200 mb-2" />
                <p className="text-xs text-gray-400">ยังไม่มีรีวิว — เริ่มขายสินค้าเพื่อสะสมคะแนนความน่าเชื่อถือ</p>
              </div>
            )}
          </div>

          {/* Recent Reviews */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink-900">รีวิวล่าสุด</h2>
              <Link to="/reviews" className="text-xs font-semibold text-[#f95721] hover:underline flex items-center gap-0.5">
                ดูทั้งหมด <ChevronRight size={13} />
              </Link>
            </div>
            <div className="space-y-3">
              {combinedReviews.length > 0 ? (
                combinedReviews.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 p-2.5 rounded-xl bg-gray-50/50 border border-gray-100">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-[#f95721]">
                        {r.reviewerName?.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
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
                          <StarRow rating={r.rating} size={10} />
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{r.comment || 'ไม่มีข้อความรีวิว'}</p>
                      </div>
                    </div>
                    {r.images && r.images.length > 0 && (
                      <div className="flex items-center gap-1.5 pl-10 overflow-x-auto">
                        {r.images.map((imgUrl, i) => (
                          <a key={i} href={imgUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={imgUrl}
                              alt="รูปจบงาน"
                              className="h-12 w-12 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity shrink-0"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-6 text-center">
                  <p className="text-xs text-gray-400">ยังไม่มีรีวิวจากผู้ซื้อ</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* My Products Preview */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink-900">สินค้าของฉัน ({visibleListings.length})</h2>
            <Link to="/my-products" className="text-xs font-semibold text-[#f95721] hover:underline flex items-center gap-0.5">
              ดูทั้งหมด <ChevronRight size={13} />
            </Link>
          </div>
          {visibleListings.length === 0 ? (
            <div className="py-8 text-center bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-xs text-gray-500 mb-3">คุณยังไม่ได้ลงขายสินค้า</p>
              <Link
                to="/products/create"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#f95721] px-5 py-2 text-xs font-bold text-white hover:bg-orange-600 transition-colors shadow-xs"
              >
                + เริ่มลงขายสินค้า
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {visibleListings.slice(0, 3).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
              <Link
                to="/products/create"
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 aspect-square text-gray-400 hover:border-orange-300 hover:text-[#f95721] transition-colors"
              >
                <span className="text-3xl font-light">+</span>
                <span className="text-xs font-bold">เพิ่มสินค้าใหม่</span>
              </Link>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <div className="pt-2">
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => {
              logout();
              navigate('/');
            }}
          >
            <LogOut size={16} className="mr-2" />
            ออกจากระบบ
          </Button>
        </div>
      </div>

      {/* ─── Edit Profile Modal (แก้ได้แค่ username กับเบอร์โทร) ─── */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-extrabold text-ink-900 text-base">✏️ แก้ไขข้อมูลโปรไฟล์</h3>
              <button
                onClick={() => setIsEditOpen(false)}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">ชื่อผู้ใช้ (Username)</label>
                <input
                  type="text"
                  required
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#f95721]"
                  placeholder="เช่น somchai_rmuti"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#f95721]"
                  placeholder="08xxxxxxxx"
                />
              </div>

              <p className="text-[11px] text-gray-400">
                * ข้อมูลอื่นๆ (ชื่อ-นามสกุล, คณะ, รหัสนักศึกษา ฯลฯ) ไม่สามารถแก้ไขเองได้
                หากต้องการเปลี่ยนกรุณาติดต่อทีมงาน
              </p>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsEditOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-[#f95721] hover:bg-orange-600 text-white"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Crop รูปโปรไฟล์: ลากเพื่อจัดตำแหน่งให้อยู่กึ่งกลางวงกลม ─── */}
      {cropOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-extrabold text-ink-900 text-base">ปรับตำแหน่งรูปโปรไฟล์</h3>
              <button
                onClick={closeCropModal}
                className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center gap-4">
              <div
                className="relative overflow-hidden rounded-full bg-gray-100 border-4 border-orange-100 cursor-grab active:cursor-grabbing select-none"
                style={{ width: CROP_DISPLAY_SIZE, height: CROP_DISPLAY_SIZE, touchAction: 'none' }}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerLeave={handleCropPointerUp}
              >
                {cropSrc && (
                  <img
                    src={cropSrc}
                    alt="ครอปรูปโปรไฟล์"
                    draggable={false}
                    onLoad={(e) =>
                      setImgNaturalSize({
                        width: e.target.naturalWidth,
                        height: e.target.naturalHeight,
                      })
                    }
                    style={
                      imgNaturalSize
                        ? {
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: imgNaturalSize.width * getBaseScale(imgNaturalSize) * cropZoom,
                            height: imgNaturalSize.height * getBaseScale(imgNaturalSize) * cropZoom,
                            maxWidth: 'none',
                            transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))`,
                          }
                        : { opacity: 0, position: 'absolute' }
                    }
                  />
                )}
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                ลากรูปเพื่อจัดตำแหน่งให้อยู่กึ่งกลางวงกลม
              </p>

              <div className="w-full flex items-center gap-2">
                <span className="text-[11px] text-gray-400">เล็ก</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={cropZoom}
                  onChange={(e) => handleZoomChange(e.target.value)}
                  className="flex-1 accent-[#f95721]"
                />
                <span className="text-[11px] text-gray-400">ใหญ่</span>
              </div>
            </div>

            <div className="flex gap-2 p-5 pt-0">
              <Button type="button" variant="outline" className="flex-1" onClick={closeCropModal}>
                ยกเลิก
              </Button>
              <Button
                type="button"
                disabled={uploadingAvatar || !imgNaturalSize}
                className="flex-1 bg-[#f95721] hover:bg-orange-600 text-white"
                onClick={handleConfirmCrop}
              >
                {uploadingAvatar ? 'กำลังอัปโหลด...' : 'ยืนยัน'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}