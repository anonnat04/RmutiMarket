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

// ─── ช่วงเวลาที่อนุญาตให้นัดรับ ─────────────────────────────────────────────
const MEETUP_START = '08:00';
const MEETUP_END = '20:00';
const MEETUP_HOURS_TEXT = 'นัดรับได้เฉพาะเวลา 08:00 – 20:00 น. เท่านั้น';

// ช่องเวลาแนะนำ: 08:00 ถึง 20:00 ทุก 30 นาที (25 ช่อง จัดเป็นกริด 5 คอลัมน์พอดี)
const TIME_SLOTS = Array.from({ length: 25 }, (_, i) => {
  const m = 8 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

function isWithinMeetupHours(t) {
  if (!t) return false;
  const s = String(t).slice(0, 5);
  return s >= MEETUP_START && s <= MEETUP_END;
}

// วันที่ตามเวลาเครื่อง (toISOString ใช้ UTC ทำให้วันที่เพี้ยนช่วงเที่ยงคืนถึงเช้าตามเวลาไทย)
function localDateString(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeString(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

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
  const [existingMeetups, setExistingMeetups] = useState([]);
  const [date, setDate] = useState(() => localDateString());
  const [time, setTime] = useState(() => {
    // ถ้าตอนนี้อยู่นอกช่วง 08:00–20:00 ให้เริ่มที่ 09:00 แทน
    const now = localTimeString();
    return isWithinMeetupHours(now) ? now : '09:00';
  });
  const [locationValue, setLocationValue] = useState(null); // { type, id } | { type, lat, lng, name }
  const [errors, setErrors] = useState({});
  // กันกดส่งซ้ำจนสร้างนัดหมายซ้ำในฐานข้อมูล
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProductDetail(id).then((p) => {
      setProduct(p ?? null);
      setLoading(false);
    });
    api.getMyMeetups().then((res) => {
      setExistingMeetups(res?.meetups || []);
    }).catch(() => {});
  }, [id]);

  const toMinutes = (t) => {
    if (!t) return 0;
    const [h, m] = String(t).slice(0, 5).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const getConflictingMeetup = (checkDate, checkTime) => {
    if (!checkDate || !checkTime) return null;
    const targetMin = toMinutes(checkTime);
    return (existingMeetups || []).find((m) => {
      const st = String(m.statusCode || m.status || '').toLowerCase();
      if (!['pending', 'confirmed'].includes(st)) return false;
      const mDate = m.date || m.appointment_date;
      if (mDate !== checkDate) return false;
      const mTime = m.time || m.startTime || m.appointment_time;
      const mMin = toMinutes(mTime);
      return Math.abs(mMin - targetMin) < 30;
    });
  };

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
    else if (!isWithinMeetupHours(time)) next.time = `⏰ ${MEETUP_HOURS_TEXT}`;
    if (!locationValue) next.location = 'กรุณาเลือกจุดนัดรับบนแผนที่';

    // ── ตรวจสอบเวลานัดหมายซ้อนทับ ──
    if (date && time && !next.time) {
      const conflict = getConflictingMeetup(date, time);
      if (conflict) {
        const conflictTitle = conflict.productTitle || conflict.product?.title || 'รายการอื่น';
        next.time = `⚠️ เวลานัดหมาย ${time} น. ซ้อนทับกับนัดรับสินค้าอื่นของคุณ ("${conflictTitle}") กรุณาเลือกเวลาอื่นที่ห่างกันอย่างน้อย 30 นาที`;
      }
    }

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
        // ส่ง locationId เป็น string id ของจุด (เช่น 'canteen39') เพื่อให้ backend ค้นชื่อได้
        // และส่ง locationName + lat/lng ไปด้วยเพื่อให้ backend บันทึก location_detail ที่ถูกต้อง
        meetupPointId: locationValue.type === 'point' ? locationValue.id : null,
        locationId: locationValue.type === 'point' ? locationValue.id : null,
        locationName,
        locationLat: lat,
        locationLng: lng,
        date,
        time,
        note: `จุดนัด: ${locationName}`,
        locationDetail: locationName,
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
      const msg = err.message || "เกิดข้อผิดพลาดในการส่งคำขอนัดรับ";
      if (msg.includes("ซ้อนทับ") || msg.includes("เวลา")) {
        setErrors((prev) => ({ ...prev, time: msg }));
      } else {
        setErrors((prev) => ({ ...prev, location: msg }));
      }
      setSubmitting(false);
    }
  };

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
          <p className="mt-1 font-semibold text-orange-950">
            ⏰ {MEETUP_HOURS_TEXT}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* ─── วันที่และเวลา ──────────────────────────────────── */}
        <div className="cm-card p-4">
          <p className="mb-3 text-sm font-bold text-ink-900">📅 วันที่และเวลานัดรับ</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* วันที่ */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-700">วันที่นัดรับ</label>
              <input
                type="date"
                value={date}
                min={localDateString()}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {errors.date && <p className="mt-1 text-xs font-medium text-red-500">{errors.date}</p>}
            </div>

            {/* เวลา */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-ink-700">เวลานัดรับ</label>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const nowTime = localTimeString(now);
                    setDate(localDateString(now));
                    if (isWithinMeetupHours(nowTime)) {
                      setTime(nowTime);
                      setErrors((prev) => ({ ...prev, time: null }));
                    } else {
                      setErrors((prev) => ({ ...prev, time: `⏰ ตอนนี้อยู่นอกเวลานัดรับ — ${MEETUP_HOURS_TEXT}` }));
                    }
                  }}
                  className="text-[11px] font-bold text-orange-600 hover:underline"
                >
                  ⚡ นัดตอนนี้เลย
                </button>
              </div>
              <input
                type="time"
                value={time}
                min={MEETUP_START}
                max={MEETUP_END}
                onChange={(e) => {
                  setTime(e.target.value);
                  setErrors((prev) => ({ ...prev, time: null }));
                }}
                className="block w-full rounded-xl border border-surface-border bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {errors.time && <p className="mt-1 text-xs font-medium text-red-500">{errors.time}</p>}
              <p className="mt-1 text-[10px] text-gray-400">
                {MEETUP_HOURS_TEXT} · ต้องไม่ซ้อนทับกับนัดรับอื่น
              </p>
            </div>
          </div>

          {/* Time Slot แนะนำ (08:00 – 20:00) */}
          {date && (
            <div className="mt-4">
              <p className="text-xs font-bold text-ink-700">⏰ เวลาที่แนะนำ</p>
              <p className="mb-2 mt-0.5 text-[11px] text-gray-400">{MEETUP_HOURS_TEXT}</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {TIME_SLOTS.map((t) => {
                  const isBusy = !!getConflictingMeetup(date, t);
                  const selected = time === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        if (isBusy) {
                          setErrors((prev) => ({ ...prev, time: `เวลานัด ${t} น. ซ้อนทับกับนัดรับอื่นที่มีอยู่แล้ว` }));
                        } else {
                          setTime(t);
                          setErrors((prev) => ({ ...prev, time: null }));
                        }
                      }}
                      disabled={isBusy}
                      title={isBusy ? `เวลา ${t} น. ติดนัดรับอื่นแล้ว` : `เลือกเวลา ${t} น.`}
                      className={`h-9 rounded-full border text-xs font-bold transition-colors ${
                        isBusy
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 line-through opacity-60'
                          : selected
                          ? 'border-[#f97316] bg-[#f97316] text-white'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:text-[#f97316]'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-gray-400">ช่องที่ขีดฆ่า = ติดนัดรับอื่นของคุณแล้ว</p>
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
        <Button type="submit" size="lg" disabled={submitting} className="w-full">
          <span className="flex w-full items-center justify-center gap-2">
            <CalendarClock size={18} />
            {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอนัดรับสินค้า'}
            {!submitting && <ChevronRight size={16} />}
          </span>
        </Button>
      </form>
    </div>
  );
}