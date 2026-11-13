import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Heart, ImageOff, MessageCircle, ShieldCheck, Star,
  CalendarClock, ShieldAlert, ChevronLeft,
  CheckCircle2, ShoppingBag, MapPin, Clock, ArrowRight, Flag, X
} from 'lucide-react';
import { fetchProductDetail } from '@/services/productService';
import { formatCurrency } from '@/utils/formatCurrency';
import { Button } from '@/components/common/Button';
import { ReportModal } from '@/components/common/ReportModal';
import { useWishlistStore } from '@/store/cartWishlistStore';
import { useAuthStore } from '@/store/authStore';
import { useMeetupStore } from '@/store/meetupStore'; // ใช้ทั้ง hook และ useMeetupStore.getState() สำหรับ rollback
import { useNotificationStore } from '@/store/notificationStore';
import { meetupPoints } from '@/constants/meetupPoints';
import { api } from '@/lib/api';

// ─── ช่วงเวลาที่อนุญาตให้นัดรับ ─────────────────────────────────────────────
const MEETUP_START = '08:00';
const MEETUP_END = '20:00';
const MEETUP_HOURS_TEXT = 'นัดรับได้เฉพาะเวลา 08:00 – 20:00 น. เท่านั้น';

function isWithinMeetupHours(t) {
  if (!t) return false;
  const s = String(t).slice(0, 5);
  return s >= MEETUP_START && s <= MEETUP_END;
}

// วันที่/เวลาตามเครื่องผู้ใช้ (toISOString ใช้ UTC ทำให้วันที่เพี้ยนช่วงเที่ยงคืนถึง 07:00 ตามเวลาไทย)
function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeString(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const conditionLabel = {
  new: 'มือหนึ่ง',
  like_new: 'มือหนึ่ง',
  used: 'มือสอง',
  used_good: 'มือสอง',
  used_normal: 'มือสอง',
  has_defect: 'มือสอง',
  damaged: 'มือสอง',
  'มือหนึ่ง': 'มือหนึ่ง',
  'มือสอง': 'มือสอง',
  'สินค้ามือ 1': 'มือหนึ่ง',
  'สินค้ามือ 2': 'มือสอง',
};

const conditionColor = {
  new: 'bg-emerald-600 text-white',
  like_new: 'bg-emerald-600 text-white',
  used: 'bg-blue-600 text-white',
  used_good: 'bg-blue-600 text-white',
  used_normal: 'bg-blue-600 text-white',
  has_defect: 'bg-amber-600 text-white',
  damaged: 'bg-red-600 text-white',
  'มือหนึ่ง': 'bg-emerald-600 text-white',
  'มือสอง': 'bg-blue-600 text-white',
};

export function getConditionBadge(conditionVal, productObj) {
  // ดึงชื่อสภาพสินค้าโดยตรงจากตาราง product_conditions
  let label = '';
  if (productObj?.product_conditions && typeof productObj.product_conditions === 'object' && productObj.product_conditions.name) {
    label = productObj.product_conditions.name;
  } else if (productObj?.conditionName) {
    label = productObj.conditionName;
  } else if (productObj?.condition_name) {
    label = productObj.condition_name;
  } else if (conditionVal && typeof conditionVal === 'object' && conditionVal.name) {
    label = conditionVal.name;
  } else if (typeof conditionVal === 'string') {
    label = conditionLabel[conditionVal] || conditionVal;
  }

  if (!label) label = 'มือสอง';

  const str = String(label).toLowerCase().trim();
  const isNew =
    str === 'new' ||
    str === 'like_new' ||
    str === '1' ||
    str.includes('หนึ่ง') ||
    str.includes('มือ1') ||
    str.includes('มือ 1');

  const className = isNew ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white';
  return { label, className };
}

export function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const { isAuthenticated, user } = useAuthStore();
  const createMeetupRequest = useMeetupStore((s) => s.createRequest);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Buy & Meetup Modal state
  const [showActionChoiceModal, setShowActionChoiceModal] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(meetupPoints[0]?.name || 'โรงอาหารกลาง มทร.อีสาน');
  const [meetupDate, setMeetupDate] = useState(() => localDateString());
  const [meetupTime, setMeetupTime] = useState(() => {
    // ถ้าตอนนี้อยู่นอกช่วง 08:00–20:00 ให้เริ่มที่ 09:00 แทน
    const now = localTimeString();
    return isWithinMeetupHours(now) ? now : '09:00';
  });
  const [timeError, setTimeError] = useState('');
  const [submittingBuy, setSubmittingBuy] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  const isSaved = useWishlistStore((s) => (product ? s.isSaved(product.id) : false));
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchProductDetail(id).then((p) => {
      setProduct(p ?? null);
      setLoading(false);
    });
  }, [id]);

  // ─── Click Handlers with Authentication Check ───
  const handleBuyClick = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/products/${product.id}` } });
      return;
    }
    setShowActionChoiceModal(true);
  };

  const handleChatClick = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/chat?productId=${product?.id}` } });
      return;
    }
    navigate(`/chat?productId=${product?.id}`, { state: { product } });
  };

  const handleWishlistClick = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/products/${product.id}` } });
      return;
    }
    toggleWishlist(product.id);
  };

  const handleConfirmBuyAndMeetup = async (e) => {
    e.preventDefault();
    if (!product || submittingBuy) return;

    // ตรวจเวลานัดรับต้องอยู่ในช่วง 08:00 – 20:00
    if (!meetupTime) {
      setTimeError('กรุณาเลือกเวลานัดรับ');
      return;
    }
    if (!isWithinMeetupHours(meetupTime)) {
      setTimeError(`⏰ ${MEETUP_HOURS_TEXT}`);
      return;
    }
    setTimeError('');
    setSubmittingBuy(true);

    const point = meetupPoints.find((p) => p.name === selectedLocation) || meetupPoints[0];

    // ตรวจสอบเวลาทับซ้อน (ผู้ซื้อ + ผู้ขาย + สินค้า) ก่อนยิง API สร้างนัด
    // ไม่เรียก createMeetupRequest ใน localStorage เพราะ backend เป็น source of truth
    // — ตรวจสอบ overlap และสร้างนัดจาก API โดยตรง
    try {
      const res = await api.createMeetup({
        listingId: product.id,
        meetupPointId: point?.id || null,
        locationId: point?.id || null,
        locationName: selectedLocation,
        locationLat: point?.lat || null,
        locationLng: point?.lng || null,
        date: meetupDate,
        time: meetupTime,
        // ไม่มีข้อความถึงผู้ขายแล้ว (ฐานข้อมูลไม่มีที่เก็บ) ส่งแค่ชื่อจุดนัดเหมือนหน้าเลือกแผนที่
        note: `จุดนัด: ${selectedLocation}`,
        locationDetail: selectedLocation,
      });

      const meetupId = res?.meetupId;

      // Send notifications
      addNotification({
        userId: product.seller?.id,
        title: '🛒 มีคำขอซื้อและนัดรับสินค้าใหม่!',
        message: `${user?.name || 'ผู้ซื้อ'} ขอซื้อและนัดรับ "${product.title}" วันที่ ${meetupDate} เวลา ${meetupTime} น. ณ ${selectedLocation}`,
        type: 'meetup',
        link: '/meetups',
      });

      addNotification({
        userId: user?.id || 'me',
        title: '📤 ส่งคำขอนัดรับสินค้าแล้ว',
        message: `ส่งคำขอนัดรับ "${product.title}" ให้ผู้ขายแล้ว กรุณารอการตอบรับ`,
        type: 'meetup',
        link: '/meetups',
      });

      setSubmittingBuy(false);
      setShowBuyModal(false);
      navigate('/meetups', { state: { justCreated: meetupId } });
    } catch (err) {
      console.error('Failed to submit meetup:', err);
      const msg = err.message || 'เกิดข้อผิดพลาดในการส่งคำขอนัดรับ';
      if (msg.includes('ซ้อนทับ') || msg.includes('เวลา')) {
        setTimeError(msg);
      } else {
        alert(msg);
      }
      setSubmittingBuy(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="aspect-square animate-pulse rounded-2xl bg-surface-muted" />
        <div className="flex flex-col gap-4">
          <div className="h-6 w-2/3 animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-10 w-1/3 animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-surface-muted" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-muted text-ink-300">
          <ImageOff size={32} />
        </span>
        <div>
          <p className="font-bold text-ink-700">ไม่พบสินค้านี้</p>
          <p className="mt-1 text-sm text-ink-400">อาจถูกลบหรือขายไปแล้ว</p>
        </div>
        <Link
          to="/products"
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2 text-sm font-bold text-white hover:bg-brand-600 transition-colors"
        >
          <ChevronLeft size={15} />
          กลับไปดูสินค้าอื่น
        </Link>
      </div>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : [];
  const currentImage = images[selectedImageIndex] || images[0];

  const getImgUrl = (img) => {
    if (!img) return '';
    return img.imageUrl || img.image_url || img.url || (typeof img === 'string' ? img : '');
  };
  const currentImageUrl = getImgUrl(currentImage);

  const rawSellerUsername = product.seller?.username || product.users?.username || '';
  const sellerUsername = rawSellerUsername ? rawSellerUsername.replace(/^@+/, '').trim() : '';
  const sellerFullName = product.seller?.fullName || product.seller?.full_name || product.users?.full_name || '';
  const sellerDisplayName = sellerUsername || product.seller?.displayName || product.seller?.display_name || sellerFullName || 'ผู้ขาย RMUTI';
  const sellerSecondaryName = sellerFullName && sellerFullName !== sellerDisplayName ? sellerFullName : null;

  const isMyProduct = user && product.seller && (
    user.id === product.seller.id ||
    (user.username && sellerUsername && user.username.replace(/^@+/, '').toLowerCase() === sellerUsername.toLowerCase()) ||
    user.name === product.seller.displayName ||
    user.name === sellerFullName
  );

  const conditionBadge = getConditionBadge(
    product.product_conditions?.name || product.condition_name || product.conditionName || product.condition || product.condition_id,
    product
  );

  const selectedPoint = meetupPoints.find((p) => p.name === selectedLocation);

  return (
    // pb-24 บนมือถือ เพื่อไม่ให้แถบปุ่มด้านล่าง (fixed) บังเนื้อหา
    <div className="mx-auto max-w-6xl space-y-4 pb-24 md:pb-0">
      {/* Top Back navigation */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-surface-border bg-white px-3 py-1.5 text-xs font-bold text-ink-700 hover:text-[#f95721] hover:border-orange-200 transition-colors shadow-2xs"
        aria-label="ย้อนกลับ"
      >
        <ChevronLeft size={16} />
        ย้อนกลับ
      </button>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">

        {/* ── Image column ── */}
        <div className="flex flex-col gap-3">
          <div className="relative overflow-hidden rounded-2xl bg-surface-muted shadow-sm aspect-square">
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt={product.title}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80";
                }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-ink-300">
                <ImageOff size={48} />
              </div>
            )}

            {/* Condition badge on image (สินค้ามือ 1 / สินค้ามือ 2) */}
            {conditionBadge && (
              <span className={`absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${conditionBadge.className}`}>
                {conditionBadge.label}
              </span>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, idx) => {
                const thumbUrl = getImgUrl(img);
                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all ${
                      idx === selectedImageIndex ? 'border-brand-500 scale-105 shadow-sm' : 'border-gray-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={thumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80";
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Details column ── */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-ink-900 leading-snug">{product.title}</h1>
            <div className="mt-2.5 sm:mt-3 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-2xl sm:text-3xl font-black text-[#f95721]">{formatCurrency(product.price)}</span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-sm sm:text-base text-ink-300 line-through">
                  {formatCurrency(product.originalPrice)}
                </span>
              )}
            </div>

            {/* Safe campus trading indicator */}
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-emerald-700 border border-emerald-200/60">
              <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
              <span>นัดรับปลอดภัยในรั้ว มทร.อีสาน (ชำระเงินต่อหน้าเมื่อตรวจรับของ)</span>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-surface-border bg-surface-muted/50 p-4">
            <p className="text-xs font-bold text-ink-500 mb-1.5 uppercase tracking-wider">รายละเอียดสินค้า</p>
            <p className="text-sm leading-relaxed text-ink-700 whitespace-pre-line">{product.description}</p>
          </div>

          {/* Seller Card */}
          <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-white p-4 shadow-xs">
            <Link
              to={`/profile/${product.seller?.id || product.seller_id || product.users?.id || 'seller'}`}
              className="flex items-center gap-3 group hover:opacity-85 transition-opacity"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 font-bold text-white text-lg shadow-sm overflow-hidden">
                {product.seller?.avatarUrl ? (
                  <img src={product.seller.avatarUrl} alt={sellerDisplayName} className="h-full w-full object-cover" />
                ) : (
                  (sellerDisplayName.charAt(0) || 'ผ').toUpperCase()
                )}
              </div>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900 group-hover:text-brand-600 transition-colors">
                  {sellerDisplayName}
                  <ShieldCheck size={14} className="text-brand-500" />
                  <CheckCircle2 size={14} className="text-emerald-500" />
                </p>
                {sellerSecondaryName && (
                  <p className="text-xs text-ink-500 font-medium -mt-0.5">{sellerSecondaryName}</p>
                )}
                <p className="flex items-center gap-1 text-xs text-ink-500 mt-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  <span className="font-semibold text-ink-700">{product.seller?.trustScore?.toFixed(1) || '5.0'}</span>
                  <span>· {product.seller?.reviewCount || 0} รีวิว</span>
                </p>
              </div>
            </Link>
            <Link
              to={`/profile/${product.seller?.id || product.seller_id || product.users?.id || 'seller'}`}
              className="rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100 transition-colors shadow-2xs"
            >
              ดูโปรไฟล์
            </Link>
          </div>

          {/* ─── Main Action Buttons (ซื้อสินค้า / แชท / เซฟ) ─── */}
          {isMyProduct ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
              <p className="text-sm font-bold text-amber-800">นี่คือสินค้าที่คุณลงขาย</p>
              <Link
                to={`/products/${product.id}/edit`}
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 transition-colors shadow-xs"
              >
                แก้ไขสินค้า
              </Link>
            </div>
          ) : (
            // ซ่อนบนมือถือ เพราะมีแถบปุ่มติดด้านล่างจอ (fixed) อยู่แล้ว ไม่ให้ปุ่มซ้ำกัน
            <div className="hidden gap-2 sm:gap-2.5 md:flex">
              {/* ปุ่มซื้อสินค้า / นัดรับ */}
              <button
                onClick={handleBuyClick}
                className="flex flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-3 sm:px-5 py-3 sm:py-3.5 text-xs sm:text-sm font-extrabold text-white shadow-md shadow-orange-200 hover:from-brand-600 hover:to-orange-600 hover:shadow-lg active:scale-98 transition-all duration-200"
              >
                <ShoppingBag size={17} className="shrink-0" />
                <span className="truncate">ซื้อสินค้า / ขอนัดรับ</span>
              </button>

              {/* ปุ่มแชทกับผู้ขาย */}
              <button
                onClick={handleChatClick}
                className="flex items-center justify-center gap-1.5 px-3 sm:px-4 rounded-xl border border-gray-200 bg-white text-ink-700 shadow-xs hover:border-brand-300 hover:bg-orange-50 hover:text-brand-600 font-bold text-xs transition-all shrink-0"
                aria-label="แชทกับผู้ขาย"
              >
                <MessageCircle size={18} />
                <span className="hidden sm:inline">ทักแชท</span>
              </button>

              {/* ปุ่ม Wishlist */}
              <button
                onClick={handleWishlistClick}
                aria-pressed={isSaved}
                aria-label="บันทึกสินค้า"
                className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl border shadow-xs transition-all ${
                  isSaved
                    ? 'border-brand-300 bg-brand-50 text-brand-500'
                    : 'border-gray-200 bg-white text-ink-400 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-500'
                }`}
              >
                <Heart size={18} className={isSaved ? 'fill-brand-500' : ''} />
              </button>
            </div>
          )}

          {/* ปุ่มรายงานสินค้า */}
          {!isMyProduct && (
            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) {
                    navigate('/login', { state: { from: location.pathname } });
                    return;
                  }
                  setShowReportModal(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-400 hover:text-red-500 transition-colors py-1 px-2 rounded-lg hover:bg-red-50"
                title="รายงานสินค้านี้"
              >
                <Flag size={13} />
                <span>รายงานสินค้านี้ไม่เหมาะสม</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ─── Mobile Sticky Bottom Action Bar (Fixed bottom for phone users) ─── */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-white/95 backdrop-blur-md border-t border-gray-200/90 px-3.5 py-2.5 pb-[calc(env(safe-area-inset-bottom,0px)+8px)] md:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {isMyProduct ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-amber-800">นี่คือสินค้าที่คุณลงขาย</span>
            <Link
              to={`/products/${product.id}/edit`}
              className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-amber-600 transition-colors"
            >
              แก้ไขสินค้า
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Wishlist */}
            <button
              onClick={handleWishlistClick}
              aria-pressed={isSaved}
              aria-label="บันทึกสินค้า"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                isSaved
                  ? 'border-brand-300 bg-brand-50 text-brand-500'
                  : 'border-gray-200 bg-white text-ink-500 hover:text-brand-500'
              }`}
            >
              <Heart size={18} className={isSaved ? 'fill-brand-500' : ''} />
            </button>

            {/* Chat */}
            <button
              onClick={handleChatClick}
              aria-label="ทักแชทกับผู้ขาย"
              className="flex items-center justify-center gap-1.5 px-3.5 h-11 rounded-xl border border-gray-200 bg-white text-ink-700 font-bold text-xs shrink-0 active:bg-gray-100 transition-colors"
            >
              <MessageCircle size={18} />
              <span>ทักแชท</span>
            </button>

            {/* Buy / Meetup */}
            <button
              onClick={handleBuyClick}
              className="flex flex-1 items-center justify-center gap-1.5 h-11 rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-3 text-xs font-extrabold text-white shadow-md active:scale-98 transition-all"
            >
              <ShoppingBag size={16} />
              <span className="truncate">ซื้อสินค้า / ขอนัดรับ</span>
            </button>
          </div>
        )}
      </div>

      {/* ─── Modal รายงานสินค้าไม่เหมาะสม ─── */}
      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetType="product"
        targetId={product.id}
        targetTitle={product.title}
        targetUser={product.seller?.displayName || product.seller?.username || 'ผู้ขาย'}
        targetUserId={product.seller?.id || product.seller_id || product.sellerId}
      />


      {/* ─── Modal เลือกระหว่างทักแชทก่อน หรือ เลือกวันนัดรับเลย ─── */}
      {showActionChoiceModal && product && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4 animate-in fade-in duration-150">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-orange-100 bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-100 mb-4">
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 bg-orange-50 px-2 py-0.5 rounded-md">
                  สั่งซื้อและนัดหมาย
                </span>
                <h3 className="text-lg font-black text-ink-900 mt-1">เลือกวิธีดำเนินการ</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowActionChoiceModal(false)}
                aria-label="ปิด"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-orange-200 hover:text-[#f95721]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Product Summary */}
            <div className="flex items-center gap-3.5 rounded-2xl bg-[#FAF6EC] p-3.5 border border-orange-200/60 mb-4">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white shadow-xs">
                {product.images?.[0]?.imageUrl ? (
                  <img src={product.images[0].imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink-300">
                    <ShoppingBag size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-sm text-ink-900 truncate">{product.title}</p>
                <p className="text-sm font-black text-[#f95721] mt-0.5">{formatCurrency(product.price)}</p>
                <p className="text-[11px] text-ink-500 truncate">
                  ผู้ขาย: <span className="font-semibold text-ink-700">{sellerDisplayName}</span>
                </p>
              </div>
            </div>

            {/* Advice notice */}
            <div className="mb-4 rounded-xl bg-amber-50/80 border border-amber-200/80 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <span className="text-base leading-none">💡</span>
              <p className="leading-relaxed">
                แนะนำให้<strong>ทักแชทคุยกับผู้ขายก่อน</strong> เพื่อสอบถามรายละเอียด และตกลงวัน-เวลาและจุดนัดรับที่สะดวกทั้ง 2 ฝ่าย
              </p>
            </div>

            {/* Choice Buttons */}
            <div className="space-y-3">
              {/* Option 1: ทักแชทก่อน (แนะนำ) */}
              <button
                type="button"
                onClick={() => {
                  setShowActionChoiceModal(false);
                  handleChatClick();
                }}
                className="w-full text-left p-4 rounded-2xl border-2 border-[#f95721] bg-orange-50/50 hover:bg-orange-50 hover:border-orange-600 transition-all group flex items-start gap-3.5 shadow-xs"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff5722] to-orange-500 text-white shadow-sm group-hover:scale-105 transition-transform">
                  <MessageCircle size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-ink-900 group-hover:text-brand-600 transition-colors">
                      ทักแชทคุยกับผู้ขายก่อน
                    </span>
                    <span className="text-[10px] font-bold bg-[#f95721] text-white px-1.5 py-0.5 rounded-full">
                      แนะนำ
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    ตกลงเวลาและสถานที่ที่สะดวกตรงกันก่อนส่งคำขอนัดรับ
                  </p>
                </div>
                <ArrowRight size={18} className="text-[#f95721] mt-2 shrink-0 group-hover:translate-x-1 transition-transform" />
              </button>

              {/* Option 2: เลือกวันนัดรับเลย */}
              <button
                type="button"
                onClick={() => {
                  setShowActionChoiceModal(false);
                  setShowBuyModal(true);
                }}
                className="w-full text-left p-4 rounded-2xl border border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/20 transition-all group flex items-start gap-3.5 shadow-2xs"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 shadow-2xs group-hover:bg-orange-100 group-hover:text-brand-600 group-hover:scale-105 transition-all">
                  <CalendarClock size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-black text-sm text-ink-900 group-hover:text-brand-600 transition-colors">
                    เลือกวันและจุดนัดรับเลย
                  </span>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    เลือกจุดปลอดภัยใน มทร.อีสาน วันที่ และเวลาเพื่อนัดรับทันที
                  </p>
                </div>
                <ArrowRight size={18} className="text-gray-400 mt-2 shrink-0 group-hover:translate-x-1 group-hover:text-brand-500 transition-all" />
              </button>
            </div>

            {/* Cancel Button */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowActionChoiceModal(false)}
                className="text-xs font-bold text-gray-500 hover:text-gray-800 py-1.5 px-3 rounded-lg hover:bg-gray-100 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal ยืนยันการสั่งซื้อและนัดรับสินค้าทันที (Instant Buy & Meetup Modal) ───
          มือถือ: เป็น bottom sheet เต็มความกว้าง หัว/ท้ายติดที่ เนื้อหากลางเลื่อนได้
          เดสก์ท็อป: กล่องกลางจอ */}
      {showBuyModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:items-center sm:p-4 animate-in fade-in duration-150">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-orange-100 bg-white shadow-2xl sm:rounded-3xl">

            {/* Header (ติดบน) */}
            <div className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-4 py-3.5 sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={() => {
                  setShowBuyModal(false);
                  setShowActionChoiceModal(true);
                }}
                aria-label="ย้อนกลับไปเลือกวิธีดำเนินการ"
                title="ย้อนกลับ"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:border-orange-200 hover:text-[#f95721]"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 bg-orange-50 px-2 py-0.5 rounded-md">
                  คำสั่งซื้อและการนัดหมาย
                </span>
                <h3 className="mt-1 text-base font-black leading-snug text-ink-900 sm:text-lg">
                  ยืนยันการซื้อและส่งคำขอนัดรับ
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBuyModal(false)}
                aria-label="ปิด"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:border-orange-200 hover:text-[#f95721]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmBuyAndMeetup} className="flex min-h-0 flex-1 flex-col">
              {/* เนื้อหา (เลื่อนได้) */}
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                {/* Product Summary */}
                <div className="flex items-center gap-3 rounded-2xl border border-orange-200/60 bg-[#FAF6EC] p-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white shadow-xs">
                    {product.images?.[0]?.imageUrl ? (
                      <img src={product.images[0].imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-ink-300">
                        <ShoppingBag size={22} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold text-ink-900">{product.title}</p>
                    <p className="mt-0.5 text-base font-black text-[#f95721]">{formatCurrency(product.price)}</p>
                    <p className="truncate text-xs text-ink-500">
                      ผู้ขาย: <span className="font-semibold text-ink-700">{sellerDisplayName}</span>
                    </p>
                  </div>
                </div>

                {/* Safe Point Location */}
                <div>
                  <label htmlFor="meetup-location" className="mb-1.5 block text-xs font-bold text-ink-800">
                    📍 เลือกจุดนัดรับปลอดภัยใน มทร.อีสาน
                  </label>
                  <select
                    id="meetup-location"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="h-11 w-full min-w-0 truncate rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  >
                    {meetupPoints.map((point) => (
                      <option key={point.id} value={point.name}>
                        {point.icon || '📍'} {point.name}
                      </option>
                    ))}
                  </select>
                  {selectedPoint?.description && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
                      {selectedPoint.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowBuyModal(false);
                        navigate(`/products/${product.id}/meetup`);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline"
                    >
                      หรือเปิดแผนที่มหาวิทยาลัยแบบละเอียด <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs font-bold text-ink-800">
                      📅 วันและเวลานัดรับ
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const nowTime = localTimeString(now);
                        setMeetupDate(localDateString(now));
                        if (isWithinMeetupHours(nowTime)) {
                          setMeetupTime(nowTime);
                          setTimeError('');
                        } else {
                          setTimeError(`⏰ ตอนนี้อยู่นอกเวลานัดรับ — ${MEETUP_HOURS_TEXT}`);
                        }
                      }}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-orange-200/70 bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-600 transition-colors hover:bg-orange-100"
                    >
                      ⚡ นัดตอนนี้เลย
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2">
                    <div className="min-w-0">
                      <label htmlFor="meetup-date" className="mb-1 block text-[11px] font-medium text-ink-500">วันที่สะดวก</label>
                      <input
                        id="meetup-date"
                        type="date"
                        value={meetupDate}
                        min={localDateString()}
                        onChange={(e) => setMeetupDate(e.target.value)}
                        className="h-11 w-full min-w-0 rounded-xl border border-gray-200 bg-gray-50/50 px-3 text-sm font-semibold text-ink-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100"
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="meetup-time" className="mb-1 block text-[11px] font-medium text-ink-500">เวลานัดรับ</label>
                      <input
                        id="meetup-time"
                        type="time"
                        value={meetupTime}
                        min={MEETUP_START}
                        max={MEETUP_END}
                        onChange={(e) => {
                          setMeetupTime(e.target.value);
                          setTimeError('');
                        }}
                        className={`h-11 w-full min-w-0 rounded-xl border bg-gray-50/50 px-3 text-sm font-semibold text-ink-900 outline-none focus:bg-white focus:ring-2 focus:ring-brand-100 ${
                          timeError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-brand-500'
                        }`}
                      />
                    </div>
                  </div>

                  {timeError ? (
                    <p className="text-xs font-medium leading-relaxed text-red-500">{timeError}</p>
                  ) : (
                    <p className="text-[11px] text-gray-500">⏰ {MEETUP_HOURS_TEXT}</p>
                  )}
                </div>

                {/* Safety Warning */}
                <div className="rounded-xl border border-amber-200/80 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                  <p className="mb-0.5 flex items-center gap-1 font-bold text-amber-800">
                    <ShieldCheck size={14} className="text-amber-600" />
                    ความปลอดภัยการซื้อขาย:
                  </p>
                  ตรวจสอบสินค้าให้ครบถ้วนต่อหน้าผู้ขาย ณ จุดนัดรับ ก่อนชำระเงินหรือโอนเงินเสมอ
                </div>

                {/* Prompt to chat first if needed */}
                <div className="flex flex-col gap-1.5 rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-xs text-gray-600 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
                  <span>ยังไม่แน่ใจเรื่องวันเวลา? พูดคุยกับผู้ขายก่อน</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBuyModal(false);
                      handleChatClick();
                    }}
                    className="flex shrink-0 items-center gap-1 font-bold text-[#f95721] hover:underline"
                  >
                    <MessageCircle size={13} />
                    <span>ทักแชทตอนนี้</span>
                  </button>
                </div>
              </div>

              {/* Action Buttons (ติดล่าง) */}
              <div className="flex shrink-0 gap-2.5 border-t border-gray-100 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] sm:px-6 sm:pb-4">
                <button
                  type="button"
                  onClick={() => setShowBuyModal(false)}
                  className="h-12 flex-1 rounded-xl border border-gray-200 bg-white text-sm font-bold text-ink-600 transition-colors hover:bg-gray-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingBuy}
                  className="h-12 flex-[1.6] rounded-xl bg-gradient-to-r from-brand-500 to-orange-500 px-2 text-sm font-extrabold text-white shadow-md transition-all hover:from-brand-600 hover:to-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingBuy ? 'กำลังส่งคำขอ...' : 'ยืนยันสั่งซื้อและนัดรับ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}