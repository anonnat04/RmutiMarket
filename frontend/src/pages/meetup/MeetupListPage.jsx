import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, MapPin, ChevronDown, ChevronUp, Bell, ArrowLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMeetupStore, getCheckInWindow } from '@/store/meetupStore';
import { useNotificationStore } from '@/store/notificationStore';
import { MeetupStatusBadge } from '@/components/meetup/MeetupStatusBadge';
import { ReviewModal } from '@/components/meetup/ReviewModal';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CAMPUS_CENTER, meetupPoints } from '@/constants/meetupPoints';
import { api } from '@/lib/api';


// ⚠️ หมายเหตุสำคัญ: ระบบนี้ไม่มี "เลื่อนนัด" อีกต่อไป
// ถ้าต้องการเปลี่ยนวัน/เวลา/จุดนัด ผู้ใช้ต้อง "ยกเลิกนัดเดิม" แล้วสร้างนัดใหม่จากหน้ารายละเอียดสินค้า
//
// ⚠️ หมายเหตุ (แก้ล่าสุด): ส่วนเช็คอิน + เรดาร์ GPS สด + ยืนยันรับสินค้า ถูกย้ายไปอยู่
// หน้าแยกต่างหากแล้วที่ /meetups/:id/checkin (ดูไฟล์ MeetupCheckInPage.jsx)
// การ์ดในหน้านี้จึงแสดงแค่สรุปสถานะเช็คอิน + ปุ่มลิงก์ไปหน้านั้น ไม่มีปุ่มแอ็กชันตรงๆ อีกต่อไป

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── แปลง appointment_status.code (PENDING/CONFIRMED/COMPLETED/CANCELLED/NO_SHOW) ──
// ให้เป็น string status ที่ store ใช้อยู่จริง (pending/confirmed/completed/cancelled/rejected)
function mapStatusCode(code) {
  switch (code) {
    case 'PENDING': return 'pending';
    case 'CONFIRMED': return 'confirmed';
    case 'COMPLETED': return 'completed';
    case 'CANCELLED': return 'cancelled';
    case 'NO_SHOW': return 'rejected';
    default: return 'pending';
  }
}

// ── เลือกชื่อที่จะแสดง: ใช้ username เป็นหลักเสมอ (ตรงกับ users.username ในฐานข้อมูล) ──
function resolveUserName(u) {
  return u?.username || u?.display_name || u?.full_name || 'ผู้ใช้';
}

// ── ป้ายสถานะช่วง Check-in ───────────────────────────────────────────
function CheckInWindowBadge({ status }) {
  const map = {
    waiting: { label: '🕐 ยังไม่ถึงเวลาเปิด Check-in', style: { background: '#f3f4f6', color: '#6b7280' } },
    open: { label: '🟢 เปิด Check-in แล้ว', style: { background: '#dcfce7', color: '#16a34a' } },
    late: { label: '⚠️ อยู่ในช่วง Check-in สาย', style: { background: '#fef3c7', color: '#b45309' } },
    closed: { label: '🔴 ปิด Check-in แล้ว', style: { background: '#fee2e2', color: '#dc2626' } },
    unknown: { label: '—', style: { background: '#f3f4f6', color: '#9ca3af' } },
  };
  const cfg = map[status] || map.unknown;
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
        ...cfg.style,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Mini Leaflet map (แสดงตำแหน่งนัดหมาย) ─────────────────────────────
function MiniMap({ meetup }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    let lat = CAMPUS_CENTER.lat;
    let lng = CAMPUS_CENTER.lng;
    const found = meetupPoints.find((p) => p.id === meetup.locationId);
    if (found) { lat = found.lat; lng = found.lng; }
    else if (meetup.locationLat) { lat = meetup.locationLat; lng = meetup.locationLng; }

    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }

    import('leaflet').then((mod) => {
      if (mapInstanceRef.current) return;
      const L = mod.default ?? mod;
      const map = L.map(mapRef.current, {
        center: [lat, lng],
        zoom: 17,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        attributionControl: false,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      const icon = L.divIcon({
        html: `<div style="width:20px;height:20px;background:#f97316;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        className: '',
      });
      L.marker([lat, lng], { icon }).addTo(map);
      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [meetup.locationId]);

  return (
    <div
      ref={mapRef}
      style={{ height: 180, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}
    />
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',       label: 'ทั้งหมด' },
  { key: 'pending',   label: 'รอดำเนินการ',  statuses: ['pending', 'return_requested'] },
  { key: 'confirmed', label: 'นัดหมายแล้ว',  statuses: ['confirmed'] },
  { key: 'completed', label: 'เสร็จสิ้น',    statuses: ['completed', 'return_accepted', 'return_rejected'] },
  { key: 'cancelled', label: 'ยกเลิกแล้ว',   statuses: ['cancelled', 'rejected'] },
];

function tabMatches(tab, status) {
  if (tab.key === 'all') return true;
  return tab.statuses?.includes(status);
}

export function MeetupListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const meetups = useMeetupStore((s) => s.meetups);
  const respondToRequest = useMeetupStore((s) => s.respondToRequest);
  const cancelRequest = useMeetupStore((s) => s.cancelRequest);
  const checkIn = useMeetupStore((s) => s.checkIn);
  const submitReview = useMeetupStore((s) => s.submitReview);

  const addNotification = useNotificationStore((s) => s.addNotification);

  const [dbMeetups, setDbMeetups] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [expandedMap, setExpandedMap] = useState(null);
  const [checkInLoading, setCheckInLoading] = useState(null); // meetup id ที่กำลังเช็คอิน
  const [cancelLoading, setCancelLoading] = useState(null);   // meetup id ที่กำลังยกเลิก
  const [cancelTarget, setCancelTarget] = useState(null);     // { meetup, role } สำหรับ confirm dialog
  const [rejectTarget, setRejectTarget] = useState(null);     // meetup สำหรับ confirm ปฏิเสธนัด
  const [checkInTarget, setCheckInTarget] = useState(null);   // { meetup, role } สำหรับ confirm เช็คอิน
  // บังคับ re-render ทุกนาทีเพื่อให้ป้ายสถานะช่วง Check-in อัปเดตตามเวลาจริง
  const [, forceTick] = useState(0);


  const myId = user?.id ?? 'me';

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // ── mapping ให้ตรงกับโครงสร้างจริงที่ backend ส่งมา (getMyMeetups ใน meetupController.js) ──
  const fetchMeetups = async () => {
    if (!user || user.id === 'me') return;
    try {
      setLoadingDb(true);
      const res = await api.getMyMeetups();
      const list = (res.meetups || []).map((m) => {
        const txn = m.transactions || {};
        const product = txn.products || {};
        const buyer = txn.buyer || {};
        const seller = txn.seller || {};
        const location = m.locations || {};
        const statusCode = m.appointment_status?.code || 'PENDING';

        const images = product.product_images || [];
        const coverImage = images.find((i) => i.is_primary)?.image_url || images[0]?.image_url || '';

        const mappedStatus = mapStatusCode(statusCode);

        return {
          id: m.id,
          transactionId: m.transaction_id || txn.id,
          productId: product.id,
          productTitle: product.title || 'สินค้า',
          productPrice: txn.agreed_price ?? product.price,
          productImage: coverImage,
          buyerId: txn.buyer_id,
          buyerName: resolveUserName(buyer),
          sellerId: txn.seller_id,
          sellerName: resolveUserName(seller),
          status: mappedStatus,
          date: m.appointment_date,
          time: m.appointment_time ? String(m.appointment_time).slice(0, 5) : '12:00',
          startTime: m.appointment_time ? String(m.appointment_time).slice(0, 5) : '12:00',
          locationId: m.location_id ?? location.id,
          locationName: location.name || m.location_detail || 'จุดนัดรับ มทร.อีสาน',
          locationLat: location.latitude,
          locationLng: location.longitude,
          // รับค่า check-in จาก DB ถ้ามี column (ถ้าไม่มีจะเป็น undefined → เป็น false)
          buyerCheckedIn: m.buyer_checked_in ?? false,
          sellerCheckedIn: m.seller_checked_in ?? false,
          buyerCheckedInAt: m.buyer_checked_in_at ?? null,
          sellerCheckedInAt: m.seller_checked_in_at ?? null,
          buyerCheckedInLate: false,
          sellerCheckedInLate: false,
          buyerConfirmedDelivery: statusCode === 'COMPLETED',
          sellerConfirmedDelivery: statusCode === 'COMPLETED',
          note: m.location_detail,
          isDb: true,
        };
      });
      setDbMeetups(list);
    } catch (err) {
      console.warn("Failed to fetch meetups from DB:", err);
    } finally {
      setLoadingDb(false);
    }
  };


  useEffect(() => {
    fetchMeetups();
  }, [user]);

  const allMeetups = useMemo(() => {
    const combined = [...dbMeetups];
    for (const m of meetups) {
      if (!combined.some((c) => c.id === m.id)) {
        combined.push(m);
      }
    }
    return combined;
  }, [dbMeetups, meetups]);

  const myMeetups = allMeetups.filter((m) => String(m.buyerId) === String(myId) || String(m.sellerId) === String(myId));
  const filteredMeetups = myMeetups.filter((m) => {
    const tab = TABS.find((t) => t.key === activeTab);
    return tabMatches(tab, m.status);
  });

  const pendingCount = myMeetups.filter((m) => {
    const role = String(m.buyerId) === String(myId) ? 'buyer' : 'seller';
    if (m.status === 'pending' && role === 'seller') return true;
    if (m.status === 'return_requested' && role === 'seller') return true;
    return false;
  }).length;

  // ── ส่ง Notification จำลองให้อีกฝ่าย ──────────────────────────────
  const notifyOther = (meetup, actionType, role) => {
    const targetUserId = role === 'buyer' ? meetup.sellerId : meetup.buyerId;
    const messages = {
      confirm_request: {
        title: 'ผู้ขายยืนยันนัดรับแล้ว',
        message: `นัดรับสินค้า ${meetup.productTitle} ถูกยืนยันแล้ว เจอกันตามเวลาที่นัดหมาย!`,
        type: 'meetup',
      },
      reject_request: {
        title: '❌ ผู้ขายปฏิเสธคำขอนัดรับ',
        message: `คำขอนัดรับสินค้า ${meetup.productTitle} ถูกปฏิเสธ`,
        type: 'meetup',
      },
      cancel_request: {
        title: '❌ นัดรับถูกยกเลิก',
        message: `นัดรับสินค้า ${meetup.productTitle} ถูกยกเลิกแล้ว`,
        type: 'meetup',
      },
      request_return: {
        title: 'ผู้ซื้อขอคืนสินค้า',
        message: `มีการส่งคำร้องขอคืนสินค้า ${meetup.productTitle} กรุณาพิจารณาภายในระบบ`,
        type: 'return',
      },
      accept_return: {
        title: 'ผู้ขายยอมรับการคืนสินค้า',
        message: `คำร้องขอคืนสินค้า ${meetup.productTitle} ได้รับการตัดสินใจแล้ว`,
        type: 'return',
      },
      reject_return: {
        title: 'ผู้ขายปฏิเสธการคืนสินค้า',
        message: `คำร้องขอคืนสินค้า ${meetup.productTitle} ได้รับการตัดสินใจแล้ว`,
        type: 'return',
      },
    };
    const cfg = messages[actionType];
    if (!cfg) return;
    addNotification({ userId: targetUserId, link: '/meetups', ...cfg });
  };

  // ── ยืนยัน/ปฏิเสธคำขอนัดรับ (ผู้ขายเท่านั้น) ──────────────────────
  const handleRespond = async (m, action) => {
    if (action === 'reject') {
      setRejectTarget(m);
      return;
    }
    executeRespond(m, 'confirm');
  };

  const executeRespond = async (m, action) => {
    respondToRequest(m.id, action);
    notifyOther(m, action === 'confirm' ? 'confirm_request' : 'reject_request', 'seller');
    try {
      if (action === 'confirm') {
        await api.acceptMeetup(m.id);
        fetchMeetups();
      }
    } catch (err) {
      console.error('API acceptMeetup error:', err);
    }
    setRejectTarget(null);
  };

  // ── ยกเลิกนัด (ทั้งผู้ซื้อและผู้ขายทำได้, ยืนยันก่อนเสมอผ่าน ConfirmDialog) ────
  const handleCancelClick = (m, role) => {
    setCancelTarget({ meetup: m, role });
  };

  const executeCancel = async () => {
    if (!cancelTarget) return;
    const { meetup: m, role } = cancelTarget;

    // อัปเดต UI ทันที (optimistic)
    const result = cancelRequest(m.id);
    if (!result.success) {
      alert(result.reason);
      setCancelTarget(null);
      return;
    }
    // อัปเดต dbMeetups ทันทีเพื่อไม่ให้กลับมาหลัง re-fetch
    setDbMeetups((prev) => prev.map((x) => x.id === m.id ? { ...x, status: 'cancelled' } : x));
    notifyOther(m, 'cancel_request', role);

    try {
      setCancelLoading(m.id);
      await api.cancelMeetup(m.id);
    } catch (err) {
      console.error('API cancelMeetup error:', err);
    } finally {
      setCancelLoading(null);
      setCancelTarget(null);
    }
  };

  // ── เช็คอิน ณ จุดนัดพบ (ทั้งผู้ซื้อและผู้ขาย) ──────────────────────
  const handleCheckIn = (m, role) => {
    // ตรวจสอบช่วงเวลาก่อน
    const win = getCheckInWindow(m);
    if (win.status === 'waiting') {
      alert('⏳ ยังไม่ถึงเวลาเปิด Check-in กรุณารอสักครู่');
      return;
    }
    if (win.status === 'closed') {
      alert('🔴 หมดเวลา Check-in แล้ว');
      return;
    }

    setCheckInTarget({ meetup: m, role });
  };

  const executeCheckIn = async () => {
    if (!checkInTarget) return;
    const { meetup: m, role } = checkInTarget;

    try {
      setCheckInLoading(m.id);
      const now = new Date().toISOString();

      // อัปเดต local store ทันที (optimistic)
      checkIn(m.id, role, {});

      // อัปเดต dbMeetups ทันที
      setDbMeetups((prev) => prev.map((x) => {
        if (x.id !== m.id) return x;
        return {
          ...x,
          buyerCheckedIn: role === 'buyer' ? true : x.buyerCheckedIn,
          sellerCheckedIn: role === 'seller' ? true : x.sellerCheckedIn,
          buyerCheckedInAt: role === 'buyer' ? now : x.buyerCheckedInAt,
          sellerCheckedInAt: role === 'seller' ? now : x.sellerCheckedInAt,
        };
      }));

      // บันทึกไป backend ด้วย (ถ้า column มีอยู่ใน DB)
      await api.checkInMeetup(m.id);
    } catch (err) {
      console.error('API checkInMeetup error:', err);
    } finally {
      setCheckInLoading(null);
      setCheckInTarget(null);
    }
  };



  if (myMeetups.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีนัดรับสินค้า"
        description={`กดปุ่ม "นัดรับสินค้า" ที่หน้ารายละเอียดสินค้าเพื่อเริ่มนัดกับผู้ขาย`}
        icon={CalendarClock}
        action={
          <Link to="/products">
            <Button variant="outline" size="sm">เลือกดูสินค้า</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-surface-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-ink-900">📅 นัดรับสินค้าของฉัน</h1>
            <p className="text-xs text-ink-500">ติดตามสถานะการนัดพบและส่งมอบสินค้า</p>
          </div>
        </div>
        <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
          {myMeetups.length} รายการ
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, background: '#f3f4f6', borderRadius: 14, padding: 4, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }} className="scrollbar-none">
        {TABS.map((tab) => {
          const isCancelledTab = tab.key === 'cancelled';
          const count = tab.key === 'pending'
            ? pendingCount
            : tab.key !== 'all'
            ? myMeetups.filter((m) => tabMatches(tab, m.status)).length
            : null;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                flexShrink: 0, padding: '7px 12px', borderRadius: 10, border: 'none',
                background: activeTab === tab.key ? '#fff' : 'transparent',
                color: activeTab === tab.key ? (isCancelledTab ? '#dc2626' : '#f97316') : '#6b7280',
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: 12, cursor: 'pointer',
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span>{tab.label}</span>
              {count != null && count > 0 && (
                <span
                  style={{
                    minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
                    background: isCancelledTab ? '#9ca3af' : '#f97316',
                    color: '#fff', fontSize: 10, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>


      {pendingCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: '#fff7ed', border: '1.5px solid #fed7aa' }}>
          <Bell size={16} color="#f97316" />
          <p style={{ fontSize: 13, color: '#c2410c', fontWeight: 600, flex: 1 }}>มี {pendingCount} รายการรอการตอบสนองจากคุณ</p>
          <button type="button" onClick={() => setActiveTab('pending')} style={{ fontSize: 11, fontWeight: 700, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer' }}>ดูเลย →</button>
        </div>
      )}

      {filteredMeetups.length === 0 && <div className="py-10 text-center text-sm text-ink-400">ไม่มีรายการในหมวดนี้</div>}

      <div className="flex flex-col gap-4">
        {filteredMeetups.map((m) => {
          const role = String(m.buyerId) === String(myId) ? 'buyer' : 'seller';
          const otherName = role === 'buyer' ? m.sellerName : m.buyerName;
          const myReview = role === 'buyer' ? m.buyerReview : m.sellerReview;

          const hasAction =
            (m.status === 'pending' && role === 'seller') ||
            (m.status === 'return_requested' && role === 'seller');

          const mapOpen = expandedMap === m.id;
          const checkInWindow = m.status === 'confirmed' ? getCheckInWindow(m) : null;
          const bothCheckedIn = m.buyerCheckedIn && m.sellerCheckedIn;
          const bothDelivered = m.buyerConfirmedDelivery && m.sellerConfirmedDelivery;
          const myCheckedIn = role === 'buyer' ? m.buyerCheckedIn : m.sellerCheckedIn;
          const myCheckedInAt = role === 'buyer' ? m.buyerCheckedInAt : m.sellerCheckedInAt;
          const canCancel = ['pending', 'confirmed'].includes(m.status) && !m.buyerCheckedIn && !m.sellerCheckedIn;

          return (
            <div key={m.id} className="cm-card flex flex-col gap-3 p-4" style={{ borderLeft: hasAction ? '4px solid #f97316' : undefined, transition: 'box-shadow 0.2s' }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{m.productTitle}</p>
                  <p className="text-xs text-ink-500">{role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'}: {otherName}</p>
                </div>
                <MeetupStatusBadge status={m.status} />
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-ink-700">
                <span className="flex items-center gap-1.5">
                  <CalendarClock size={15} className="text-ink-500" />
                  {formatDate(m.date)} · {m.startTime || m.time} น.
                </span>
                <button type="button" onClick={() => setExpandedMap(mapOpen ? null : m.id)} className="flex items-center gap-1.5 rounded-lg border border-surface-border px-2 py-0.5 text-xs font-medium text-ink-600 hover:bg-surface-muted">
                  <MapPin size={13} className="text-brand-500" />
                  {m.locationName || 'ดูแผนที่'}
                  {mapOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {mapOpen && (
                <div style={{ marginTop: 4 }}>
                  <MiniMap meetup={m} />
                  <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>📍 {m.locationName}</p>
                </div>
              )}

              {/* ─── PENDING: ผู้ขายตอบรับ / ผู้ซื้อรอ ─── */}
              {m.status === 'pending' && role === 'seller' && (
                <div className="bg-orange-50 rounded-xl p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold text-orange-700">🔔 ผู้ซื้อขอนัดรับสินค้า — กรุณาตอบรับ</p>
                  <p className="text-[11px] text-orange-600">หากต้องการวัน/เวลาอื่น กรุณาปฏิเสธคำขอนี้ แล้วให้ผู้ซื้อสร้างนัดใหม่ (ระบบไม่มีการเลื่อนนัด)</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => handleRespond(m, 'confirm')}>✅ ยืนยันนัดหมาย</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRespond(m, 'reject')}>❌ ปฏิเสธ</Button>
                  </div>
                </div>
              )}

              {m.status === 'pending' && role === 'buyer' && (
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-xs text-ink-500 flex-1">⏳ รอผู้ขายตอบรับคำขอนัดรับ...</p>
                  <button
                    onClick={() => handleCancelClick(m, role)}
                    disabled={cancelLoading === m.id}
                    className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                  >
                    <XCircle size={13} />
                    {cancelLoading === m.id ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอ'}
                  </button>
                </div>
              )}

              {/* ─── CONFIRMED: สถานะเช็คอิน + ปุ่มเช็คอิน + ยกเลิก ─── */}
              {m.status === 'confirmed' && (
                <div className="flex flex-col gap-2 rounded-xl bg-orange-50/50 p-3 border border-orange-100">
                  {/* หัว: ชื่อกล่อง + ป้ายช่วงเวลา */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-orange-950">📍 สถานะเช็คอิน</span>
                    {checkInWindow && <CheckInWindowBadge status={checkInWindow.status} />}
                  </div>

                  {/* สถานะเช็คอินผู้ซื้อ */}
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {m.buyerCheckedIn
                        ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />
                      }
                      <span className={`text-[12px] font-semibold ${m.buyerCheckedIn ? 'text-emerald-700' : 'text-slate-400'}`}>
                        ผู้ซื้อ ({m.buyerName || 'ผู้ซื้อ'}): {m.buyerCheckedIn ? 'เช็คอินแล้ว' : 'ยังไม่เช็คอิน'}
                      </span>
                      {m.buyerCheckedIn && m.buyerCheckedInAt && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 font-medium">
                          {new Date(m.buyerCheckedInAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                        </span>
                      )}
                    </div>

                    {/* สถานะเช็คอินผู้ขาย */}
                    <div className="flex items-center gap-2">
                      {m.sellerCheckedIn
                        ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                        : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0" />
                      }
                      <span className={`text-[12px] font-semibold ${m.sellerCheckedIn ? 'text-emerald-700' : 'text-slate-400'}`}>
                        ผู้ขาย ({m.sellerName || 'ผู้ขาย'}): {m.sellerCheckedIn ? 'เช็คอินแล้ว' : 'ยังไม่เช็คอิน'}
                      </span>
                      {m.sellerCheckedIn && m.sellerCheckedInAt && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 font-medium">
                          {new Date(m.sellerCheckedInAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                        </span>
                      )}
                    </div>

                    {bothCheckedIn && (
                      <p className="text-[11px] font-semibold text-emerald-600 mt-0.5">🎉 มาครบทั้งสองฝ่ายแล้ว!</p>
                    )}
                  </div>

                  {/* ปุ่มเช็คอิน (ถ้าตัวเองยังไม่เช็คอิน) + ปุ่มไปหน้าเช็คอิน (GPS) */}
                  {!bothDelivered && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {!myCheckedIn && (
                        <button
                          type="button"
                          onClick={() => handleCheckIn(m, role)}
                          disabled={checkInLoading === m.id || checkInWindow?.status === 'waiting' || checkInWindow?.status === 'closed'}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#f95721] px-4 py-2 text-xs font-bold text-white hover:bg-orange-600 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <CheckCircle2 size={14} />
                          {checkInLoading === m.id ? 'กำลังเช็คอิน...' : '✅ เช็คอินตอนนี้'}
                        </button>
                      )}
                      {myCheckedIn && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-3 py-1.5">
                          <CheckCircle2 size={12} />
                          คุณเช็คอินแล้ว
                          {myCheckedInAt && ` · ${new Date(myCheckedInAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`}
                        </span>
                      )}
                      <Link
                        to={`/meetups/${m.id}/checkin`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-medium text-orange-700 hover:bg-orange-50 transition-colors"
                      >
                        📍 หน้าเช็คอิน GPS
                        <ChevronRight size={13} />
                      </Link>
                    </div>
                  )}

                  {bothDelivered && (
                    <span className="text-xs font-medium text-brand-600">✅ ทั้งสองฝ่ายยืนยันรับ–ส่งสินค้าครบแล้ว</span>
                  )}

                  {/* ปุ่มยกเลิก (ผู้ซื้อและผู้ขาย ถ้ายังไม่มีใครเช็คอิน) */}
                  {canCancel && (
                    <div className="border-t border-orange-100 pt-2 mt-1">
                      <button
                        type="button"
                        onClick={() => handleCancelClick(m, role)}
                        disabled={cancelLoading === m.id}
                        className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:underline disabled:opacity-50"
                      >
                        <XCircle size={13} />
                        {cancelLoading === m.id ? 'กำลังยกเลิก...' : 'ยกเลิกนัดนี้'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Completed: Review Logic ─────────────────── */}
              {m.status === 'completed' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    {myReview ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{'⭐'.repeat(myReview.rating)}</span>
                        <p className="text-xs text-ink-500">คุณให้คะแนนแล้ว</p>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => setReviewTarget({ meetup: m, role })}>⭐ ให้คะแนน</Button>
                    )}
                  </div>
                </div>
              )}

              {(m.status === 'rejected' || m.status === 'cancelled') && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2.5">
                  <XCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-red-600">
                      {m.status === 'cancelled' ? 'นัดนี้ถูกยกเลิกแล้ว' : 'คำขอนัดนี้ถูกปฏิเสธแล้ว'}
                    </p>
                    <p className="text-[11px] text-red-400 mt-0.5">หากต้องการนัดใหม่ กรุณาสร้างคำขอนัดรับใหม่จากหน้ารายละเอียดสินค้า</p>
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>


      <ReviewModal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        revieweeName={reviewTarget ? (reviewTarget.role === 'buyer' ? reviewTarget.meetup.sellerName : reviewTarget.meetup.buyerName) : ''}
        onSubmit={async ({ rating, comment, images = [] }) => {
          if (!reviewTarget) return;

          const { meetup, role } = reviewTarget;
          submitReview(meetup.id, role, { rating, comment, images });

          // บันทึกลง reviewStore ด้วยเพื่ออัปเดต Trust Score และหน้ารีวิว
          const isBuyer = role === 'buyer';
          const targetUserId = isBuyer ? meetup.sellerId : meetup.buyerId;
          const reviewerName = isBuyer ? meetup.buyerName : meetup.sellerName;

          import('@/store/reviewStore').then(({ useReviewStore }) => {
            useReviewStore.getState().addReview({
              targetUserId,
              reviewerId: isBuyer ? meetup.buyerId : meetup.sellerId,
              reviewerName,
              reviewerRole: isBuyer ? 'ผู้ซื้อ' : 'ผู้ขาย',
              rating,
              comment,
              images,
              productTitle: meetup.productTitle,
              meetupId: meetup.id,
            });
          });

          if (meetup.transactionId) {
            try {
              await api.createReview({
                transactionId: meetup.transactionId,
                revieweeId: targetUserId,
                rating,
                comment,
                images,
              });
            } catch (err) {
              console.error("API createReview error:", err);
            }
          }

          setReviewTarget(null);
        }}
      />

      {/* Confirm Cancel Meetup Dialog */}
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={executeCancel}
        title="ยืนยันการยกเลิกนัดรับสินค้า?"
        description="เมื่อยกเลิกแล้ว การนัดหมายนี้จะสิ้นสุดลงทันที และแจ้งเตือนไปยังคู่ค้าของคุณ"
        confirmLabel="ยืนยันยกเลิกนัด"
        cancelLabel="ไม่ยกเลิก"
        variant="danger"
        loading={!!cancelLoading}
      />

      {/* Confirm Reject Meetup Dialog */}
      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => executeRespond(rejectTarget, 'reject')}
        title="ปฏิเสธคำขอนัดรับสินค้านี้?"
        description="ผู้ซื้อจะได้รับการแจ้งเตือนว่าคำขอถูกปฏิเสธ และสามารถสร้างคำขอนัดใหม่ในวันหรือเวลาอื่นได้"
        confirmLabel="ปฏิเสธคำขอ"
        cancelLabel="ย้อนกลับ"
        variant="warning"
      />

      {/* Confirm Check-in Dialog */}
      <ConfirmDialog
        open={!!checkInTarget}
        onClose={() => setCheckInTarget(null)}
        onConfirm={executeCheckIn}
        title="ยืนยันการเช็คอิน ณ จุดนัดพบ?"
        description="กรุณาตรวจสอบว่าคุณอยู่ที่จุดนัดพบเรียบร้อยแล้วเพื่อบันทึกเวลาและแจ้งเตือนคู่ค้า"
        confirmLabel="ยืนยันเช็คอิน"
        cancelLabel="ยกเลิก"
        variant="info"
        loading={!!checkInLoading}
      />
    </div>
  );
}