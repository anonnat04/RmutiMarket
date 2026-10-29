import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { CalendarClock, MapPin, ShoppingBag, ChevronRight, ArrowLeft } from 'lucide-react';
import { fetchProductDetail } from '@/services/productService';
import { useAuthStore } from '@/store/authStore';
import { CampusMapPicker } from '@/components/meetup/CampusMapPicker';
import { Button } from '@/components/common/Button';
import { getMeetupPointById, CAMPUS_CENTER, CAMPUS_BOUNDARY } from '@/constants/meetupPoints';
import { isPointInPolygon } from '@/utils/distance';
import { api } from '@/lib/api';

// ─── Step indicator ────────────────────────────────────────────────────────
const STEPS = ['เลือกสินค้า', 'เลือกวัน/เวลา/สถานที่', 'ส่งคำขอนัดรับ'];

function StepBar({ current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: done ? '#16a34a' : active ? '#f97316' : '#e5e7eb',
                  color: done || active ? '#fff' : '#9ca3af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 13,
                  transition: 'all 0.2s',
                  boxShadow: active ? '0 0 0 4px rgba(249,115,22,0.18)' : 'none',
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#f97316' : '#9ca3af', whiteSpace: 'nowrap' }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? '#16a34a' : '#e5e7eb', margin: '0 4px', marginBottom: 18, transition: 'all 0.3s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ScheduleMeetupPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [locationValue, setLocationValue] = useState(null); // { type, id } | { type, lat, lng, name }
  const [errors, setErrors] = useState({});
  // กันกดส่งซ้ำจนสร้างนัดหมายซ้ำในฐานข้อมูล
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProductDetail(id).then((p) => {
      setProduct(p ?? null);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="cm-card h-64 animate-pulse bg-surface-muted" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="py-16 text-center text-ink-500">
        ไม่พบสินค้านี้ —{' '}
        <Link to="/products" className="font-semibold text-brand-600">
          กลับไปดูสินค้าอื่น
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const next = {};
    if (!date) next.date = 'กรุณาเลือกวันที่';
    if (!time) next.time = 'กรุณาเลือกเวลา';
    if (time) {
      const [h, m] = time.split(':').map(Number);
      const totalMin = h * 60 + (m || 0);
      if (totalMin < 8 * 60 || totalMin > 19 * 60) {
        next.time = '⏰ กรุณาเลือกเวลานัดรับระหว่าง 08:00 – 19:00 น. เท่านั้น';
      }
    }
    if (!locationValue) next.location = 'กรุณาเลือกจุดนัดรับบนแผนที่';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    let locationName = '';
    let lat = null;
    let lng = null;

    if (locationValue.type === 'point') {
      const point = getMeetupPointById(locationValue.id);
      locationName = point?.name ?? '';
      lat = point?.lat;
      lng = point?.lng;
    } else {
      locationName = locationValue.name ?? `${locationValue.lat?.toFixed(5)}, ${locationValue.lng?.toFixed(5)}`;
      lat = locationValue.lat;
      lng = locationValue.lng;
    }

    if (lat && lng) {
      const isInside = isPointInPolygon([lat, lng], CAMPUS_BOUNDARY);
      if (!isInside) {
        setErrors((prev) => ({ ...prev, location: '❌ จุดนัดรับอยู่นอกเขตมหาวิทยาลัย กรุณาเลือกจุดนัดรับที่อยู่ในกรอบสีแดงเท่านั้น' }));
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        listingId: product.id,
        agreedPrice: product.price,
        meetupPointId: locationValue.type === 'point' ? locationValue.id : 'canteen39',
        locationId: locationValue.type === 'point' ? locationValue.id : 'canteen39',
        date,
        time,
        note: `จุดนัด: ${locationName}`,
      };

      // แก้ไข: เดิมหลังจากยิง api.createMeetup() (เขียนลง backend/appointments จริง)
      // สำเร็จแล้ว ยังเรียก createRequest() ของ useMeetupStore เขียนซ้ำลง
      // localStorage อีกชุดหนึ่งทันที ทำให้ MeetupListPage.jsx เห็นนัดหมายเดียวกัน
      // เป็น 2 รายการซ้อนกัน (id คนละ format กัน dedupe ไม่เจอ) — backend คือแหล่ง
      // ข้อมูลจริงเพียงแหล่งเดียวแล้วตอนนี้ จึงตัด createRequest() ออก ไม่ต้องเขียนซ้ำ
      const res = await api.createMeetup(payload);
      const meetupId = res?.meetupId;

      if (!meetupId) {
        throw new Error('สร้างนัดรับสำเร็จ แต่ไม่ได้รับ meetupId กลับมาจากเซิร์ฟเวอร์');
      }

      // แจ้งเตือน (ยังคงเป็นระบบแจ้งเตือน local เดิม ไม่เกี่ยวกับตัวข้อมูลนัดหมาย)
      import('@/store/notificationStore').then(({ useNotificationStore }) => {
        useNotificationStore.getState().addNotification({
          userId: product.seller.id,
          title: '📅 มีคำขอนัดรับสินค้าใหม่',
          message: `${user?.name || 'ผู้ซื้อ'} ขอนัดรับสินค้า "${product.title}" วันที่ ${date} เวลา ${time} น. ณ ${locationName}`,
          type: 'meetup',
          link: '/meetups',
        });
        useNotificationStore.getState().addNotification({
          userId: user?.id ?? 'me',
          title: '📤 ส่งคำขอนัดรับสินค้าแล้ว',
          message: `ส่งคำขอนัดรับ "${product.title}" ให้ผู้ขายแล้ว กรุณารอการตอบรับ`,
          type: 'meetup',
          link: '/meetups',
        });
      });

      navigate('/meetups', { state: { justCreated: meetupId } });
      // หมายเหตุ: ไม่ setSubmitting(false) ที่นี่โดยตั้งใจ เพราะกำลังจะออกจากหน้านี้อยู่แล้ว
    } catch (err) {
      console.error("Failed to create meetup:", err);
      setErrors((prev) => ({ ...prev, location: err.message || "เกิดข้อผิดพลาดในการส่งคำขอนัดรับ" }));
      setSubmitting(false);
    }
  };

  // สร้าง time slot แนะนำ (ทุกครึ่งชั่วโมง 8:00 - 19:00)
  const timeSlots = [];
  for (let h = 8; h <= 19; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 19) timeSlots.push(`${String(h).padStart(2, '0')}:30`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs shrink-0"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #f97316, #fb923c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <CalendarClock size={22} color="#fff" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-ink-900">นัดรับสินค้า</h1>
          <p className="text-xs text-ink-500">เลือกวัน เวลา และจุดนัดพบที่ปลอดภัยในมหาวิทยาลัย</p>
        </div>
      </div>

      <StepBar current={1} />

      {/* ─── สินค้าที่จะนัดรับ ───────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '14px 16px',
          borderRadius: 16,
          background: 'linear-gradient(135deg, #fff7ed, #fff)',
          border: '1.5px solid #fed7aa',
          marginBottom: 24,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#f3f4f6',
            flexShrink: 0,
          }}
        >
          {product.images[0]?.imageUrl && (
            <img src={product.images[0].imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <ShoppingBag size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {product.title}
          </p>
          <p style={{ fontSize: 12, color: '#78716c' }}>ผู้ขาย: {product.seller.displayName}</p>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#f97316' }}>
            ฿{product.price.toLocaleString()}
          </p>
        </div>
      </div>

      {/* 🛡️ Safety Alert Banner */}
      <div className="mb-6 flex items-start gap-3 rounded-2xl bg-orange-50/90 p-4 border border-orange-200 text-xs text-orange-900 leading-relaxed">
        <MapPin size={20} className="shrink-0 text-orange-600 mt-0.5" />
        <div>
          <p className="font-bold text-orange-950 text-sm">🛡️ ระบบการนัดรับปลอดภัยในมหาวิทยาลัย</p>
          <p className="mt-1">
            สามารถนัดรับสินค้าได้เฉพาะพื้นที่ภายในมหาวิทยาลัย (กรอบสีแดง) เท่านั้น ไม่อนุญาตนัดรับนอกเขตมหาวิทยาลัยเพื่อความปลอดภัยของทั้งผู้ซื้อและผู้ขาย โปรดเลือกจุดปักหมุดที่ระบบจัดเตรียมไว้
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* ─── วันที่และเวลา ──────────────────────────────────── */}
        <div className="cm-card p-4">
          <p className="mb-3 text-sm font-bold text-ink-900">📅 วันที่และเวลานัดรับ</p>
          <div className="grid grid-cols-2 gap-4">
            {/* วันที่ */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-700">วันที่นัดรับ</label>
              <input
                type="date"
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {errors.date && <p className="mt-1 text-xs font-medium text-red-500">{errors.date}</p>}
            </div>

            {/* เวลา */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-700">เวลานัดรับ</label>
              <input
                type="time"
                value={time}
                min="08:00"
                max="19:00"
                onChange={(e) => setTime(e.target.value)}
                className="block w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {errors.time && <p className="mt-1 text-xs font-medium text-red-500">{errors.time}</p>}
              <p className="mt-1 text-[10px] text-gray-400">รับนัดได้เฉพาะ 08:00 – 19:00 น.</p>
            </div>
          </div>

          {/* Time Slot แนะนำ */}
          {date && (
            <div className="mt-3">
              <p className="mb-2 text-xs font-medium text-ink-500">⏰ เวลาที่แนะนำ</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {timeSlots.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      border: `1.5px solid ${time === t ? '#f97316' : '#e5e7eb'}`,
                      background: time === t ? '#f97316' : '#fff',
                      color: time === t ? '#fff' : '#374151',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ─── แผนที่ ──────────────────────────────────────────── */}
        <div className="cm-card p-4">
          <p className="mb-3 text-sm font-bold text-ink-900">🗺️ เลือกจุดนัดรับในมหาวิทยาลัย</p>
          <CampusMapPicker value={locationValue} onChange={setLocationValue} />
          {errors.location && (
            <p className="mt-2 text-xs font-medium text-red-500">{errors.location}</p>
          )}
        </div>

        {/* ─── ส่งคำขอ ─────────────────────────────────────────── */}
        <Button type="submit" size="lg" disabled={submitting}>
          <span className="flex items-center justify-center gap-2">
            <CalendarClock size={18} />
            {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอนัดรับสินค้า'}
            {!submitting && <ChevronRight size={16} />}
          </span>
        </Button>
      </form>
    </div>
  );
}