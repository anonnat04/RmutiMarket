import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, MapPin, ChevronDown, ChevronUp, Bell, ArrowLeft, ChevronRight, CheckCircle2, XCircle, RefreshCw, Star, AlertTriangle } from 'lucide-react';
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
// ให้เป็น string status ที่ store ใช้อยู่จริง (pending/confirmed/completed/cancelled/no_show)
function mapStatusCode(code) {
  switch (code) {
    case 'PENDING': return 'pending';
    case 'CONFIRMED': return 'confirmed';
    case 'COMPLETED': return 'completed';
    case 'CANCELLED': return 'cancelled';
    case 'NO_SHOW': return 'no_show';
    default: return 'pending';
  }
}

// ── ตรวจสอบว่านัดหมายเลยเวลา 45 นาที และมีฝ่ายไม่เช็คอินหรือไม่ (No-show) ──
function isMeetupOverdue(date, time, buyerCheckedIn, sellerCheckedIn) {
  if (!date || !time) return false;
  try {
    const timeClean = String(time).slice(0, 5);
    const apptDate = new Date(`${date}T${timeClean}:00`);
    if (isNaN(apptDate.getTime())) return false;
    const deadline = new Date(apptDate.getTime() + 45 * 60 * 1000);
    return new Date() > deadline && (!buyerCheckedIn || !sellerCheckedIn);
  } catch {
    return false;
  }
}

// ── เลือกชื่อที่จะแสดง: ใช้ username เป็นหลักเสมอ (ตรงกับ users.username ในฐานข้อมูล) ──
function resolveUserName(u) {
  if (!u) return 'ผู้ใช้';
  if (typeof u === 'string') return u;
  return u.username || u.display_name || u.displayName || u.full_name || u.fullName || 'ผู้ใช้';
}

function mapAppointmentFromApi(m) {
  if (!m) return null;

  const txn = m.transaction || m.transactions || {};
  const product = m.product || m.listing || txn.products || txn.product || {};
  const buyer = m.buyer || txn.buyer || {};
  const seller = m.seller || txn.seller || {};
  const location = m.location || m.meetupPoint || m.locations || {};

  const buyerId = m.buyerId || m.buyer_id || txn.buyer_id || buyer.id;
  const sellerId = m.sellerId || m.seller_id || txn.seller_id || seller.id;
  const productId = m.productId || m.product_id || txn.product_id || product.id;

  const rawStatusCode = m.statusCode || m.appointment_status?.code || (m.status ? String(m.status).toUpperCase() : 'PENDING');
  let mappedStatus = m.status === 'no_show' ? 'no_show' : (m.status ? mapStatusCode(String(m.status).toUpperCase()) : mapStatusCode(rawStatusCode));

  const images = product.images || product.product_images || [];
  const coverImage = product.imageUrl || product.image_url || images.find((i) => i.is_cover || i.is_primary)?.url || images.find((i) => i.is_cover || i.is_primary)?.image_url || images[0]?.url || images[0]?.image_url || '';

  const date = m.appointment_date || m.date || (m.scheduledAt ? m.scheduledAt.split('T')[0] : '');
  const rawTime = m.appointment_time || m.time || m.startTime || (m.scheduledAt ? m.scheduledAt.split('T')[1]?.slice(0, 5) : '12:00');
  const time = rawTime ? String(rawTime).slice(0, 5) : '12:00';

  const buyerCheckedIn = Boolean(m.buyerCheckedIn || m.buyer_checked_in);
  const sellerCheckedIn = Boolean(m.sellerCheckedIn || m.seller_checked_in);

  // ตรวจจับ Overdue 45 นาที หากเลยเวลาแล้วไม่เช็คอิน ให้แสดงเป็น no_show ทันที
  if ((rawStatusCode === 'CONFIRMED' || mappedStatus === 'confirmed') && isMeetupOverdue(date, time, buyerCheckedIn, sellerCheckedIn)) {
    mappedStatus = 'no_show';
  }

  return {
    id: m.id,
    transactionId: m.transactionId || m.transaction_id || txn.id,
    productId,
    productTitle: product.title || m.productTitle || 'สินค้า',
    productPrice: m.price ?? m.agreedPrice ?? txn.agreed_price ?? product.price ?? 0,
    productImage: coverImage,
    buyerId,
    buyerName: resolveUserName(buyer) || m.buyerName || 'ผู้ซื้อ',
    sellerId,
    sellerName: resolveUserName(seller) || m.sellerName || 'ผู้ขาย',
    status: mappedStatus,
    statusCode: mappedStatus === 'no_show' ? 'NO_SHOW' : rawStatusCode,
    date,
    time,
    startTime: time,
    locationId: m.locationId ?? m.location_id ?? location.id,
    locationName: location.name || m.locationName || 'จุดนัดรับ มทร.อีสาน',
    locationLat: m.locationLat != null ? parseFloat(m.locationLat) : (meetupPoints.find((p) => p.name === (location.name || m.locationName))?.lat ?? (location.latitude != null ? parseFloat(location.latitude) : null)),
    locationLng: m.locationLng != null ? parseFloat(m.locationLng) : (meetupPoints.find((p) => p.name === (location.name || m.locationName))?.lng ?? (location.longitude != null ? parseFloat(location.longitude) : null)),
    buyerCheckedIn,
    sellerCheckedIn,
    buyerCheckedInAt: m.buyerCheckedInAt || m.buyer_checked_in_at || null,
    sellerCheckedInAt: m.sellerCheckedInAt || m.seller_checked_in_at || null,
    buyerConfirmedDelivery: rawStatusCode === 'COMPLETED' || mappedStatus === 'completed',
    sellerConfirmedDelivery: rawStatusCode === 'COMPLETED' || mappedStatus === 'completed',
    note: m.note || m.location_detail || m.locationDetail || '',
    reviews: m.reviews || txn.reviews || [],
    isDb: true,
  };
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
    if (!mapRef.current) return;

    // ถ้า map ถูกสร้างแล้ว ให้ invalidateSize เมื่อ container ปรากฏ
    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
      return;
    }

    let lat = CAMPUS_CENTER.lat;
    let lng = CAMPUS_CENTER.lng;
    const found = meetupPoints.find((p) => p.id === meetup.locationId);
    if (found) { lat = found.lat; lng = found.lng; }
    else if (meetup.locationLat) { lat = meetup.locationLat; lng = meetup.locationLng; }

    // ใส่ Leaflet CSS ถ้ายังไม่มี
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }

    // รอให้ CSS โหลดก่อนสร้าง map (100ms)
    const timer = setTimeout(() => {
      import('leaflet').then((mod) => {
        if (mapInstanceRef.current || !mapRef.current) return;
        const L = mod.default ?? mod;
        try {
          const map = L.map(mapRef.current, {
            center: [lat, lng],
            zoom: 17,
            zoomControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            attributionControl: false,
          });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);

          const icon = L.divIcon({
            html: `<div style="width:20px;height:20px;background:#f97316;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
            className: '',
          });
          L.marker([lat, lng], { icon }).addTo(map);
          mapInstanceRef.current = map;
          // invalidateSize หลัง render เสร็จ
          setTimeout(() => map.invalidateSize(), 200);
        } catch (e) {
          console.warn('Map init error:', e);
        }
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [meetup.locationId, meetup.locationLat, meetup.locationLng]);

  return (
    <div
      ref={mapRef}
      style={{ height: 180, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f3f4f6' }}
    />
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'all',       label: 'ทั้งหมด',       statuses: [] },
  { key: 'pending',   label: 'รอดำเนินการ',  statuses: ['pending', 'return_requested'] },
  { key: 'confirmed', label: 'นัดหมายแล้ว',  statuses: ['confirmed'] },
  { key: 'completed', label: 'เสร็จสิ้น',    statuses: ['completed', 'return_accepted', 'return_rejected'] },
  { key: 'no_show',   label: 'ไม่มาตามนัด',  statuses: ['no_show', 'missed'] },
  { key: 'cancelled', label: 'ยกเลิกแล้ว',   statuses: ['cancelled', 'rejected'] },
];

function tabMatches(tab, status) {
  if (!tab) return false;
  if (tab.key === 'all') return true;
  return tab.statuses?.includes(status);
}

export function MeetupListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const meetups = useMeetupStore((s) => s.meetups);
  const respondToRequest = useMeetupStore((s) => s.respondToRequest);
  const cancelRequest = useMeetupStore((s) => s.cancelRequest);
  const submitReview = useMeetupStore((s) => s.submitReview);

  const addNotification = useNotificationStore((s) => s.addNotification);

  const [dbMeetups, setDbMeetups] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [activeTab, setActiveTab] = useState(() => { const p = searchParams.get('tab'); return (p && TABS.some(t => t.key === p)) ? p : 'pending'; });
  const [highlightId, setHighlightId] = useState(() => searchParams.get('highlight') || null);
  const [expandedMap, setExpandedMap] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(null);   // meetup id ที่กำลังยกเลิก
  const [cancelTarget, setCancelTarget] = useState(null);     // { meetup, role } สำหรับ confirm dialog
  const [cancelPenalty, setCancelPenalty] = useState(null);   // เงื่อนไขตัดคะแนนจากกฎในฐานข้อมูล
  const [rejectTarget, setRejectTarget] = useState(null);     // meetup สำหรับ confirm ปฏิเสธนัด

  // ── จดจำรายการนัดรับที่เคยกดเปิดดูแล้ว (เพื่อให้ตัวเลขแจ้งเตือนบนแท็บหายไปเมื่อกดดูแล้ว) ──
  const [seenMeetupIds, setSeenMeetupIds] = useState(() => {
    try {
      const stored = localStorage.getItem('cm_seen_meetup_ids');
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });

  // บังคับ re-render ทุกนาทีเพื่อให้ป้ายสถานะช่วง Check-in อัปเดตตามเวลาจริง
  const [, forceTick] = useState(0);


  const myId = user?.id ?? 'me';

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // ── ดึงรายการนัดรับจริงจาก Backend API ──
  const fetchMeetups = async () => {
    const token = localStorage.getItem('cm_token') || localStorage.getItem('token') || localStorage.getItem('cm_admin_token');
    if (!token && !user) return;
    try {
      setLoadingDb(true);
      const res = await api.getMyMeetups();
      const list = (res.meetups || []).map(mapAppointmentFromApi).filter(Boolean);
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
    // DB เป็น source of truth — ใช้เป็น base แล้ว dedup ด้วย transactionId + productId-buyerId-sellerId
    const seenIds = new Set();
    const seenTxnIds = new Set();
    const seenCombo = new Set();
    const combined = [];
    for (const m of dbMeetups) {
      seenIds.add(String(m.id));
      if (m.transactionId) seenTxnIds.add(String(m.transactionId));
      const combo = `${m.productId}-${m.buyerId}-${m.sellerId}-${m.status}`;
      seenCombo.add(combo);
      combined.push(m);
    }
    // เพิ่มรายการจาก localStorage เฉพาะที่ไม่ซ้ำกับ DB
    for (const m of meetups) {
      if (seenIds.has(String(m.id))) continue;
      if (m.transactionId && seenTxnIds.has(String(m.transactionId))) continue;
      const combo = `${m.productId}-${m.buyerId}-${m.sellerId}-${m.status}`;
      if (seenCombo.has(combo)) continue;
      combined.push(m);
    }
    return combined;
  }, [dbMeetups, meetups]);

  const myMeetups = useMemo(() => {
    return allMeetups.filter((m) => {
      if (m.isDb) return true; // รายการจาก API /api/meetups คือของ user ปัจจุบันโดยตรง
      if (!myId || myId === 'me') return true;
      return String(m.buyerId) === String(myId) || String(m.sellerId) === String(myId);
    });
  }, [allMeetups, myId]);
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

  // ── เมื่อเปิดดูแท็บใด ให้บันทึกว่ารายการในแท็บนั้นถูกเปิดดูแล้ว เพื่อลบเลขแจ้งเตือนบนแท็บ ──
  const markTabAsSeen = (tabKey) => {
    const tabObj = TABS.find((t) => t.key === tabKey);
    if (!tabObj) return;
    const tabMeetups = tabObj.key === 'all'
      ? myMeetups
      : myMeetups.filter((m) => tabMatches(tabObj, m.status));
    if (tabMeetups.length === 0) return;

    setSeenMeetupIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      tabMeetups.forEach((m) => {
        const idStr = String(m.id);
        if (!next.has(idStr)) {
          next.add(idStr);
          changed = true;
        }
      });
      if (changed) {
        try {
          localStorage.setItem('cm_seen_meetup_ids', JSON.stringify([...next]));
        } catch (e) {}
        return next;
      }
      return prev;
    });
  };

  useEffect(() => {
    if (activeTab && myMeetups.length > 0) {
      markTabAsSeen(activeTab);
    }
  }, [activeTab, myMeetups]);

  // ── อ่าน ?tab=X&highlight=Y จาก URL เมื่อมาจากแจ้งเตือน ──────────────────
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const highlightParam = searchParams.get('highlight');
    if (tabParam && TABS.some(t => t.key === tabParam)) setActiveTab(tabParam);
    if (highlightParam) setHighlightId(highlightParam);
  }, [searchParams]);

  // ── Auto-scroll ไปที่การ์ดที่ถูก highlight ──────────────────────────────
  const highlightRef = useRef(null);
  useEffect(() => {
    if (!highlightId || !highlightRef.current) return;
    const timer = setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 400);
    return () => clearTimeout(timer);
  }, [highlightId, filteredMeetups]);


  // ── ส่ง Notification จำลองให้อีกฝ่าย ──────────────────────────────
  const notifyOther = (meetup, actionType, role) => {
    const targetUserId = role === 'buyer' ? meetup.sellerId : meetup.buyerId;
    if (!targetUserId || String(targetUserId) === String(myId)) return;
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
    try {
      respondToRequest(m.id, action);
    } catch (e) {}
    notifyOther(m, action === 'confirm' ? 'confirm_request' : 'reject_request', 'seller');
    try {
      if (action === 'confirm') {
        try {
          await api.acceptMeetup(m.id);
        } catch (apiErr) {
          console.warn('api.acceptMeetup warning:', apiErr);
        }
        // อัปเดตนัดหมายใน local state ให้เป็น confirmed ทันที
        setDbMeetups((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, status: 'confirmed', statusCode: 'CONFIRMED' } : x
          )
        );
        // ไปยังขั้นตอนการนัดรับ (หน้าเช็คอิน GPS) ทันที
        navigate(`/meetups/${m.id}/checkin`);
        return;
      } else if (action === 'reject') {
        await api.cancelMeetup(m.id, 'ผู้ขายปฏิเสธคำขอนัดรับ');
      }
      await fetchMeetups();
    } catch (err) {
      console.error('API accept/reject error:', err);
      alert(err.message || 'เกิดข้อผิดพลาดในการตอบรับคำขอ');
    }
    setRejectTarget(null);
  };

  // ── ยกเลิกนัด (ทั้งผู้ซื้อและผู้ขายทำได้, ยืนยันก่อนเสมอผ่าน ConfirmDialog) ────
  const handleCancelClick = (m, role) => {
    setCancelTarget({ meetup: m, role });
  };

  const executeCancel = async (confirmPenalty = false) => {
    if (!cancelTarget) return;
    const { meetup: m, role } = cancelTarget;

    try {
      setCancelLoading(m.id);
      // เรียก API ยกเลิกที่ backend
      await api.cancelMeetup(m.id, undefined, { confirmPenalty });

      // อัปเดต UI เมื่อ backend ยืนยันการยกเลิกแล้ว
      setDbMeetups((prev) =>
        prev.map((x) =>
          x.id === m.id ? { ...x, status: 'cancelled', statusCode: 'CANCELLED' } : x
        )
      );
      try { cancelRequest(m.id); } catch (e) {}

      notifyOther(m, 'cancel_request', role);
      setCancelTarget(null);
      setCancelPenalty(null);
      await fetchMeetups();
    } catch (err) {
      if (!confirmPenalty && err.status === 409 && err.data?.requiresConfirm) {
        setCancelPenalty(err.data);
        return;
      }
      console.error('API cancelMeetup error:', err);
      alert(err.message || 'เกิดข้อผิดพลาดในการยกเลิกนัดรับ');
      setCancelTarget(null);
      setCancelPenalty(null);
    } finally {
      setCancelLoading(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 border-b border-surface-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-extrabold text-ink-900 sm:text-xl">📅 นัดรับสินค้าของฉัน</h1>
            <p className="text-xs text-ink-500">ติดตามสถานะการนัดพบและส่งมอบสินค้า</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => fetchMeetups()}
            disabled={loadingDb}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:text-orange-600 hover:border-orange-300 transition-colors shadow-2xs disabled:opacity-50"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={13} className={loadingDb ? "animate-spin text-orange-600" : ""} />
            <span>รีเฟรช</span>
          </button>
          <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
            {myMeetups.length} รายการ
          </span>
        </div>
      </div>

      <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm sm:mx-0 sm:flex-wrap sm:overflow-visible">
        {TABS.map((tab) => {
          const isCancelledTab = tab.key === 'cancelled';
          const isNoShowTab = tab.key === 'no_show';
          const tabMeetups = myMeetups.filter((m) => tabMatches(tab, m.status));

          // นับเฉพาะรายการใหม่ที่ยังไม่เคยเปิดดูในหน้านี้ (!seenMeetupIds.has)
          // และถ้ากำลังเปิดดูแท็บนั้นอยู่ (activeTab === tab.key) ให้ซ่อนตัวเลขแจ้งเตือนออกทันที
          const unseenCount = activeTab === tab.key
            ? 0
            : tab.key === 'pending'
            ? tabMeetups.filter((m) => !seenMeetupIds.has(String(m.id)) && ((m.status === 'pending' || m.status === 'return_requested') && String(m.sellerId) === String(myId))).length
            : tabMeetups.filter((m) => !seenMeetupIds.has(String(m.id))).length;

          const count = unseenCount;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                markTabAsSeen(tab.key);
              }}
              style={{
                flexShrink: 0, padding: '9px 14px', borderRadius: 12, border: 'none',
                background: activeTab === tab.key ? '#fff' : 'transparent',
                color: activeTab === tab.key ? (isCancelledTab ? '#dc2626' : isNoShowTab ? '#e11d48' : '#f97316') : '#6b7280',
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize: 12, cursor: 'pointer', minHeight: 40,
                boxShadow: activeTab === tab.key ? '0 2px 8px rgba(15,23,42,0.12)' : 'none',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  style={{
                    minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
                    background: isCancelledTab ? '#9ca3af' : isNoShowTab ? '#e11d48' : '#f97316',
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

      {loadingDb && dbMeetups.length === 0 ? (
        <div className="space-y-4 py-4">
          <div className="h-36 bg-slate-100 rounded-2xl animate-pulse" />
          <div className="h-36 bg-slate-100 rounded-2xl animate-pulse" />
        </div>
      ) : myMeetups.length === 0 ? (
        <EmptyState
          title="ยังไม่มีนัดรับสินค้า"
          description='กดปุ่ม "นัดรับสินค้า" ที่หน้ารายละเอียดสินค้าเพื่อเริ่มนัดกับผู้ขาย'
          icon={CalendarClock}
          action={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchMeetups()} disabled={loadingDb}>
                <RefreshCw size={14} className={loadingDb ? "animate-spin" : ""} /> รีเฟรชข้อมูล
              </Button>
              <Link to="/products">
                <Button size="sm">เลือกดูสินค้า</Button>
              </Link>
            </div>
          }
        />
      ) : filteredMeetups.length === 0 ? (
        <div className="py-12 text-center text-sm text-ink-400 bg-white rounded-2xl border border-gray-100 shadow-2xs">
          ไม่มีรายการในหมวดนี้
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredMeetups.map((m) => {
            const role = String(m.buyerId) === String(myId) ? 'buyer' : (String(m.sellerId) === String(myId) ? 'seller' : 'buyer');
            const otherName = role === 'buyer' ? (m.sellerName || 'ผู้ขาย') : (m.buyerName || 'ผู้ซื้อ');
            const targetUserId = role === 'buyer' ? m.sellerId : m.buyerId;
            const userReviewFromDb = Array.isArray(m.reviews)
              ? m.reviews.find((r) => String(r.reviewer_id) === String(myId))
              : null;
            const myReview =
              (role === 'buyer' ? m.buyerReview : m.sellerReview) ||
              m.myReview ||
              userReviewFromDb;

            const hasAction =
              (m.status === 'pending' && role === 'seller') ||
              (m.status === 'return_requested' && role === 'seller');

            const mapOpen = expandedMap === m.id;
            const checkInWindow = m.status === 'confirmed' ? getCheckInWindow(m) : null;
            const bothCheckedIn = m.buyerCheckedIn && m.sellerCheckedIn;
            const bothDelivered = m.buyerConfirmedDelivery && m.sellerConfirmedDelivery;
            const myCheckedIn = role === 'buyer' ? m.buyerCheckedIn : m.sellerCheckedIn;
            const myCheckedInAt = role === 'buyer' ? m.buyerCheckedInAt : m.sellerCheckedInAt;
            const canCancel = ['pending', 'confirmed'].includes(m.status) && !bothDelivered;

            const isHighlighted = highlightId && String(m.id) === String(highlightId);

            return (
              <div
                key={m.id}
                ref={isHighlighted ? highlightRef : null}
                className="cm-card flex flex-col gap-3 p-4"
                style={{
                  borderLeft: hasAction ? '4px solid #f97316' : undefined,
                  transition: 'box-shadow 0.2s, outline 0.2s',
                  outline: isHighlighted ? '2.5px solid #f97316' : undefined,
                  boxShadow: isHighlighted ? '0 0 0 4px #fed7aa55' : undefined,
                }}
              >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{m.productTitle}</p>
                  <p className="text-xs text-ink-500">{role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'}: {otherName}</p>
                </div>
                {m.status === 'completed' && myReview ? (
                  <span className="inline-block rounded-full px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-800">
                    ✅ เสร็จสิ้นแล้ว
                  </span>
                ) : (
                  <MeetupStatusBadge status={m.status} />
                )}
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
                  {m.note && m.note !== m.locationName && (<p style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>💬 หมายเหตุ: {m.note}</p>)}
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

                  {/* ปุ่มไปหน้าเช็คอิน (GPS) */}
                  {!bothDelivered && (
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {myCheckedIn && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-3 py-1.5">
                          <CheckCircle2 size={12} />
                          คุณเช็คอินแล้ว
                          {myCheckedInAt && ` · ${new Date(myCheckedInAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`}
                        </span>
                      )}
                      <Link
                        to={`/meetups/${m.id}/checkin`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-200 bg-white hover:bg-orange-50 px-3.5 py-2 text-xs font-bold text-orange-700 transition-colors shadow-2xs"
                      >
                        📍 หน้าเช็คอิน GPS
                        <ChevronRight size={13} />
                      </Link>
                    </div>
                  )}

                  {bothDelivered && (
                    <span className="text-xs font-medium text-brand-600">✅ ทั้งสองฝ่ายยืนยันรับ–ส่งสินค้าครบแล้ว</span>
                  )}

                  {/* ปุ่มยกเลิก (ทั้งผู้ซื้อและผู้ขายสามารถกดยกเลิกได้ก่อนปิดการขาย) */}
                  {canCancel && (
                    <div className="border-t border-orange-100 pt-2.5 mt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleCancelClick(m, role)}
                        disabled={cancelLoading === m.id}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 px-3.5 py-1.5 text-xs font-bold text-red-600 transition-colors shadow-2xs disabled:opacity-50"
                      >
                        <XCircle size={14} />
                        {cancelLoading === m.id ? 'กำลังยกเลิก...' : 'ยกเลิกการนัดรับ'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ─── Completed: Review Logic ─────────────────── */}
              {m.status === 'completed' && (
                <div className="flex flex-col gap-2 pt-1 border-t border-gray-100">
                  <div className="flex flex-wrap items-center gap-2">
                    {myReview ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200">
                          <CheckCircle2 size={14} className="text-emerald-600" />
                          เสร็จสิ้นแล้ว (ให้คะแนนแล้ว)
                          <span className="ml-1 text-amber-500 font-bold">
                            {'★'.repeat(myReview.rating || 5)}
                          </span>
                        </span>
                        {myReview.comment && (
                          <span className="text-xs text-gray-500 italic">
                            "{myReview.comment}"
                          </span>
                        )}
                        <Link
                          to={targetUserId ? `/profile/${targetUserId}/reviews` : '/reviews'}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 text-[#f95721] font-bold text-xs transition-colors shadow-2xs"
                          title={`ดูหน้ารีวิวของ ${otherName}`}
                        >
                          <Star size={13} className="fill-[#f95721] text-[#f95721]" />
                          <span>ดูรีวิว ({otherName})</span>
                          <ChevronRight size={13} />
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => setReviewTarget({ meetup: m, role })}
                          className="bg-[#f95721] hover:bg-orange-600 text-white font-bold text-xs shadow-xs"
                        >
                          ⭐ ให้คะแนน
                        </Button>
                        <Link
                          to={targetUserId ? `/profile/${targetUserId}/reviews` : '/reviews'}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs transition-colors shadow-2xs"
                        >
                          <span>ดูรีวิว ({otherName})</span>
                          <ChevronRight size={13} />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {m.status === 'no_show' && (
                <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-3">
                  <AlertTriangle size={16} className="text-rose-600 mt-0.5 shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <p className="text-xs font-bold text-rose-800 flex items-center justify-between">
                      <span>ตัดจบ: ไม่มาตามนัดหมาย (No-show)</span>
                      <span className="text-[10px] text-rose-500 font-normal">เลยเวลานัดเกิน 45 นาที</span>
                    </p>
                    <p className="text-[11px] text-rose-700 leading-relaxed">
                      เลยกำหนดเวลานัดหมายเกิน 45 นาที และมีฝ่ายที่ไม่ได้มาเช็คอิน ระบบจึงทำการตัดจบนัดหมายนี้อัตโนมัติ และตัดคะแนนความน่าเชื่อถือของผู้ที่ไม่มาตามนัดเรียบร้อยแล้ว
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-semibold">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${m.buyerCheckedIn ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/90"}`}>
                        🛒 ผู้ซื้อ ({m.buyerName || 'ผู้ซื้อ'}): {m.buyerCheckedIn ? "เช็คอินแล้ว ✅" : "ไม่มาเช็คอิน ❌ (ถูกตัดคะแนน)"}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${m.sellerCheckedIn ? "text-emerald-700 bg-emerald-100/80" : "text-rose-700 bg-rose-100/90"}`}>
                        🏷️ ผู้ขาย ({m.sellerName || 'ผู้ขาย'}): {m.sellerCheckedIn ? "เช็คอินแล้ว ✅" : "ไม่มาเช็คอิน ❌ (ถูกตัดคะแนน)"}
                      </span>
                    </div>
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
    )}


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
        open={!!cancelTarget && !cancelPenalty}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => executeCancel(false)}
        title="ยืนยันการยกเลิกนัดรับสินค้า?"
        description="เมื่อยกเลิกแล้ว การนัดหมายนี้จะสิ้นสุดลงและแจ้งเตือนไปยังคู่ค้าของคุณ หากนัดได้รับการยืนยันแล้วและเข้าเงื่อนไขตัดคะแนน ระบบจะแจ้งจำนวนคะแนนให้ยืนยันก่อนยกเลิกอีกครั้ง"
        confirmLabel="ยืนยันยกเลิกนัด"
        cancelLabel="ไม่ยกเลิก"
        variant="danger"
        loading={!!cancelLoading}
      />

      <ConfirmDialog
        open={!!cancelPenalty}
        onClose={() => { setCancelPenalty(null); setCancelTarget(null); }}
        onConfirm={() => executeCancel(true)}
        title="ยกเลิกนัดนี้และยอมรับการตัดคะแนน?"
        description={cancelPenalty ? `การยกเลิกนัดที่ยืนยันแล้วก่อนเวลานัดน้อยกว่า ${cancelPenalty.thresholdMinutes} นาที จะถูกหัก ${cancelPenalty.pointsDeducted} คะแนนตามกฎในระบบ (เหลือประมาณ ${cancelPenalty.minutesLeft} นาที) หากยืนยัน ระบบจะยกเลิกนัดและบันทึกการหักคะแนนทันที` : ''}
        confirmLabel="ยืนยันและหักคะแนน"
        cancelLabel="กลับไป"
        variant="warning"
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

    </div>
  );
}
