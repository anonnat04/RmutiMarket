import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, CalendarClock, Navigation,
  PackageCheck, ShieldCheck, Radio, XCircle, Clock,
  Maximize2, X, CheckCircle2, Star, AlertTriangle, ShoppingBag,
  MessageCircle, Target, Pin, Lightbulb, Tag, Check
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMeetupStore, getCheckInWindow, haversineDistanceMeters } from '@/store/meetupStore';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ReviewModal } from '@/components/meetup/ReviewModal';
import { CAMPUS_CENTER, meetupPoints } from '@/constants/meetupPoints';
import { api } from '@/lib/api';
import { getSocket, joinMeetupTracking, leaveMeetupTracking, emitLiveLocation, stopLiveLocation } from '@/services/socket';

// ────────────────────────────────
// ค่าคงที่เช็คอิน (ต้องตรงกับ backend)
// ────────────────────────────────
const CHECKIN_RADIUS_M = 50;        // รัศมีวงสีเขียว/พื้นที่เช็คอิน
const CHECKIN_MAX_ACCURACY_M = 200; // ยอมรับความคลาดเคลื่อนถึง ±200 ม. (รองรับทั้งมือถือในอาคาร และ Chrome DevTools Sensors ±150 ม.)

// ────────────────────────────────
// ฟังก์ชัน Helper
// ────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(isoStr) {
  if (!isoStr) return null;
  try {
    return new Date(isoStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return null;
  }
}

// อ่านตำแหน่ง GPS "ที่แม่นที่สุด" ภายในเวลาที่กำหนด (พร้อม fallback ไปยังพิกัดล่าสุด)
function getBestPosition({ maxWaitMs = 8000, goodAccuracy = 5, fallbackCoords = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      if (fallbackCoords && Number.isFinite(fallbackCoords.lat) && Number.isFinite(fallbackCoords.lng)) {
        resolve({ coords: { latitude: fallbackCoords.lat, longitude: fallbackCoords.lng, accuracy: fallbackCoords.accuracy } });
        return;
      }
      reject(new Error('อุปกรณ์นี้ไม่รองรับ GPS กรุณาเปิดตำแหน่งที่ตั้งบนอุปกรณ์แล้วลองอีกครั้ง'));
      return;
    }
    let best = null;
    let done = false;
    let watchId = null;
    let timer = null;
    const finish = (err) => {
      if (done) return;
      done = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) {
        resolve(best);
        return;
      }
      if (err?.code === 1) {
        reject(err);
        return;
      }
      // ลองอ่านแบบ standard accuracy เผื่อ high accuracy timeout (เช่น บนคอม/ในอาคาร)
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        () => {
          if (fallbackCoords && Number.isFinite(fallbackCoords.lat) && Number.isFinite(fallbackCoords.lng)) {
            resolve({
              coords: {
                latitude: fallbackCoords.lat,
                longitude: fallbackCoords.lng,
                accuracy: fallbackCoords.accuracy,
              },
            });
          } else {
            reject(err || { code: 3 });
          }
        },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 15000 }
      );
    };
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= goodAccuracy) finish();
      },
      (err) => {
        // ยกเลิกทันทีเฉพาะกรณีไม่อนุญาตสิทธิ์ (code 1); error ชั่วคราวให้รอดูสัญญาณถัดไปจนครบเวลา
        if (err?.code === 1) finish(err);
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 5000 }
    );
    timer = setTimeout(() => finish(), maxWaitMs);
  });
}

// สถานะที่ backend อาจส่งมาแทน "นัดที่ยอมรับแล้ว" (CONFIRMED / SCHEDULED / ACCEPTED)
const ACCEPTED_STATUS_CODES = ['CONFIRMED', 'SCHEDULED', 'ACCEPTED'];

function mapStatusCode(code) {
  const c = String(code || '').toUpperCase();
  if (ACCEPTED_STATUS_CODES.includes(c)) return 'confirmed';
  switch (c) {
    case 'PENDING': return 'pending';
    case 'COMPLETED': return 'completed';
    case 'CANCELLED': return 'cancelled';
    case 'NO_SHOW': return 'no_show';
    default: return 'pending';
  }
}

function isMeetupOverdue(date, time, buyerCheckedIn, sellerCheckedIn) {
  if (!date || !time) return false;
  try {
    const timeClean = String(time).slice(0, 5);
    const apptDate = new Date(`${String(date).slice(0, 10)}T${timeClean}:00+07:00`);
    if (isNaN(apptDate.getTime())) return false;
    const deadline = new Date(apptDate.getTime() + 45 * 60 * 1000);
    return new Date() > deadline && (!buyerCheckedIn || !sellerCheckedIn);
  } catch {
    return false;
  }
}

function resolveUserName(u) {
  if (!u) return 'ผู้ใช้';
  if (typeof u === 'string') return u;
  return u.username || u.display_name || u.displayName || u.full_name || u.fullName || 'ผู้ใช้';
}

// ────────────────────────────────
// กฎยกเลิกนัดกระชั้นชิด (LATE_CANCEL)
// ────────────────────────────────
const LATE_CANCEL_THRESHOLD_MINUTES = 120;
const LATE_CANCEL_POINTS = 10;
const LATE_CANCEL_GRACE_MINUTES = 15;

function isMeetupAccepted(meetup) {
  if (!meetup) return false;
  if (meetup.status === 'confirmed') return true;
  if (meetup.confirmedAt) return true;
  return ACCEPTED_STATUS_CODES.includes(String(meetup.statusCode || '').toUpperCase());
}

function getMinutesUntilMeetup(meetup) {
  if (!meetup || !meetup.date || !meetup.time) return null;
  const dateOnly = String(meetup.date).slice(0, 10);
  const apptTime = new Date(`${dateOnly}T${String(meetup.time).slice(0, 5)}:00+07:00`);
  if (isNaN(apptTime.getTime())) return null;
  return (apptTime.getTime() - Date.now()) / 60000;
}

function getLateCancelPenalty(meetup, myCheckedIn) {
  if (!isMeetupAccepted(meetup)) return null;
  if (myCheckedIn) return null;

  const minutesLeft = getMinutesUntilMeetup(meetup);
  if (minutesLeft === null) return null;

  const sinceConfirm = meetup.confirmedAt
    ? (Date.now() - new Date(meetup.confirmedAt).getTime()) / 60000
    : Infinity;

  if (sinceConfirm <= LATE_CANCEL_GRACE_MINUTES) return null;
  if (minutesLeft >= LATE_CANCEL_THRESHOLD_MINUTES) return null;

  return {
    pointsDeducted: LATE_CANCEL_POINTS,
    thresholdMinutes: LATE_CANCEL_THRESHOLD_MINUTES,
    minutesLeft: Math.max(0, Math.round(minutesLeft)),
  };
}

function normalizeServerPenalty(data, meetup) {
  if (!data) return null;
  const computedLeft = getMinutesUntilMeetup(meetup);
  const rawLeft = data.minutesLeft ?? data.minutes_left ?? computedLeft ?? 0;
  return {
    pointsDeducted: Number(data.pointsDeducted ?? data.points_deducted ?? data.points ?? LATE_CANCEL_POINTS),
    thresholdMinutes: Number(data.thresholdMinutes ?? data.threshold_minutes ?? LATE_CANCEL_THRESHOLD_MINUTES),
    minutesLeft: Math.max(0, Math.round(Number(rawLeft))),
  };
}

function formatThresholdHours(minutes) {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

function mapAppointment(m) {
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
  const coverImage =
    m.productImage ||
    m.product_image ||
    m.imageUrl ||
    m.image_url ||
    product.imageUrl ||
    product.image_url ||
    product.coverImage ||
    images.find((i) => i.is_cover || i.is_primary)?.url ||
    images.find((i) => i.is_cover || i.is_primary)?.image_url ||
    images[0]?.url ||
    images[0]?.image_url ||
    (typeof product.images === 'string' ? product.images : '') ||
    '';

  const rawDate = m.appointment_date || m.date || (m.scheduledAt ? m.scheduledAt.split('T')[0] : '');
  const date = rawDate ? String(rawDate).slice(0, 10) : '';
  const rawTime = m.appointment_time || m.time || m.startTime || (m.scheduledAt ? m.scheduledAt.split('T')[1]?.slice(0, 5) : '12:00');
  const time = rawTime ? String(rawTime).slice(0, 5) : '12:00';

  const buyerCheckedIn = Boolean(m.buyerCheckedIn || m.buyer_checked_in);
  const sellerCheckedIn = Boolean(m.sellerCheckedIn || m.seller_checked_in);

  const confirmedAt = m.confirmedAt || m.confirmed_at || null;

  if (mappedStatus === 'pending' && confirmedAt) {
    mappedStatus = 'confirmed';
  }

  if (mappedStatus === 'confirmed' && isMeetupOverdue(date, time, buyerCheckedIn, sellerCheckedIn)) {
    mappedStatus = 'no_show';
  }

  // พิกัดจุดนัด: ใช้พิกัดจากฐานข้อมูล (locations) เป็นหลัก เพื่อให้ตรงกับที่ backend ใช้ตรวจระยะ
  // ค่าคงที่ใน meetupPoints ใช้เป็น fallback เท่านั้น
  const locName = location.name || m.locationName;
  const fallbackPoint = meetupPoints.find((p) => p.name === locName);
  const locationLat =
    m.locationLat != null ? parseFloat(m.locationLat)
      : location.latitude != null ? parseFloat(location.latitude)
        : (fallbackPoint?.lat ?? null);
  const locationLng =
    m.locationLng != null ? parseFloat(m.locationLng)
      : location.longitude != null ? parseFloat(location.longitude)
        : (fallbackPoint?.lng ?? null);

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
    confirmedAt,
    locationId: m.locationId ?? m.location_id ?? location.id,
    locationName: locName || 'จุดนัดรับ มทร.อีสาน',
    locationLat,
    locationLng,
    buyerCheckedIn,
    sellerCheckedIn,
    buyerCheckedInAt: m.buyerCheckedInAt || m.buyer_checked_in_at || null,
    sellerCheckedInAt: m.sellerCheckedInAt || m.seller_checked_in_at || null,
    // FIX: ดูจากธุรกรรมเท่านั้น ห้ามเดาจากสถานะนัด (เดิมทำให้ฝั่งที่ยังไม่กดขึ้นว่ายืนยันแล้ว)
    buyerConfirmedDelivery: Boolean(txn.buyer_received || txn.buyerReceived),
    sellerConfirmedDelivery: Boolean(txn.seller_handed_over || txn.sellerHandedOver),
    note: m.meetingDetail || m.meeting_detail || '',
    reviews: m.reviews || txn.reviews || [],
    isDb: true,
  };
}

// ────────────────────────────────
// Badge ช่วงเช็คอิน
// ────────────────────────────────
function CheckInWindowBadge({ status }) {
  const map = {
    waiting: { label: 'ยังไม่ถึงเวลาเปิด Check-in', Icon: Clock, style: { background: '#f3f4f6', color: '#6b7280' } },
    open:    { label: 'เปิด Check-in แล้ว',         Icon: CheckCircle2, style: { background: '#dcfce7', color: '#16a34a' } },
    late:    { label: 'อยู่ในช่วง Check-in สาย',    Icon: AlertTriangle, style: { background: '#fef3c7', color: '#b45309' } },
    closed:  { label: 'ปิด Check-in แล้ว',           Icon: XCircle, style: { background: '#fee2e2', color: '#dc2626' } },
    unknown: { label: '—',                              Icon: null, style: { background: '#f3f4f6', color: '#9ca3af' } },
  };
  const cfg = map[status] || map.unknown;
  const BadgeIcon = cfg.Icon;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, ...cfg.style }}>
      {BadgeIcon && <BadgeIcon size={13} />}
      {cfg.label}
    </span>
  );
}

// ────────────────────────────────
// แผนที่: จุดนัดรับ + วงเช็คอิน 50 ม. + ผู้ซื้อ/ผู้ขายแบบเรียลไทม์ + วงความแม่นยำ GPS
// ────────────────────────────────
function MiniMap({ meetup, myCoords, peerCoords, role, myName, otherName }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const miniMarkersRef = useRef({});
  const leafletRef = useRef(null);
  const [mapReady, setMapReady] = useState(0);
  const firstFitRef = useRef(false);

  const fullMapRef = useRef(null);
  const fullMapInstanceRef = useRef(null);
  const fullMarkersRef = useRef({});
  const fullLeafletRef = useRef(null);
  const [fullMapReady, setFullMapReady] = useState(0);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // พิกัดจุดนัดรับ: ใช้พิกัดจาก DB ก่อน
  let targetLat = CAMPUS_CENTER.lat;
  let targetLng = CAMPUS_CENTER.lng;
  if (meetup?.locationLat != null && meetup?.locationLng != null) {
    targetLat = meetup.locationLat;
    targetLng = meetup.locationLng;
  } else {
    const found = meetupPoints.find((p) => p.id === meetup?.locationId);
    if (found) { targetLat = found.lat; targetLng = found.lng; }
  }

  const isMeBuyer = role === 'buyer';
  const buyerCoords = isMeBuyer ? myCoords : peerCoords;
  const sellerCoords = isMeBuyer ? peerCoords : myCoords;
  const buyerLabel = isMeBuyer ? `คุณ (ผู้ซื้อ: ${myName})` : `ผู้ซื้อ: ${otherName}`;
  const sellerLabel = isMeBuyer ? `ผู้ขาย: ${otherName}` : `คุณ (ผู้ขาย: ${myName})`;

  const createMarkerIcon = (L, color, labelText, yOffset = -100) => {
    return L.divIcon({
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, ${yOffset}%);pointer-events:auto">
          <div style="background:${color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.25);white-space:nowrap;margin-bottom:2px;border:1px solid #ffffffa0">
            ${labelText}
          </div>
          <div style="width:16px;height:16px;background:${color};border:2.5px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>
        </div>
      `,
      className: '',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  };

  const hasPoint = (c) => Number.isFinite(c?.lat) && Number.isFinite(c?.lng);

  const fitAll = (map, L) => {
    if (!map || !L) return;
    const pts = [[targetLat, targetLng]];
    if (hasPoint(buyerCoords)) pts.push([buyerCoords.lat, buyerCoords.lng]);
    if (hasPoint(sellerCoords)) pts.push([sellerCoords.lat, sellerCoords.lng]);
    if (pts.length > 1) {
      try {
        map.fitBounds(L.latLngBounds(pts), { padding: [45, 45], maxZoom: 18 });
      } catch (_) {}
    } else {
      map.setView([targetLat, targetLng], 17);
    }
  };

  // ซิงก์ marker/วงทั้งหมดให้ตรงกับพิกัดล่าสุด (ใช้ทั้งแผนที่เล็กและเต็มจอ)
  const syncLayers = (map, L, store) => {
    if (!map || !L) return;

    store.target?.setLatLng([targetLat, targetLng]);
    store.circle?.setLatLng([targetLat, targetLng]);

    const people = [
      { key: 'buyer', coords: buyerCoords, color: '#2563eb', label: buyerLabel, offset: -135 },
      { key: 'seller', coords: sellerCoords, color: '#16a34a', label: sellerLabel, offset: -100 },
    ];
    for (const p of people) {
      if (hasPoint(p.coords)) {
        const ll = [p.coords.lat, p.coords.lng];
        if (!store[p.key]) {
          const mk = L.marker(ll, { icon: createMarkerIcon(L, p.color, p.label, p.offset), zIndexOffset: 1000 }).addTo(map);
          mk._label = p.label;
          store[p.key] = mk;
        } else {
          store[p.key].setLatLng(ll);
          if (store[p.key]._label !== p.label) {
            store[p.key].setIcon(createMarkerIcon(L, p.color, p.label, p.offset));
            store[p.key]._label = p.label;
          }
        }
      } else if (store[p.key]) {
        map.removeLayer(store[p.key]);
        delete store[p.key];
      }
    }
  };

  const addBaseLayers = (map, L, store) => {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    // 🟢 วงสีเขียว รัศมี 50 เมตร รอบจุดนัดรับ (พื้นที่เช็คอิน)
    const circle = L.circle([targetLat, targetLng], {
      radius: CHECKIN_RADIUS_M,
      color: '#16a34a',
      fillColor: '#22c55e',
      fillOpacity: 0.18,
      weight: 2,
      dashArray: '6, 6',
    }).addTo(map);
    circle.bindPopup(`พื้นที่เช็คอิน (รัศมี ${CHECKIN_RADIUS_M} เมตร รอบจุดนัดรับ)`);

    const targetIcon = createMarkerIcon(L, '#f97316', meetup.locationName || 'จุดนัดรับ');
    const targetMarker = L.marker([targetLat, targetLng], { icon: targetIcon }).addTo(map);

    store.target = targetMarker;
    store.circle = circle;
  };

  // 1. สร้างแผนที่เล็ก
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || !meetup) return;

    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      link.setAttribute('data-leaflet', '1');
      document.head.appendChild(link);
    }

    import('leaflet').then((mod) => {
      if (mapInstanceRef.current || !mapRef.current) return;
      const L = mod.default ?? mod;
      leafletRef.current = L;

      const map = L.map(mapRef.current, {
        center: [targetLat, targetLng],
        zoom: 17,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        attributionControl: false,
      });

      miniMarkersRef.current = {};
      addBaseLayers(map, L, miniMarkersRef.current);
      syncLayers(map, L, miniMarkersRef.current);

      mapInstanceRef.current = map;
      setMapReady((v) => v + 1);
      fitAll(map, L);

      setTimeout(() => map?.invalidateSize(), 200);
      setTimeout(() => map?.invalidateSize(), 600);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        miniMarkersRef.current = {};
      }
    };
  }, [meetup?.locationId, meetup?.locationLat, meetup?.locationLng, targetLat, targetLng]);

  // อัปเดตตำแหน่งแบบเรียลไทม์ทุกครั้งที่พิกัดเปลี่ยน
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;
    syncLayers(map, L, miniMarkersRef.current);
    // ครั้งแรกที่ได้ตำแหน่งตัวเอง ให้ปรับมุมมองครอบคลุมทุกจุดหนึ่งครั้ง
    if (!firstFitRef.current && hasPoint(myCoords)) {
      firstFitRef.current = true;
      fitAll(map, L);
    }
  }, [mapReady, myCoords?.lat, myCoords?.lng, myCoords?.accuracy, peerCoords?.lat, peerCoords?.lng, buyerLabel, sellerLabel, targetLat, targetLng]);

  // 2. แผนที่เต็มจอ
  useEffect(() => {
    if (!isFullscreen || !fullMapRef.current || fullMapInstanceRef.current) return;

    import('leaflet').then((mod) => {
      if (fullMapInstanceRef.current || !fullMapRef.current) return;
      const L = mod.default ?? mod;
      fullLeafletRef.current = L;

      const map = L.map(fullMapRef.current, {
        center: [targetLat, targetLng],
        zoom: 17,
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        attributionControl: false,
      });

      fullMarkersRef.current = {};
      addBaseLayers(map, L, fullMarkersRef.current);
      syncLayers(map, L, fullMarkersRef.current);

      fullMapInstanceRef.current = map;
      setFullMapReady((v) => v + 1);
      fitAll(map, L);

      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      if (fullMapInstanceRef.current) {
        fullMapInstanceRef.current.remove();
        fullMapInstanceRef.current = null;
        fullMarkersRef.current = {};
      }
    };
  }, [isFullscreen, targetLat, targetLng, meetup?.locationName]);

  useEffect(() => {
    const map = fullMapInstanceRef.current;
    const L = fullLeafletRef.current;
    if (!map || !L) return;
    syncLayers(map, L, fullMarkersRef.current);
  }, [fullMapReady, myCoords?.lat, myCoords?.lng, myCoords?.accuracy, peerCoords?.lat, peerCoords?.lng, buyerLabel, sellerLabel, targetLat, targetLng]);

  return (
    <>
      <div className="relative group rounded-2xl overflow-hidden border border-gray-200 shadow-2xs z-0 isolate">
        <div ref={mapRef} style={{ height: 'clamp(210px, 58vw, 250px)', width: '100%', maxWidth: '100%', cursor: 'grab' }} />

        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (mapInstanceRef.current) {
                mapInstanceRef.current.setView([targetLat, targetLng], 17);
              }
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/95 text-ink-800 shadow-md backdrop-blur-xs hover:bg-orange-50 hover:text-[#f95721] text-xs font-bold transition-all border border-gray-100"
            title={`ซูมไปยังจุดนัดรับและวงกลม ${CHECKIN_RADIUS_M} เมตร`}
          >
            <Target size={13} className="text-orange-500" /> จุดนัดรับ ({CHECKIN_RADIUS_M}ม.)
          </button>
          {(hasPoint(buyerCoords) || hasPoint(sellerCoords)) && (
            <button
              type="button"
              onClick={() => fitAll(mapInstanceRef.current, leafletRef.current)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/95 text-blue-700 shadow-md backdrop-blur-xs hover:bg-blue-50 text-xs font-bold transition-all border border-gray-100"
              title="ขยายมุมมองให้เห็นทุกจุดบนแผนที่"
            >
              <MapPin size={13} /> ดูภาพรวม
            </button>
          )}
        </div>

        <div className="absolute top-2.5 right-2.5 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/95 text-ink-800 shadow-md backdrop-blur-xs hover:bg-orange-50 hover:text-[#f95721] text-xs font-bold transition-all border border-gray-100"
            title="กดขยายดูเต็มจอ"
          >
            <Maximize2 size={14} className="text-[#f95721]" />
            <span className="hidden sm:inline">ขยายเต็มจอ</span>
          </button>
        </div>

        <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center justify-between gap-1.5 bg-white/90 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-gray-100 text-[10px] font-semibold text-ink-700 shadow-xs pointer-events-none">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full border border-green-600 bg-green-400/40 inline-block" /> วงกลมเขียว {CHECKIN_RADIUS_M}ม. (จุดเช็คอิน)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> จุดนัดรับ
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> จุดผู้ซื้อ
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" /> จุดผู้ขาย
            </span>
          </div>
          <span className="text-gray-400 hidden sm:inline">แตะ/ลากได้</span>
        </div>
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-white animate-in fade-in duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white/95 backdrop-blur-md shadow-xs z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-[#f95721] shrink-0">
                <MapPin size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-ink-900 truncate">
                  {meetup.locationName || 'จุดนัดรับ มทร.อีสาน'}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full border border-green-600 bg-green-400/40 inline-block" /> วงกลม {CHECKIN_RADIUS_M} ม. (พื้นที่เช็คอิน)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> จุดนัดรับ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" /> ผู้ซื้อ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> ผู้ขาย
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (fullMapInstanceRef.current) {
                    fullMapInstanceRef.current.setView([targetLat, targetLng], 17);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-ink-700 hover:bg-gray-50 transition-colors"
              >
                <Target size={13} className="text-orange-500" /> จุดนัดรับ ({CHECKIN_RADIUS_M}ม.)
              </button>
              {(hasPoint(buyerCoords) || hasPoint(sellerCoords)) && (
                <button
                  type="button"
                  onClick={() => fitAll(fullMapInstanceRef.current, fullLeafletRef.current)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-colors"
                >
                  <MapPin size={13} /> ดูภาพรวม
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-ink-700 hover:bg-gray-200 transition-colors font-bold"
                aria-label="ปิดโหมดเต็มจอ"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="relative flex-1 w-full h-full bg-gray-100">
            <div ref={fullMapRef} className="w-full h-full" style={{ cursor: 'grab' }} />

            <div className="absolute bottom-5 inset-x-4 z-[400] flex justify-center pointer-events-none">
              <div className="bg-white/95 backdrop-blur-md border border-gray-200 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-auto">
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-orange-500 ring-4 ring-orange-100 inline-block" />
                  <span className="text-xs font-bold text-ink-900">{meetup.locationName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(false)}
                  className="px-3 py-1 bg-[#f95721] text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition-colors"
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ────────────────────────────────
// Card แสดงระยะห่างเรียลไทม์
// ────────────────────────────────
function DistanceCard({ label, distanceMeters, isMe, checkedInAt, accuracy }) {
  const color = isMe ? '#2563eb' : '#16a34a';
  const dotColor = isMe ? 'bg-blue-500' : 'bg-emerald-500';

  let distLabel = '—';
  let distColor = '#6b7280';
  if (distanceMeters !== null) {
    if (distanceMeters <= CHECKIN_RADIUS_M) {
      distLabel = `${distanceMeters} ม. (ในพื้นที่)`;
      distColor = '#16a34a';
    } else if (distanceMeters <= CHECKIN_RADIUS_M * 3) {
      distLabel = `${distanceMeters} ม. (ใกล้ถึงแล้ว)`;
      distColor = '#d97706';
    } else {
      distLabel = `${distanceMeters} ม.`;
      distColor = '#dc2626';
    }
  }

  const accOk = Number.isFinite(accuracy) && accuracy <= CHECKIN_MAX_ACCURACY_M;

  return (
    <div style={{
      background: '#f8fafc',
      border: `1.5px solid ${color}22`,
      borderRadius: 14,
      padding: '10px 14px',
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span className={`w-2 h-2 rounded-full inline-block ${dotColor}`} />
        <span style={{ fontSize: 11, fontWeight: 700, color: color }}>{label}</span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: distColor }}>
        {distanceMeters !== null ? distLabel : <span style={{ color: '#9ca3af', fontWeight: 400, fontSize: 11 }}>รอสัญญาณ GPS…</span>}
      </div>
      {isMe && Number.isFinite(accuracy) && (
        <div style={{ marginTop: 2, fontSize: 10, color: accOk ? '#16a34a' : '#d97706' }}>
          ความแม่นยำ ±{Math.round(accuracy)} ม. {accOk ? '' : '(ยังไม่แม่นพอสำหรับเช็คอิน)'}
        </div>
      )}
      {checkedInAt && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} />
          เช็คอิน {formatTime(checkedInAt)} น.
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────
// Main Page
// ────────────────────────────────
export function MeetupCheckInPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const cancelRequest = useMeetupStore((s) => s.cancelRequest);
  const hydrateMeetup = useMeetupStore((s) => s.hydrateMeetup);

  const [meetup, setMeetup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [serverPenalty, setServerPenalty] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [, forceTick] = useState(0);
  const checkInInFlightRef = useRef(false);
  const pollingInFlightRef = useRef(false);
  const feedbackTimerRef = useRef(null);

  // ── GPS & ระยะห่าง ──
  const [myDistance, setMyDistance] = useState(null);
  const [peerDistance, setPeerDistance] = useState(null);
  const [myCoords, setMyCoords] = useState(null);     // { lat, lng, accuracy }
  const [peerCoords, setPeerCoords] = useState(null); // { lat, lng, accuracy }
  const [gpsActive, setGpsActive] = useState(false);
  const watchIdRef = useRef(null);

  const myId = user?.id ?? 'me';

  const meetupRef = useRef(null);
  meetupRef.current = meetup;

  // พิกัดจุดนัดรับ (ใช้ DB ก่อน)
  const targetPoint = (() => {
    if (meetup?.locationLat != null && meetup?.locationLng != null) {
      return { lat: meetup.locationLat, lng: meetup.locationLng };
    }
    const found = meetupPoints.find((p) => p.id === meetup?.locationId);
    if (found) return { lat: found.lat, lng: found.lng };
    return { lat: CAMPUS_CENTER.lat, lng: CAMPUS_CENTER.lng };
  })();
  const targetRef = useRef(targetPoint);
  targetRef.current = targetPoint;

  const showFeedback = useCallback((type, title, message) => {
    setFeedback({ type, title, message });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), type === 'success' ? 4500 : 7000);
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);

  // Tick ทุก 30 วิ
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await api.getMyMeetups();
      const found = (res.meetups || []).find((m) => String(m.id) === String(id));
      if (!found) { setNotFound(true); setMeetup(null); return; }
      const mapped = mapAppointment(found);
      const hydrated = hydrateMeetup(mapped);
      setMeetup({ ...(hydrated || {}), ...mapped });
    } catch (err) {
      console.warn('Failed to load meetup detail:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // ── GPS: เริ่ม/หยุด ──
  const clearGpsWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (gpsIntervalRef.current !== null) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
  }, []);

  const gpsStorageKey = id && myId ? `cm_gps_active_${id}_${myId}` : null;
  const myCoordsRef = useRef(null);
  const gpsIntervalRef = useRef(null);

  const stopGps = useCallback(() => {
    clearGpsWatch();
    setGpsActive(false);
    setMyCoords(null);
    myCoordsRef.current = null;
    setMyDistance(null);
    if (gpsStorageKey) {
      try { localStorage.setItem(gpsStorageKey, 'false'); } catch (_) {}
    }
    if (id && myId) {
      stopLiveLocation({ meetupId: id, userId: myId });
    }
  }, [clearGpsWatch, gpsStorageKey, id, myId]);

  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      showFeedback('warning', 'อุปกรณ์ไม่รองรับ GPS', 'กรุณาเปิดตำแหน่งที่ตั้งบนอุปกรณ์แล้วลองอีกครั้ง');
      return;
    }
    if (watchIdRef.current !== null) return;
    setGpsActive(true);
    if (gpsStorageKey) {
      try { localStorage.setItem(gpsStorageKey, 'true'); } catch (_) {}
    }
    const sendPos = (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const prev = myCoordsRef.current;
      // กันตำแหน่งจาก Wi-Fi/IP ที่คลาดเคลื่อนมากมาทับพิกัด GPS ที่แม่นยำกว่า (ภายใน 30 วินาทีล่าสุด)
      if (
        prev &&
        Number.isFinite(prev.accuracy) &&
        Number.isFinite(accuracy) &&
        prev.accuracy <= 15 &&
        accuracy > CHECKIN_MAX_ACCURACY_M &&
        Date.now() - (prev.updatedAt || 0) < 30000
      ) {
        return;
      }
      const coordsObj = { lat: latitude, lng: longitude, accuracy, updatedAt: Date.now() };
      setMyCoords(coordsObj);
      myCoordsRef.current = coordsObj;
      const m = meetupRef.current;
      emitLiveLocation({
        meetupId: id,
        userId: myId,
        userName: user?.username || user?.display_name || 'ผู้ใช้',
        role: m && String(m.buyerId) === String(myId) ? 'buyer' : 'seller',
        lat: latitude,
        lng: longitude,
        accuracy,
        targetPoint: { lat: targetRef.current.lat, lng: targetRef.current.lng },
      });
    };
    watchIdRef.current = navigator.geolocation.watchPosition(
      sendPos,
      (err) => {
        console.warn('GPS error:', err.message);
        if (err.code === 1) {
          clearGpsWatch();
          setGpsActive(false);
          if (gpsStorageKey) {
            try { localStorage.setItem(gpsStorageKey, 'false'); } catch (_) {}
          }
          showFeedback('warning', 'ไม่ได้รับอนุญาตใช้ตำแหน่ง', 'กรุณาอนุญาตให้เว็บไซต์เข้าถึงตำแหน่ง แล้วกดเปิด GPS ใหม่');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    // จับตำแหน่งซ้ำทุกๆ 10 วินาที เพื่ออัปเดตพิกัดให้แม่นยำที่สุดอย่างต่อเนื่อง
    if (gpsIntervalRef.current !== null) clearInterval(gpsIntervalRef.current);
    gpsIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        sendPos,
        () => {},
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
      );
    }, 10000);
  }, [id, myId, user, showFeedback, clearGpsWatch, gpsStorageKey]);

  // คืนค่าสถานะการเปิด-ปิด GPS เดิมหลังรีเฟรชหน้า
  useEffect(() => {
    if (!gpsStorageKey) return;
    try {
      if (localStorage.getItem(gpsStorageKey) === 'true') {
        startGps();
      }
    } catch (_) {}
  }, [gpsStorageKey, startGps]);

  // ปิด GPS watcher และตัวจับทุก 10 วินาทีเมื่อออกจากหน้า
  useEffect(() => () => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (gpsIntervalRef.current !== null) {
      clearInterval(gpsIntervalRef.current);
      gpsIntervalRef.current = null;
    }
  }, []);

  // ── คำนวณระยะห่างใหม่ทุกครั้งที่พิกัดหรือจุดนัดเปลี่ยน ──
  useEffect(() => {
    if (myCoords) {
      setMyDistance(Math.round(haversineDistanceMeters(myCoords.lat, myCoords.lng, targetPoint.lat, targetPoint.lng)));
    } else {
      setMyDistance(null);
    }
  }, [myCoords, targetPoint.lat, targetPoint.lng]);

  useEffect(() => {
    if (peerCoords) {
      setPeerDistance(Math.round(haversineDistanceMeters(peerCoords.lat, peerCoords.lng, targetPoint.lat, targetPoint.lng)));
    } else {
      setPeerDistance(null);
    }
  }, [peerCoords, targetPoint.lat, targetPoint.lng]);

  // ── Socket: รับพิกัดอีกฝ่าย + สถานะเช็คอิน (ไม่เกี่ยวกับ GPS ของเรา) ──
  useEffect(() => {
    if (!id || !myId) return;
    const socket = getSocket();
    joinMeetupTracking({ meetupId: id, userId: myId });

    const handleLocationUpdate = (data) => {
      if (!data || String(data.userId) === String(myId)) return;
      const lat = Number(data.lat);
      const lng = Number(data.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        setPeerCoords({ lat, lng, accuracy: Number.isFinite(Number(data.accuracy)) ? Number(data.accuracy) : undefined });
      }
    };

    const handleCurrentLocations = (locsMap) => {
      if (!locsMap || typeof locsMap !== 'object') return;
      const peerEntry = Object.values(locsMap).find((loc) => loc && String(loc.userId) !== String(myId));
      if (peerEntry) {
        const lat = Number(peerEntry.lat);
        const lng = Number(peerEntry.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          setPeerCoords({ lat, lng, accuracy: Number.isFinite(Number(peerEntry.accuracy)) ? Number(peerEntry.accuracy) : undefined });
        }
      } else {
        setPeerCoords(null);
      }
    };

    const handlePeerStopped = (data) => {
      if (!data || String(data.userId) === String(myId)) return;
      setPeerCoords(null);
      setPeerDistance(null);
    };

    const handleReauthenticated = () => {
      joinMeetupTracking({ meetupId: id, userId: myId });
      if (myCoordsRef.current) {
        const m = meetupRef.current;
        emitLiveLocation({
          meetupId: id,
          userId: myId,
          userName: user?.username || user?.display_name || 'ผู้ใช้',
          role: m && String(m.buyerId) === String(myId) ? 'buyer' : 'seller',
          lat: myCoordsRef.current.lat,
          lng: myCoordsRef.current.lng,
          accuracy: myCoordsRef.current.accuracy,
          targetPoint: { lat: targetRef.current.lat, lng: targetRef.current.lng },
        });
      }
    };

    const handlePeerCheckIn = (data) => {
      console.log('📍 [CheckInPage] Peer check-in event received:', data);
      setMeetup((prev) => {
        if (!prev) return prev;
        const roleToCheck = data.role || data.checkedInRole;
        const at = data.checkedInAt || new Date().toISOString();
        return {
          ...prev,
          buyerCheckedIn: roleToCheck === 'buyer' ? true : (data.buyerCheckedIn ?? prev.buyerCheckedIn),
          sellerCheckedIn: roleToCheck === 'seller' ? true : (data.sellerCheckedIn ?? prev.sellerCheckedIn),
          buyerCheckedInAt: roleToCheck === 'buyer' ? at : (data.buyerCheckedInAt ?? prev.buyerCheckedInAt),
          sellerCheckedInAt: roleToCheck === 'seller' ? at : (data.sellerCheckedInAt ?? prev.sellerCheckedInAt),
        };
      });
    };

    socket?.on('live_location_update', handleLocationUpdate);
    socket?.on('meetup_current_locations', handleCurrentLocations);
    socket?.on('user_stopped_sharing_location', handlePeerStopped);
    socket?.on('authenticated', handleReauthenticated);
    socket?.on('peer_checked_in', handlePeerCheckIn);
    socket?.on('meetup_status_update', handlePeerCheckIn);
    socket?.on('meetup_updated', handlePeerCheckIn);
    return () => {
      socket?.off('live_location_update', handleLocationUpdate);
      socket?.off('meetup_current_locations', handleCurrentLocations);
      socket?.off('user_stopped_sharing_location', handlePeerStopped);
      socket?.off('authenticated', handleReauthenticated);
      socket?.off('peer_checked_in', handlePeerCheckIn);
      socket?.off('meetup_status_update', handlePeerCheckIn);
      socket?.off('meetup_updated', handlePeerCheckIn);
      leaveMeetupTracking({ meetupId: id, userId: myId });
    };
  }, [id, myId]);

  // ── Auto-poll ทุก 15 วินาที ──
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const res = await api.getMyMeetups();
        const found = (res.meetups || []).find((m) => String(m.id) === String(id));
        if (found) {
          const mapped = mapAppointment(found);
          setMeetup((prev) => {
            if (!prev) return mapped;
            if (
              mapped.buyerCheckedIn !== prev.buyerCheckedIn ||
              mapped.sellerCheckedIn !== prev.sellerCheckedIn ||
              mapped.buyerConfirmedDelivery !== prev.buyerConfirmedDelivery ||
              mapped.sellerConfirmedDelivery !== prev.sellerConfirmedDelivery ||
              mapped.status !== prev.status ||
              mapped.confirmedAt !== prev.confirmedAt
            ) {
              return { ...prev, ...mapped };
            }
            return prev;
          });
        }
      } catch (e) {
        // Silent background polling
      } finally {
        pollingInFlightRef.current = false;
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [id]);

  // ── Loading / Not found ──
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl pt-2 sm:pt-4">
        <div className="cm-card h-72 animate-pulse bg-surface-muted" />
      </div>
    );
  }

  if (notFound || !meetup) {
    return (
      <div className="py-16 text-center text-ink-500">
        ไม่พบนัดรับสินค้านี้ — อาจถูกยกเลิกไปแล้ว หรือคุณไม่มีสิทธิ์เข้าถึง
        <div className="mt-3">
          <Link to="/meetups" className="font-semibold text-brand-600">กลับไปหน้านัดรับสินค้า</Link>
        </div>
      </div>
    );
  }

  const role = String(meetup.buyerId) === String(myId) ? 'buyer' : 'seller';
  const otherName = role === 'buyer' ? meetup.sellerName : meetup.buyerName;
  const myName = role === 'buyer' ? meetup.buyerName : meetup.sellerName;
  const checkInWindow = getCheckInWindow(meetup);
  const checkInDeadline = (() => {
    if (checkInWindow?.normalUntil) {
      return formatTime(checkInWindow.normalUntil);
    }
    if (meetup?.time) {
      const [h, m] = meetup.time.split(':').map(Number);
      const totalMinutes = (h || 0) * 60 + (m || 0) + 45;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endM = totalMinutes % 60;
      return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }
    return null;
  })();
  const myCheckedIn = role === 'buyer' ? meetup.buyerCheckedIn : meetup.sellerCheckedIn;
  const myCheckedInAt = role === 'buyer' ? meetup.buyerCheckedInAt : meetup.sellerCheckedInAt;
  const otherCheckedIn = role === 'buyer' ? meetup.sellerCheckedIn : meetup.buyerCheckedIn;
  const otherCheckedInAt = role === 'buyer' ? meetup.sellerCheckedInAt : meetup.buyerCheckedInAt;
  const bothCheckedIn = !!meetup.buyerCheckedIn && !!meetup.sellerCheckedIn;

  // FIX: ใช้เฉพาะค่าที่มาจากธุรกรรมจริง (buyer_received / seller_handed_over)
  const myConfirmedDelivery = role === 'buyer'
    ? Boolean(meetup.buyerConfirmedDelivery)
    : Boolean(meetup.sellerConfirmedDelivery);

  const userReviewFromDb = Array.isArray(meetup.reviews)
    ? meetup.reviews.find((r) => String(r.reviewer_id) === String(myId))
    : null;
  const myReview =
    (role === 'buyer' ? meetup.buyerReview : meetup.sellerReview) ||
    meetup.myReview ||
    userReviewFromDb;

  const meetupAccepted = isMeetupAccepted(meetup);

  const cancelPenalty = serverPenalty || getLateCancelPenalty(meetup, myCheckedIn);

  // ── เช็คอิน ──
  const handleCheckIn = async () => {
    if (checkInInFlightRef.current) return;
    checkInInFlightRef.current = true;
    setCheckingIn(true);
    try {
      // อ่านตำแหน่งสดที่แม่นที่สุด (สูงสุด 8 วินาที) พร้อม fallback ไปยังพิกัด GPS ล่าสุดที่หน้าเว็บอ่านไว้ได้แล้ว
      const pos = await getBestPosition({
        maxWaitMs: 8000,
        goodAccuracy: 5,
        fallbackCoords: myCoordsRef.current,
      });
      const coordinates = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lng)) {
        throw new Error('อ่านพิกัด GPS ไม่สำเร็จ กรุณาลองใหม่');
      }
      const dist = Math.round(
        haversineDistanceMeters(coordinates.lat, coordinates.lng, targetPoint.lat, targetPoint.lng)
      );
      if (dist > CHECKIN_RADIUS_M) {
        throw new Error(
          `คุณอยู่ไกลจากจุดนัดรับ ${dist.toLocaleString()} เมตร (ต้องอยู่ภายใน ${CHECKIN_RADIUS_M} เมตร) จึงเช็คอินไม่ได้`
        );
      }
      if (Number.isFinite(coordinates.accuracy) && coordinates.accuracy > CHECKIN_MAX_ACCURACY_M) {
        throw new Error(`สัญญาณ GPS ยังไม่แม่นพอ (คลาดเคลื่อน ±${Math.round(coordinates.accuracy)} ม. ต้องไม่เกิน ${CHECKIN_MAX_ACCURACY_M} ม.) กรุณาออกที่โล่ง เปิด GPS แบบความแม่นยำสูง แล้วลองใหม่`);
      }

      const result = await api.checkInMeetup(meetup.id, coordinates);
      const checkInData = result.checkInData || {};
      const checkedInAt = role === 'buyer'
        ? checkInData.buyerCheckedInAt
        : checkInData.sellerCheckedInAt;
      const nextMeetup = {
        ...meetup,
        ...checkInData,
        id: meetup.id,
        buyerCheckedIn: checkInData.buyerCheckedIn ?? (role === 'buyer' || meetup.buyerCheckedIn),
        sellerCheckedIn: checkInData.sellerCheckedIn ?? (role === 'seller' || meetup.sellerCheckedIn),
        buyerCheckedInAt: checkInData.buyerCheckedInAt || (role === 'buyer' ? new Date().toISOString() : meetup.buyerCheckedInAt),
        sellerCheckedInAt: checkInData.sellerCheckedInAt || (role === 'seller' ? new Date().toISOString() : meetup.sellerCheckedInAt),
      };
      hydrateMeetup(nextMeetup);
      setMeetup(nextMeetup);

      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('meetup_checkin', {
          meetupId: meetup.id,
          userId: myId,
          role,
          checkedInAt: checkedInAt || new Date().toISOString(),
        });
      }
      showFeedback('success', 'เช็คอินสำเร็จ', 'บันทึกเวลาและตำแหน่งของคุณแล้ว');
    } catch (err) {
      const geoMessage = err?.code === 1
        ? 'กรุณาอนุญาตให้เว็บไซต์เข้าถึงตำแหน่ง แล้วลองเช็คอินอีกครั้ง'
        : err?.code === 2
          ? 'อุปกรณ์หาตำแหน่ง GPS ไม่พบ กรุณาเปิด GPS แล้วลองอีกครั้ง'
          : err?.code === 3
            ? 'ค้นหาตำแหน่งใช้เวลานานเกินไป กรุณาเปิด GPS แล้วลองอีกครั้ง'
            : null;
      const message = geoMessage || err?.message || 'เกิดข้อผิดพลาดในการเช็คอิน กรุณาลองอีกครั้ง';
      const distance = message.match(/([\d,]+)\s*เมตร/);
      if (message.includes(`${CHECKIN_RADIUS_M} เมตร`) || message.includes('TOO_FAR') || distance) {
        showFeedback(
          'warning',
          'คุณยังอยู่นอกระยะเช็คอิน',
          `${distance ? `ตอนนี้อยู่ห่างประมาณ ${distance[1]} เมตร ` : ''}กรุณาเข้าใกล้จุดนัดรับให้อยู่ภายใน ${CHECKIN_RADIUS_M} เมตร แล้วลองเช็คอินอีกครั้ง`
        );
      } else if (message.includes('ยังไม่แม่นพอ')) {
        showFeedback('warning', 'สัญญาณ GPS ยังไม่แม่นพอ', message);
      } else if (/location|position|gps|พิกัด|ตำแหน่ง/i.test(message)) {
        showFeedback('warning', 'อ่านตำแหน่งไม่สำเร็จ', message);
      } else {
        showFeedback('error', 'เช็คอินไม่สำเร็จ', message);
      }
    } finally {
      checkInInFlightRef.current = false;
      setCheckingIn(false);
    }
  };

  // ── ยืนยันส่งมอบ (ผ่าน ConfirmDialog) ──
  const executeConfirmDelivery = async () => {
    setCompleting(true);
    try {
      const result = await api.completeMeetup(meetup.id);
      const isBuyer = role === 'buyer';
      if (isBuyer) {
        useMeetupStore.getState().markDelivered(meetup.id, 'buyer');
      } else {
        useMeetupStore.getState().markDelivered(meetup.id, 'seller');
      }

      setMeetup((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          buyerReceived: isBuyer ? true : prev.buyerReceived,
          sellerHandedOver: !isBuyer ? true : prev.sellerHandedOver,
          buyerConfirmedDelivery: isBuyer ? true : prev.buyerConfirmedDelivery,
          sellerConfirmedDelivery: !isBuyer ? true : prev.sellerConfirmedDelivery,
          status: result?.bothConfirmed ? 'completed' : prev.status,
          statusCode: result?.bothConfirmed ? 'COMPLETED' : prev.statusCode,
        };
      });

      setShowDeliveryConfirm(false);
      showFeedback('success', 'ยืนยันสำเร็จแล้ว!', 'จบงานของคุณแล้ว คุณสามารถให้คะแนนรีวิวเพื่อรับคะแนนความสำเร็จได้ทันที (หรือข้ามได้)');
      setShowReviewModal(true);
    } catch (err) {
      showFeedback('warning', 'ยังยืนยันส่งมอบไม่ได้', err.message || 'เกิดข้อผิดพลาดในการยืนยันรับสินค้า');
    } finally {
      setCompleting(false);
    }
  };

  // ── บันทึกรีวิวหลังส่งมอบ ──
  const handleReviewSubmit = async ({ rating, comment, images = [] }) => {
    const isBuyer = role === 'buyer';
    const targetUserId = isBuyer ? meetup.sellerId : meetup.buyerId;

    if (meetup.transactionId) {
      try {
        await api.createReview({ transactionId: meetup.transactionId, revieweeId: targetUserId, rating, comment, images });
        try {
          await useAuthStore.getState().verifyToken();
        } catch (_) {}
      } catch (err) {
        showFeedback('warning', 'ส่งรีวิวไม่สำเร็จ', err.message || 'ไม่สามารถส่งรีวิวได้');
        return;
      }
    }

    useMeetupStore.getState().submitReview(meetup.id, role, { rating, comment, images });
    setMeetup((prev) => {
      if (!prev) return null;
      const newRev = { reviewer_id: myId, reviewee_id: targetUserId, rating, comment, images };
      return {
        ...prev,
        reviews: [...(prev.reviews || []), newRev],
        buyerReview: isBuyer ? newRev : prev.buyerReview,
        sellerReview: !isBuyer ? newRev : prev.sellerReview,
      };
    });

    setShowReviewModal(false);
    showFeedback('success', 'ส่งรีวิวสำเร็จ', 'คุณได้รับคะแนนความสำเร็จและคะแนนความน่าเชื่อถือเรียบร้อยแล้ว กำลังพากลับหน้าปิดการขาย...');
    setTimeout(() => {
      navigate('/meetups?tab=completed', { replace: true });
    }, 800);
  };

  const openCancelDialog = () => {
    setServerPenalty(null);
    setShowCancelConfirm(true);
  };

  const closeCancelDialog = () => {
    setShowCancelConfirm(false);
    setServerPenalty(null);
  };

  const executeCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelMeetup(meetup.id, undefined, { confirmPenalty: !!cancelPenalty });
      try {
        cancelRequest(meetup.id);
      } catch (e) {}

      try {
        await useAuthStore.getState().verifyToken();
      } catch (e) {}

      closeCancelDialog();
      navigate('/meetups');
    } catch (err) {
      if (err?.status === 409 && err?.data?.requiresConfirm) {
        setServerPenalty(normalizeServerPenalty(err.data, meetup));
        return;
      }
      showFeedback('error', 'ยกเลิกนัดไม่สำเร็จ', err?.message || 'เกิดข้อผิดพลาดในการยกเลิกนัด');
      closeCancelDialog();
    } finally {
      setCancelling(false);
    }
  };

  const isNoShow = meetup.status === 'no_show';
  const canCancel = ['pending', 'confirmed'].includes(meetup.status) && !bothCheckedIn && !isNoShow;

  return (
    <div className="mx-auto max-w-2xl">

      {feedback && (
        <div className="fixed inset-x-4 top-4 z-[100] mx-auto max-w-lg animate-in fade-in slide-in-from-top-2 duration-200" role={feedback.type === 'success' ? 'status' : 'alert'}>
          <div className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-white/95 text-emerald-900'
              : feedback.type === 'warning'
                ? 'border-amber-200 bg-white/95 text-amber-950'
                : 'border-rose-200 bg-white/95 text-rose-950'
          }`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              feedback.type === 'success' ? 'bg-emerald-100 text-emerald-600' : feedback.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'
            }`}>
              {feedback.type === 'success' ? <CheckCircle2 size={20} /> : feedback.type === 'warning' ? <MapPin size={20} /> : <AlertTriangle size={20} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">{feedback.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-600">{feedback.message}</p>
            </div>
            <button type="button" onClick={() => setFeedback(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="ปิดข้อความแจ้งเตือน">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/meetups')}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs shrink-0"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          {meetup.productImage ? (
            <img
              src={meetup.productImage}
              alt={meetup.productTitle}
              className="w-12 h-12 rounded-xl object-cover border border-gray-200 shadow-2xs shrink-0 bg-gray-50"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200/60 flex items-center justify-center shrink-0 text-orange-400">
              <ShoppingBag size={22} />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-ink-900 flex items-center gap-2">
              <MapPin size={20} className="text-brand-500 shrink-0" />
              เช็คอิน &amp; ยืนยันรับสินค้า
            </h1>
            <p className="text-xs text-ink-500 truncate">{meetup.productTitle} · {role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'}: <span className="font-semibold text-ink-700">{otherName}</span></p>
          </div>
        </div>
      </div>

      {/* ── ขั้นตอนการนัดรับสินค้า ── */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '12px 16px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 10, letterSpacing: 1 }}>ขั้นตอนการนัดรับสินค้า</p>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {[
            { label: 'รอดำเนินการ', done: true },
            { label: 'นัดหมายแล้ว', done: ['confirmed','completed'].includes(meetup.status), active: meetup.status === 'confirmed' && !bothCheckedIn },
            { label: 'เช็คอิน', done: bothCheckedIn || meetup.status === 'completed', active: meetup.status === 'confirmed' && !bothCheckedIn },
            { label: 'เสร็จสิ้น', done: meetup.status === 'completed', active: meetup.status === 'completed' },
          ].map((step, idx, arr) => (
            <React.Fragment key={step.label}>
              <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 56 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: step.done ? '#16a34a' : step.active ? '#f97316' : '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: (step.done || step.active) ? '#fff' : '#9ca3af',
                  boxShadow: step.active ? '0 0 0 3px #fed7aa' : 'none',
                }}>
                  {step.done ? <Check size={14} strokeWidth={2.5} /> : idx + 1}
                </div>
                <span style={{ fontSize: 10, fontWeight: step.active || step.done ? 700 : 400, color: step.done ? '#16a34a' : step.active ? '#f97316' : '#9ca3af', textAlign: 'center', lineHeight: 1.2 }}>
                  {step.label}
                </span>
              </div>
              {idx < arr.length - 1 && (
                <div style={{ flex: 1, height: 2, background: step.done ? '#16a34a' : '#e5e7eb', marginBottom: 18 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* แผนที่ + เวลา */}
      <div className="cm-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-1.5 text-sm text-ink-700 font-medium">
            <CalendarClock size={16} className="text-ink-500" />
            {formatDate(meetup.date)} · {meetup.startTime || meetup.time} น.
          </span>
          <CheckInWindowBadge status={checkInWindow.status} />
        </div>
        <MiniMap
          meetup={meetup}
          myCoords={myCoords}
          peerCoords={peerCoords}
          role={role}
          myName={myName}
          otherName={otherName}
        />
        <p className="mt-2 flex items-center gap-1 text-xs text-ink-500">
          <MapPin size={13} className="text-brand-500" /> {meetup.locationName}
        </p>
        {meetup.note && (
          <p className="mt-1 rounded-lg bg-orange-50 px-2.5 py-2 text-xs leading-relaxed text-orange-900 break-words flex items-start gap-1.5">
            <Pin size={13} className="shrink-0 text-orange-600 mt-0.5" />
            <span>รายละเอียดจุดเพิ่มเติม: {meetup.note}</span>
          </p>
        )}
      </div>

      {/* ─── ระยะห่างเรียลไทม์ ─── */}
      <div className="cm-card p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
            <Radio size={15} className="text-brand-500" />
            ระยะห่างจากจุดนัดรับ (เรียลไทม์)
          </p>
          <div className="flex items-center gap-2">
            {gpsActive ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                  GPS เปิดอยู่
                </span>
                <button
                  type="button"
                  onClick={stopGps}
                  className="text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg border border-red-200 transition-colors"
                  title="ปิดการแชร์ตำแหน่ง GPS"
                >
                  ปิด GPS
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startGps}
                className="text-[11px] font-bold text-white bg-[#f95721] hover:bg-orange-600 px-3 py-1 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                title="กดเพื่อขอสิทธิ์เข้าถึงพิกัด GPS"
              >
                <Navigation size={12} />
                เปิด GPS
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <DistanceCard
            label={`คุณ (${role === 'buyer' ? 'ผู้ซื้อ' : 'ผู้ขาย'})`}
            distanceMeters={myDistance}
            isMe={true}
            checkedInAt={myCheckedInAt}
            accuracy={myCoords?.accuracy}
          />
          <DistanceCard
            label={`${otherName} (${role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'})`}
            distanceMeters={peerDistance}
            isMe={false}
            checkedInAt={otherCheckedInAt}
          />
        </div>

        <p className="mt-2 text-[10px] text-ink-400 flex items-start gap-1.5">
          <Lightbulb size={12} className="shrink-0 text-amber-500 mt-0.5" />
          <span>ระยะห่างของอีกฝ่ายจะแสดงเมื่อเขาเปิด GPS บนอุปกรณ์ของตัวเองแล้ว · ต้องอยู่ภายใน {CHECKIN_RADIUS_M} เมตร และ GPS คลาดเคลื่อนไม่เกิน {CHECKIN_MAX_ACCURACY_M} เมตรจึงเช็คอินได้ (แนะนำให้ใช้มือถือ)</span>
        </p>
      </div>

      {/* ─── สถานะเช็คอิน ─── */}
      <div className="cm-card p-4 mb-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-ink-900 flex items-center gap-1.5">
              <MapPin size={15} className="text-brand-500" /> สถานะการเช็คอินจุดนัดพบ
            </h3>
            <p className="text-[11px] text-gray-500 mt-0.5">
              ระบบตรวจสอบการเดินทางและเวลาถึงจุดนัดหมายของทั้งสองฝ่าย
            </p>
          </div>
          <CheckInWindowBadge status={checkInWindow.status} />
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-orange-50/70 border border-orange-100 px-3.5 py-2.5 text-xs">
          <Clock size={15} className="text-[#f95721] shrink-0" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-bold text-orange-950">
              เวลานัดหมาย: {meetup.startTime || meetup.time} น.
            </span>
            <span className="text-orange-400">·</span>
            <span className="font-semibold text-orange-800">
              ⏰ สามารถเช็คอินได้ถึงเวลา: <span className="underline decoration-orange-400 font-extrabold">{checkInDeadline ? `${checkInDeadline} น.` : 'สิ้นสุดวันนัดหมาย'}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* ฝั่งผู้ซื้อ */}
          <div className={`p-3.5 rounded-2xl border transition-all ${
            meetup.buyerCheckedIn
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-gray-50/60 border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                <ShoppingBag size={13} className="text-blue-600 shrink-0" />
                ฝั่งผู้ซื้อ ({meetup.buyerName || 'ผู้ซื้อ'})
                {role === 'buyer' && (
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                    คุณ
                  </span>
                )}
              </span>
              {meetup.buyerCheckedIn ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> ถึงแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-200/80 px-2 py-0.5 rounded-full">
                  <Clock size={11} /> รอเดินทาง
                </span>
              )}
            </div>

            <div className="text-xs">
              {meetup.buyerCheckedIn ? (
                <div className="space-y-0.5">
                  <p className="font-semibold text-emerald-800 inline-flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-emerald-600" /> เช็คอินถึงจุดนัดพบแล้ว
                  </p>
                  <p className="text-[11px] text-emerald-600">
                    เวลาที่เช็คอิน: {formatTime(meetup.buyerCheckedInAt)} น.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-gray-500 font-medium inline-flex items-center gap-1">
                    <Clock size={12} /> ยังไม่ได้เช็คอิน
                  </p>
                  <p className="text-[11px] text-gray-400">กรุณาไปยังจุดนัดพบเพื่อกดเช็คอิน</p>
                </div>
              )}
            </div>
          </div>

          {/* ฝั่งผู้ขาย */}
          <div className={`p-3.5 rounded-2xl border transition-all ${
            meetup.sellerCheckedIn
              ? 'bg-emerald-50/60 border-emerald-200'
              : 'bg-gray-50/60 border-gray-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-ink-800 flex items-center gap-1.5">
                <Tag size={13} className="text-emerald-600 shrink-0" />
                ฝั่งผู้ขาย ({meetup.sellerName || 'ผู้ขาย'})
                {role === 'seller' && (
                  <span className="bg-blue-100 text-blue-700 text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
                    คุณ
                  </span>
                )}
              </span>
              {meetup.sellerCheckedIn ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={12} /> ถึงแล้ว
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-200/80 px-2 py-0.5 rounded-full">
                  <Clock size={11} /> รอเดินทาง
                </span>
              )}
            </div>

            <div className="text-xs">
              {meetup.sellerCheckedIn ? (
                <div className="space-y-0.5">
                  <p className="font-semibold text-emerald-800 inline-flex items-center gap-1">
                    <CheckCircle2 size={13} className="text-emerald-600" /> เช็คอินถึงจุดนัดพบแล้ว
                  </p>
                  <p className="text-[11px] text-emerald-600">
                    เวลาที่เช็คอิน: {formatTime(meetup.sellerCheckedInAt)} น.
                  </p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-gray-500 font-medium inline-flex items-center gap-1">
                    <Clock size={12} /> ยังไม่ได้เช็คอิน
                  </p>
                  <p className="text-[11px] text-gray-400">กรุณาไปยังจุดนัดพบเพื่อกดเช็คอิน</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {isNoShow ? (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-rose-900">
              <AlertTriangle size={15} className="text-rose-600 shrink-0" /> นัดหมายนี้ถูกตัดจบเนื่องจากเลยเวลา 45 นาที (ไม่มาตามนัด)
            </p>
            <p className="text-[11px] text-rose-700">
              ระบบได้ทำการตัดจบนัดหมายและบันทึกการตัดคะแนนความน่าเชื่อถือของผู้ที่ไม่มาตามนัดเรียบร้อยแล้ว
            </p>
          </div>
        ) : myCheckedIn ? (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <div className="text-xs text-emerald-800">
              <span className="font-bold">คุณเช็คอินถึงจุดนัดพบเรียบร้อยแล้ว</span>
              <span className="ml-1 text-[11px] text-emerald-700 font-medium">
                ({formatTime(myCheckedInAt)} น.) {otherCheckedIn ? '— ตอนนี้ทั้งสองฝ่ายพร้อมพบกันแล้ว' : '— รออีกฝ่ายเดินทางมาถึง'}
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <Button
              size="sm"
              className="w-full text-white transition-all bg-emerald-600 hover:bg-emerald-700 shadow-xs py-2.5"
              onClick={handleCheckIn}
              disabled={checkingIn}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Navigation size={15} className={checkingIn ? 'animate-spin' : 'animate-pulse'} />
                {checkingIn ? 'กำลังอ่านพิกัด GPS ให้แม่นยำ...' : 'กดเช็คอินยืนยันว่าฉันถึงจุดนัดพบแล้ว'}
              </span>
            </Button>
          </div>
        )}

        {!bothCheckedIn && !isNoShow && (
          <p className="text-[11px] text-ink-400 flex items-start gap-1.5">
            <Lightbulb size={13} className="shrink-0 text-amber-500 mt-0.5" />
            <span>แนะนำให้ทั้งสองฝ่ายเช็คอินให้เรียบร้อยก่อนทำการตรวจสอบสินค้าและยืนยันรับของ</span>
          </p>
        )}
      </div>

      {/* ─── ยืนยันส่งมอบสินค้า ─── */}
      {!isNoShow && (
        <div className="cm-card p-4 space-y-3 mb-4">
          <p className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-brand-500" /> ยืนยันการส่งมอบสินค้า
          </p>

          {myConfirmedDelivery ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                <span>คุณได้ยืนยัน{role === 'buyer' ? 'รับสินค้า' : 'ส่งมอบสินค้า'}เรียบร้อยแล้ว (จบงานของคุณแล้ว)</span>
              </div>

              {myReview ? (
                <div className="flex items-center gap-2 text-xs text-ink-600 bg-surface-alt p-3 rounded-xl border border-surface-border">
                  <Star size={15} className="fill-amber-400 text-amber-500 shrink-0" />
                  <span>คุณได้ส่งรีวิวและได้รับคะแนนความสำเร็จเรียบร้อยแล้ว ({myReview.rating || 5}/5 ดาว)</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-xs text-ink-500 flex items-start gap-1.5">
                    <Lightbulb size={14} className="shrink-0 text-amber-500 mt-0.5" />
                    <span>รีวิวสามารถรีวิวหรือไม่ก็ได้ แต่ผู้ที่ส่งรีวิวจะได้รับคะแนนว่าสำเร็จและคืน Trust Score</span>
                  </p>
                  <Button
                    onClick={() => setShowReviewModal(true)}
                    className="bg-[#f95721] hover:bg-orange-600 text-white font-bold text-xs shadow-xs"
                  >
                    <span className="flex items-center gap-1.5">
                      <Star size={15} />
                      ให้คะแนนและรีวิวคู่ค้า
                    </span>
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-ink-500">
                กดปุ่มนี้เมื่อได้รับ/ส่งมอบสินค้าเรียบร้อยแล้วเท่านั้น — เมื่อกดแล้วจะถือว่าจบงานของฝ่ายคุณทันที และไม่ต้องรออีกฝ่าย
              </p>
              <Button onClick={() => setShowDeliveryConfirm(true)} disabled={completing || !bothCheckedIn}>
                <span className="flex items-center gap-1.5">
                  <PackageCheck size={16} />
                  {completing
                    ? 'กำลังยืนยัน...'
                    : !bothCheckedIn
                    ? 'รอทั้งสองฝ่ายเช็คอินก่อน'
                    : role === 'buyer'
                    ? 'ยืนยันรับสินค้าแล้ว'
                    : 'ยืนยันส่งมอบสินค้าแล้ว'}
                </span>
              </Button>
            </>
          )}
        </div>
      )}

      {/* ─── ปุ่มยกเลิกนัด ─── */}
      {canCancel && (
        <div className="cm-card p-4 space-y-3 border border-red-100">
          <p className="text-sm font-bold text-red-700 flex items-center gap-1.5">
            <XCircle size={16} className="text-red-500" /> ยกเลิกนัดรับสินค้า
          </p>
          <p className="text-xs text-ink-500">
            ถ้าไม่สะดวกตามนัดหรือต้องการเปลี่ยนวัน/เวลา ให้ยกเลิกแล้วสร้างนัดใหม่ · ยกเลิกได้เฉพาะก่อนเช็คอิน
          </p>

          {cancelPenalty ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[11px] font-semibold leading-relaxed text-amber-900">
                เหลือเวลาก่อนนัดประมาณ {cancelPenalty.minutesLeft} นาที (น้อยกว่า {formatThresholdHours(cancelPenalty.thresholdMinutes)} ชั่วโมง)
                — หากยกเลิกตอนนี้ คุณจะถูกหัก {cancelPenalty.pointsDeducted} คะแนนความน่าเชื่อถือ
              </p>
            </div>
          ) : meetupAccepted ? (
            <p className="text-[11px] text-ink-400 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 text-amber-500 mt-0.5" />
              <span>การยกเลิกนัดที่ยืนยันแล้วก่อนเวลานัดน้อยกว่า {formatThresholdHours(LATE_CANCEL_THRESHOLD_MINUTES)} ชั่วโมง จะถูกหัก {LATE_CANCEL_POINTS} คะแนนความน่าเชื่อถือ</span>
            </p>
          ) : null}

          <button
            onClick={openCancelDialog}
            disabled={cancelling}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50"
          >
            <XCircle size={15} />
            {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิกนัดนี้'}
          </button>
        </div>
      )}

      {/* ─── ปุ่มไปแชท ─── */}
      <div className="cm-card p-4 mb-4">
        <p className="text-sm font-bold text-ink-900 mb-3 flex items-center gap-1.5">
          <MessageCircle size={16} className="text-brand-500" /> ติดต่อคู่ค้า
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => {
              const partnerId = role === 'buyer' ? meetup.sellerId : meetup.buyerId;
              navigate(`/chat?productId=${meetup.productId}&partnerId=${partnerId}`);
            }}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#f95721] hover:bg-orange-600 active:bg-orange-700 text-white text-sm font-bold px-4 py-2.5 transition-colors shadow-xs"
          >
            <MessageCircle size={16} />
            แชทกับ{role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'} ({otherName})
          </button>
        </div>
      </div>

      {/* ─── Confirm Delivery Dialog ─── */}
      <ConfirmDialog
        open={showDeliveryConfirm}
        onClose={() => setShowDeliveryConfirm(false)}
        onConfirm={executeConfirmDelivery}
        title={role === 'buyer' ? 'ยืนยันว่าได้รับสินค้าเรียบร้อยแล้ว?' : 'ยืนยันว่าส่งมอบสินค้าเรียบร้อยแล้ว?'}
        description="เมื่อยืนยันแล้ว จะถือว่าจบงานของฝ่ายคุณทันทีโดยไม่ต้องรออีกฝ่าย และจะเปิดหน้าต่างให้คะแนนรีวิวคู่ค้า (สามารถเลือกที่จะรีวิวหรือไม่ก็ได้)"
        confirmLabel="ยืนยันสำเร็จดีล"
        cancelLabel="ย้อนกลับ"
        variant="info"
        loading={completing}
      />

      {/* ─── Review Modal ─── */}
      <ReviewModal
        open={showReviewModal}
        onClose={() => {
          setShowReviewModal(false);
          if (myConfirmedDelivery) {
            navigate('/meetups?tab=completed', { replace: true });
          }
        }}
        revieweeName={role === 'buyer' ? meetup.sellerName : meetup.buyerName}
        onSubmit={handleReviewSubmit}
      />

      {/* ─── Confirm Cancel Dialog ─── */}
      <ConfirmDialog
        open={showCancelConfirm}
        onClose={closeCancelDialog}
        onConfirm={executeCancel}
        title={cancelPenalty ? 'ยกเลิกนัดนี้และยอมรับการหักคะแนน?' : 'ยืนยันการยกเลิกนัดหมายนี้?'}
        description={
          cancelPenalty
            ? `เหลือเวลาก่อนนัดประมาณ ${cancelPenalty.minutesLeft} นาที (น้อยกว่า ${formatThresholdHours(cancelPenalty.thresholdMinutes)} ชั่วโมง) หากยกเลิกตอนนี้ คุณจะถูกหัก ${cancelPenalty.pointsDeducted} คะแนนความน่าเชื่อถือทันที และไม่สามารถย้อนกลับได้ หากต้องการนัดรับสินค้านี้อีกครั้งจะต้องสร้างคำขอนัดหมายใหม่`
            : 'การยกเลิกจะไม่สามารถย้อนกลับได้ หากต้องการนัดรับสินค้านี้อีกครั้งจะต้องสร้างคำขอนัดหมายใหม่'
        }
        confirmLabel={cancelPenalty ? `ยืนยันและหัก ${cancelPenalty.pointsDeducted} คะแนน` : 'ยืนยันยกเลิกนัด'}
        cancelLabel={cancelPenalty ? 'กลับไป' : 'ไม่ยกเลิก'}
        variant={cancelPenalty ? 'warning' : 'danger'}
        loading={cancelling}
      />
    </div>
  );
}