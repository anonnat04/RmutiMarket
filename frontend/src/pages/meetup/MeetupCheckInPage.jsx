import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, MapPin, CalendarClock, Navigation,
  PackageCheck, ShieldCheck, Radio, XCircle, Clock,
  Maximize2, Minimize2, ZoomIn, ZoomOut, X
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMeetupStore, getCheckInWindow, haversineDistanceMeters } from '@/store/meetupStore';
import { Button } from '@/components/common/Button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CAMPUS_CENTER, meetupPoints } from '@/constants/meetupPoints';
import { api } from '@/lib/api';
import { getSocket, joinMeetupTracking, leaveMeetupTracking, emitLiveLocation } from '@/services/socket';

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

function resolveUserName(u) {
  return u?.username || u?.display_name || u?.full_name || 'ผู้ใช้';
}

function mapAppointment(m) {
  const txn = m.transactions || {};
  const product = txn.products || {};
  const buyer = txn.buyer || {};
  const seller = txn.seller || {};
  const location = m.locations || {};
  const statusCode = m.appointment_status?.code || 'PENDING';
  const images = product.product_images || [];
  const coverImage = images.find((i) => i.is_primary)?.image_url || images[0]?.image_url || '';

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
    status: mapStatusCode(statusCode),
    date: m.appointment_date,
    time: m.appointment_time ? String(m.appointment_time).slice(0, 5) : '12:00',
    startTime: m.appointment_time ? String(m.appointment_time).slice(0, 5) : '12:00',
    locationId: m.location_id ?? location.id,
    locationName: location.name || m.location_detail || 'จุดนัดรับ มทร.อีสาน',
    locationLat: location.latitude,
    locationLng: location.longitude,
    note: m.location_detail,
    isDb: true,
  };
}

// ────────────────────────────────
// Badge ช่วงเช็คอิน
// ────────────────────────────────
function CheckInWindowBadge({ status }) {
  const map = {
    waiting: { label: '🕐 ยังไม่ถึงเวลาเปิด Check-in', style: { background: '#f3f4f6', color: '#6b7280' } },
    open:    { label: '🟢 เปิด Check-in แล้ว',         style: { background: '#dcfce7', color: '#16a34a' } },
    late:    { label: '⚠️ อยู่ในช่วง Check-in สาย',    style: { background: '#fef3c7', color: '#b45309' } },
    closed:  { label: '🔴 ปิด Check-in แล้ว',           style: { background: '#fee2e2', color: '#dc2626' } },
    unknown: { label: '—',                              style: { background: '#f3f4f6', color: '#9ca3af' } },
  };
  const cfg = map[status] || map.unknown;
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, ...cfg.style }}>
      {cfg.label}
    </span>
  );
}

// ────────────────────────────────
// ────────────────────────────────
// แผนที่พร้อมแสดงจุดนัดรับ + จุดผู้ซื้อ + จุดผู้ขาย แบบเรียลไทม์ และปุ่มขยายดูเต็มจอ
// ────────────────────────────────
function MiniMap({ meetup, myCoords, peerCoords, role, myName, otherName }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const miniMarkersRef = useRef({});

  const fullMapRef = useRef(null);
  const fullMapInstanceRef = useRef(null);
  const fullMarkersRef = useRef({});

  const [isFullscreen, setIsFullscreen] = useState(false);

  // คำนวณพิกัดจุดนัดรับ
  let targetLat = CAMPUS_CENTER.lat;
  let targetLng = CAMPUS_CENTER.lng;
  const found = meetupPoints.find((p) => p.id === meetup?.locationId);
  if (found) { targetLat = found.lat; targetLng = found.lng; }
  else if (meetup?.locationLat) { targetLat = meetup.locationLat; targetLng = meetup.locationLng; }

  // ระบุพิกัดและชื่อของผู้ซื้อและผู้ขาย
  const isMeBuyer = role === 'buyer';
  const buyerCoords = isMeBuyer ? myCoords : peerCoords;
  const sellerCoords = isMeBuyer ? peerCoords : myCoords;
  const buyerLabel = isMeBuyer ? `คุณ (ผู้ซื้อ: ${myName})` : `ผู้ซื้อ: ${otherName}`;
  const sellerLabel = isMeBuyer ? `ผู้ขาย: ${otherName}` : `คุณ (ผู้ขาย: ${myName})`;

  // ฟังก์ชันสร้าง Custom HTML Marker สำหรับ Leaflet
  const createMarkerIcon = (L, color, labelText) => {
    return L.divIcon({
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%);pointer-events:auto">
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

  // 1. Initial Mini Map
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
      if (mapInstanceRef.current) return;
      const L = mod.default ?? mod;
      const map = L.map(mapRef.current, {
        center: [targetLat, targetLng],
        zoom: 16,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      // Marker จุดนัดรับ (สีส้ม)
      const targetIcon = createMarkerIcon(L, '#f97316', `📍 ${meetup.locationName || 'จุดนัดรับ'}`);
      const targetMarker = L.marker([targetLat, targetLng], { icon: targetIcon }).addTo(map);

      miniMarkersRef.current = { target: targetMarker };
      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        miniMarkersRef.current = {};
      }
    };
  }, [meetup?.locationId, meetup?.locationLat, meetup?.locationLng, targetLat, targetLng]);

  // Update Markers ใน Mini Map เมื่อพิกัดผู้ซื้อ / ผู้ขาย เปลี่ยน
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      const map = mapInstanceRef.current;
      if (!map) return;

      // ผู้ซื้อ (สีน้ำเงิน)
      if (buyerCoords?.lat && buyerCoords?.lng) {
        if (!miniMarkersRef.current.buyer) {
          const icon = createMarkerIcon(L, '#2563eb', `🛒 ${buyerLabel}`);
          miniMarkersRef.current.buyer = L.marker([buyerCoords.lat, buyerCoords.lng], { icon }).addTo(map);
        } else {
          miniMarkersRef.current.buyer.setLatLng([buyerCoords.lat, buyerCoords.lng]);
        }
      } else if (miniMarkersRef.current.buyer) {
        map.removeLayer(miniMarkersRef.current.buyer);
        delete miniMarkersRef.current.buyer;
      }

      // ผู้ขาย (สีเขียว)
      if (sellerCoords?.lat && sellerCoords?.lng) {
        if (!miniMarkersRef.current.seller) {
          const icon = createMarkerIcon(L, '#16a34a', `🏷️ ${sellerLabel}`);
          miniMarkersRef.current.seller = L.marker([sellerCoords.lat, sellerCoords.lng], { icon }).addTo(map);
        } else {
          miniMarkersRef.current.seller.setLatLng([sellerCoords.lat, sellerCoords.lng]);
        }
      } else if (miniMarkersRef.current.seller) {
        map.removeLayer(miniMarkersRef.current.seller);
        delete miniMarkersRef.current.seller;
      }
    });
  }, [buyerCoords?.lat, buyerCoords?.lng, sellerCoords?.lat, sellerCoords?.lng, buyerLabel, sellerLabel]);

  // 2. Fullscreen Map Instance
  useEffect(() => {
    if (!isFullscreen || !fullMapRef.current || fullMapInstanceRef.current) return;

    import('leaflet').then((mod) => {
      if (fullMapInstanceRef.current) return;
      const L = mod.default ?? mod;
      const map = L.map(fullMapRef.current, {
        center: [targetLat, targetLng],
        zoom: 16,
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        attributionControl: false,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

      // Marker จุดนัดรับ
      const targetIcon = createMarkerIcon(L, '#f97316', `📍 ${meetup.locationName || 'จุดนัดรับ'}`);
      const targetMarker = L.marker([targetLat, targetLng], { icon: targetIcon }).addTo(map);

      fullMarkersRef.current = { target: targetMarker };

      // Marker ผู้ซื้อ
      if (buyerCoords?.lat && buyerCoords?.lng) {
        const bIcon = createMarkerIcon(L, '#2563eb', `🛒 ${buyerLabel}`);
        fullMarkersRef.current.buyer = L.marker([buyerCoords.lat, buyerCoords.lng], { icon: bIcon }).addTo(map);
      }

      // Marker ผู้ขาย
      if (sellerCoords?.lat && sellerCoords?.lng) {
        const sIcon = createMarkerIcon(L, '#16a34a', `🏷️ ${sellerLabel}`);
        fullMarkersRef.current.seller = L.marker([sellerCoords.lat, sellerCoords.lng], { icon: sIcon }).addTo(map);
      }

      fullMapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    });

    return () => {
      if (fullMapInstanceRef.current) {
        fullMapInstanceRef.current.remove();
        fullMapInstanceRef.current = null;
        fullMarkersRef.current = {};
      }
    };
  }, [isFullscreen, targetLat, targetLng, meetup?.locationName]);

  // Update Markers ใน Fullscreen Map
  useEffect(() => {
    if (!fullMapInstanceRef.current) return;
    import('leaflet').then((mod) => {
      const L = mod.default ?? mod;
      const map = fullMapInstanceRef.current;
      if (!map) return;

      if (buyerCoords?.lat && buyerCoords?.lng) {
        if (!fullMarkersRef.current.buyer) {
          const icon = createMarkerIcon(L, '#2563eb', `🛒 ${buyerLabel}`);
          fullMarkersRef.current.buyer = L.marker([buyerCoords.lat, buyerCoords.lng], { icon }).addTo(map);
        } else {
          fullMarkersRef.current.buyer.setLatLng([buyerCoords.lat, buyerCoords.lng]);
        }
      } else if (fullMarkersRef.current.buyer) {
        map.removeLayer(fullMarkersRef.current.buyer);
        delete fullMarkersRef.current.buyer;
      }

      if (sellerCoords?.lat && sellerCoords?.lng) {
        if (!fullMarkersRef.current.seller) {
          const icon = createMarkerIcon(L, '#16a34a', `🏷️ ${sellerLabel}`);
          fullMarkersRef.current.seller = L.marker([sellerCoords.lat, sellerCoords.lng], { icon }).addTo(map);
        } else {
          fullMarkersRef.current.seller.setLatLng([sellerCoords.lat, sellerCoords.lng]);
        }
      } else if (fullMarkersRef.current.seller) {
        map.removeLayer(fullMarkersRef.current.seller);
        delete fullMarkersRef.current.seller;
      }
    });
  }, [buyerCoords?.lat, buyerCoords?.lng, sellerCoords?.lat, sellerCoords?.lng, buyerLabel, sellerLabel]);

  return (
    <>
      {/* Container แผนที่ปกติ */}
      <div className="relative group rounded-2xl overflow-hidden border border-gray-200 shadow-2xs z-0 isolate">
        <div ref={mapRef} style={{ height: 230, width: '100%', cursor: 'grab' }} />

        {/* ปุ่มควบคุมลอยบนแผนที่ */}
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

        {/* แถบคำอธิบายจุดสีบนแผนที่ (Legend) */}
        <div className="absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-center justify-between gap-1.5 bg-white/90 backdrop-blur-xs px-2.5 py-1.5 rounded-xl border border-gray-100 text-[10px] font-semibold text-ink-700 shadow-xs pointer-events-none">
          <div className="flex items-center gap-2.5">
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
          <span className="text-gray-400">แตะ/ลากได้</span>
        </div>
      </div>

      {/* Modal แผนที่ขนาดเต็มจอ (Fullscreen Modal) */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] flex flex-col bg-white animate-in fade-in duration-200">
          {/* Header แผนที่เต็มจอ */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white/95 backdrop-blur-md shadow-xs z-10">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100 text-[#f95721] shrink-0">
                <MapPin size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-ink-900 truncate">
                  {meetup.locationName || 'จุดนัดรับ มทร.อีสาน'}
                </h3>
                <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> จุดนัดรับ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" /> จุดผู้ซื้อ
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" /> จุดผู้ขาย
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
                className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-ink-700 hover:bg-gray-50 transition-colors"
              >
                กลับจุดนัดรับ
              </button>
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

          {/* พื้นที่แผนที่เต็มจอ */}
          <div className="relative flex-1 w-full h-full bg-gray-100">
            <div ref={fullMapRef} className="w-full h-full" style={{ cursor: 'grab' }} />

            {/* Quick Action ด้านล่างของโหมดเต็มจอ */}
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
function DistanceCard({ label, distanceMeters, isMe, checkedInAt }) {
  const color = isMe ? '#2563eb' : '#16a34a';
  const dotColor = isMe ? 'bg-blue-500' : 'bg-emerald-500';

  let distLabel = '—';
  let distColor = '#6b7280';
  if (distanceMeters !== null) {
    if (distanceMeters <= 50) {
      distLabel = `${distanceMeters} ม. ✅`;
      distColor = '#16a34a';
    } else if (distanceMeters <= 200) {
      distLabel = `${distanceMeters} ม. 🚶`;
      distColor = '#d97706';
    } else {
      distLabel = `${distanceMeters} ม. 📍`;
      distColor = '#dc2626';
    }
  }

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
  const checkIn = useMeetupStore((s) => s.checkIn);
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
  const [, forceTick] = useState(0);

  // ── GPS & ระยะห่าง ──
  const [myDistance, setMyDistance] = useState(null);       // เมตร จากจุดนัดรับ
  const [peerDistance, setPeerDistance] = useState(null);   // เมตร จากจุดนัดรับ (อีกฝ่าย)
  const [myCoords, setMyCoords] = useState(null);           // { lat, lng }
  const [peerCoords, setPeerCoords] = useState(null);       // { lat, lng }
  const [gpsActive, setGpsActive] = useState(false);
  const watchIdRef = useRef(null);

  const myId = user?.id ?? 'me';

  // Tick ทุก 30 วิ เพื่ออัปเดต badge ช่วงเวลา
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
      setMeetup(hydrated || mapped);
    } catch (err) {
      console.warn('Failed to load meetup detail:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // ── เปิด GPS ติดตามระยะห่าง ──
  const startGps = useCallback((targetLat, targetLng) => {
    if (!navigator.geolocation || gpsActive) return;
    setGpsActive(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setMyCoords({ lat: latitude, lng: longitude });
        if (targetLat && targetLng) {
          const dist = Math.round(haversineDistanceMeters(latitude, longitude, targetLat, targetLng));
          setMyDistance(dist);
        }
        // ส่งพิกัดผ่าน Socket ให้อีกฝ่ายเห็น
        emitLiveLocation({
          meetupId: id,
          userId: myId,
          userName: user?.username || user?.display_name || 'ผู้ใช้',
          role: meetup ? (String(meetup.buyerId) === String(myId) ? 'buyer' : 'seller') : 'buyer',
          lat: latitude,
          lng: longitude,
          accuracy,
          targetPoint: { lat: targetLat, lng: targetLng },
        });
      },
      (err) => { console.warn('GPS error:', err.message); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );
  }, [id, myId, user, meetup, gpsActive]);

  // ── รับพิกัดอีกฝ่ายผ่าน Socket ──
  useEffect(() => {
    if (!id || !myId) return;
    const socket = getSocket();
    joinMeetupTracking({ meetupId: id, userId: myId });

    const handleLocationUpdate = (data) => {
      if (String(data.userId) !== String(myId)) {
        if (data.lat && data.lng) {
          setPeerCoords({ lat: data.lat, lng: data.lng });
        }
        // คำนวณระยะห่างอีกฝ่ายจากจุดนัดรับ
        if (meetup?.locationLat && data.lat) {
          const dist = Math.round(
            haversineDistanceMeters(data.lat, data.lng, meetup.locationLat, meetup.locationLng)
          );
          setPeerDistance(dist);
        } else if (data.distanceToPointMeters != null) {
          setPeerDistance(Math.round(data.distanceToPointMeters));
        }
      }
    };

    socket.on('live_location_update', handleLocationUpdate);
    return () => {
      socket.off('live_location_update', handleLocationUpdate);
      leaveMeetupTracking({ meetupId: id, userId: myId });
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [id, myId, meetup?.locationLat, meetup?.locationLng]);

  // ── ปิด GPS ──
  const stopGps = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGpsActive(false);
    setMyCoords(null);
    setMyDistance(null);
  }, []);

  // ไม่เปิด GPS อัตโนมัติ — ให้ผู้ใช้เป็นคนกดยืนยันเปิดด้วยตนเองทุกครั้ง

  // ── Loading / Not found ──
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
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
  const myCheckedIn = role === 'buyer' ? meetup.buyerCheckedIn : meetup.sellerCheckedIn;
  const myCheckedInAt = role === 'buyer' ? meetup.buyerCheckedInAt : meetup.sellerCheckedInAt;
  const otherCheckedIn = role === 'buyer' ? meetup.sellerCheckedIn : meetup.buyerCheckedIn;
  const otherCheckedInAt = role === 'buyer' ? meetup.sellerCheckedInAt : meetup.buyerCheckedInAt;
  const bothCheckedIn = !!meetup.buyerCheckedIn && !!meetup.sellerCheckedIn;

  // ── เช็คอิน ──
  const handleCheckIn = () => {
    if (checkingIn) return;
    setCheckingIn(true);

    const finalize = (result) => {
      setCheckingIn(false);
      if (!result.success) { alert(result.reason); return; }
      setMeetup(useMeetupStore.getState().getMeetupById(meetup.id));
    };

    if (!navigator.geolocation) {
      finalize(checkIn(meetup.id, role));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => finalize(checkIn(meetup.id, role, { lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => finalize(checkIn(meetup.id, role)),
      { timeout: 8000 }
    );
  };

  // ── ยืนยันส่งมอบ (ผ่าน ConfirmDialog) ──
  const executeConfirmDelivery = async () => {
    setCompleting(true);
    try {
      await api.completeMeetup(meetup.id);
      useMeetupStore.getState().markDelivered(meetup.id, 'buyer');
      useMeetupStore.getState().markDelivered(meetup.id, 'seller');
      setShowDeliveryConfirm(false);
      navigate('/meetups');
    } catch (err) {
      alert(err.message || 'เกิดข้อผิดพลาดในการยืนยันรับสินค้า');
    } finally {
      setCompleting(false);
    }
  };

  // ── ยกเลิกนัด (ผ่าน ConfirmDialog) ──
  const executeCancel = async () => {
    setCancelling(true);
    try {
      // พยายามยกเลิกผ่าน backend ก่อน (ถ้ามี endpoint)
      if (meetup.isDb && meetup.id && api.cancelMeetup) {
        await api.cancelMeetup(meetup.id);
      }
      const result = cancelRequest(meetup.id);
      if (!result.success) {
        alert(result.reason);
        return;
      }
      setShowCancelConfirm(false);
      navigate('/meetups');
    } catch (err) {
      // ถ้า backend ล้ม ยังยกเลิกใน local store ได้
      const result = cancelRequest(meetup.id);
      if (result.success) {
        setShowCancelConfirm(false);
        navigate('/meetups');
      } else {
        alert(err.message || 'เกิดข้อผิดพลาดในการยกเลิกนัด');
      }
    } finally {
      setCancelling(false);
    }
  };

  const canCancel = ['pending', 'confirmed'].includes(meetup.status) && !myCheckedIn;

  return (
    <div className="mx-auto max-w-2xl">

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate('/meetups')}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs shrink-0"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-extrabold text-ink-900">📍 เช็คอิน &amp; ยืนยันรับสินค้า</h1>
          <p className="text-xs text-ink-500">{meetup.productTitle} · {role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'}: {otherName}</p>
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
                onClick={() => {
                  let targetLat = meetup.locationLat;
                  let targetLng = meetup.locationLng;
                  if (!targetLat || !targetLng) {
                    const found = meetupPoints.find((p) => p.id === meetup.locationId);
                    if (found) { targetLat = found.lat; targetLng = found.lng; }
                    else { targetLat = CAMPUS_CENTER.lat; targetLng = CAMPUS_CENTER.lng; }
                  }
                  startGps(targetLat, targetLng);
                }}
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
          />
          <DistanceCard
            label={`${otherName} (${role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'})`}
            distanceMeters={peerDistance}
            isMe={false}
            checkedInAt={otherCheckedInAt}
          />
        </div>

        <p className="mt-2 text-[10px] text-ink-400">
          💡 ระยะห่างของอีกฝ่ายจะแสดงเมื่อเขาเปิด GPS บนอุปกรณ์ของตัวเองแล้ว
        </p>
      </div>

      {/* ─── สถานะเช็คอิน ─── */}
      <div className="cm-card p-4 mb-4 space-y-3">
        <p className="text-sm font-bold text-ink-900">สถานะเช็คอิน</p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`font-semibold ${meetup.buyerCheckedIn ? 'text-emerald-600' : 'text-slate-400'}`}>
            {meetup.buyerCheckedIn
              ? `✓ ผู้ซื้อถึงแล้ว${meetup.buyerCheckedInAt ? ` (${formatTime(meetup.buyerCheckedInAt)} น.)` : ''}`
              : '○ ผู้ซื้อยังไม่ถึง'}
          </span>
          <span>·</span>
          <span className={`font-semibold ${meetup.sellerCheckedIn ? 'text-emerald-600' : 'text-slate-400'}`}>
            {meetup.sellerCheckedIn
              ? `✓ ผู้ขายถึงแล้ว${meetup.sellerCheckedInAt ? ` (${formatTime(meetup.sellerCheckedInAt)} น.)` : ''}`
              : '○ ผู้ขายยังไม่ถึง'}
          </span>
        </div>

        {myCheckedIn ? (
          <div className="inline-flex flex-col gap-1">
            <span className="inline-block text-xs font-bold text-emerald-600 bg-emerald-100/70 px-3 py-1.5 rounded-lg">
              ✅ คุณเช็คอินถึงจุดนัดแล้ว {otherCheckedIn ? '' : '· รออีกฝ่ายมาถึง'}
            </span>
            {myCheckedInAt && (
              <span className="flex items-center gap-1 text-[11px] text-ink-500 px-1">
                <Clock size={11} className="text-ink-400" />
                เวลาเช็คอิน: {formatTime(myCheckedInAt)} น.
                {meetup[`${role}CheckedInLate`] && (
                  <span className="text-amber-600 font-semibold ml-1">⚠️ มาสาย</span>
                )}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              size="sm"
              className={`w-full sm:w-auto text-white transition-all ${
                checkInWindow.status === 'open' || checkInWindow.status === 'late'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-gray-400 hover:bg-gray-400 cursor-not-allowed opacity-80'
              }`}
              onClick={handleCheckIn}
              disabled={checkingIn || checkInWindow.status === 'waiting' || checkInWindow.status === 'closed'}
            >
              <span className="flex items-center gap-1.5">
                <Navigation size={14} className={checkingIn ? 'animate-spin' : 'animate-pulse'} />
                {checkingIn
                  ? 'กำลังตรวจสอบตำแหน่ง...'
                  : checkInWindow.status === 'waiting'
                  ? `รอเปิดเช็คอิน (${checkInWindow.opensAt ? formatTime(checkInWindow.opensAt.toISOString()) : ''} น.)`
                  : checkInWindow.status === 'closed'
                  ? 'ปิดรับการเช็คอินแล้ว'
                  : 'เช็คอินยืนยันว่าถึงจุดนัดพบแล้ว'}
              </span>
            </Button>

            {/* แสดงเวลาช่วงเปิด-ปิดเช็คอินชัดเจน (±30 นาที) */}
            <div className="flex items-center gap-1.5 text-[11px] text-ink-500 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-xl w-fit">
              <Clock size={12} className="text-[#f95721] shrink-0" />
              <span>
                ช่วงเวลาเปิดเช็คอิน: <b>{checkInWindow.opensAt ? formatTime(checkInWindow.opensAt.toISOString()) : '—'}</b> - <b>{checkInWindow.closesAt ? formatTime(checkInWindow.closesAt.toISOString()) : '—'} น.</b>
                <span className="text-gray-400 ml-1">(±30 นาทีจากเวลานัด {meetup.startTime || meetup.time} น.)</span>
              </span>
            </div>
          </div>
        )}

        {!bothCheckedIn && (
          <p className="text-[11px] text-ink-400">
            💡 ต้องรอทั้งสองฝ่ายเช็คอินก่อน ถึงจะแนะนำให้กดยืนยันรับสินค้าด้านล่าง (แต่ถ้าเจอกันแล้วจริงๆ กดยืนยันได้เลยไม่บังคับรอ)
          </p>
        )}
      </div>

      {/* ─── ยืนยันส่งมอบสินค้า ─── */}
      <div className="cm-card p-4 space-y-3 mb-4">
        <p className="text-sm font-bold text-ink-900 flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-brand-500" /> ยืนยันการส่งมอบสินค้า
        </p>
        <p className="text-xs text-ink-500">
          กดปุ่มนี้เมื่อได้รับ/ส่งมอบสินค้าเรียบร้อยแล้วเท่านั้น — เมื่อกดแล้วจะถือว่าดีลนี้เสร็จสมบูรณ์ทันที ไม่สามารถย้อนกลับได้
        </p>
        <Button onClick={() => setShowDeliveryConfirm(true)} disabled={completing}>
          <span className="flex items-center gap-1.5">
            <PackageCheck size={16} />
            {completing ? 'กำลังยืนยัน...' : role === 'buyer' ? 'ยืนยันรับสินค้าแล้ว' : 'ยืนยันส่งมอบสินค้าแล้ว'}
          </span>
        </Button>
      </div>

      {/* ─── ปุ่มยกเลิกนัด ─── */}
      {canCancel && (
        <div className="cm-card p-4 space-y-3 border border-red-100">
          <p className="text-sm font-bold text-red-700 flex items-center gap-1.5">
            <XCircle size={16} className="text-red-500" /> ยกเลิกนัดรับสินค้า
          </p>
          <p className="text-xs text-ink-500">
            ถ้าไม่สะดวกตามนัดหรือต้องการเปลี่ยนวัน/เวลา ให้ยกเลิกแล้วสร้างนัดใหม่ · ยกเลิกได้เฉพาะก่อนเช็คอิน
          </p>
          <button
            onClick={() => setShowCancelConfirm(true)}
            disabled={cancelling}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 rounded-xl px-4 py-2.5 transition-colors disabled:opacity-50"
          >
            <XCircle size={15} />
            {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิกนัดนี้'}
          </button>
        </div>
      )}

      {/* ─── Confirm Delivery Dialog ─── */}
      <ConfirmDialog
        open={showDeliveryConfirm}
        onClose={() => setShowDeliveryConfirm(false)}
        onConfirm={executeConfirmDelivery}
        title={role === 'buyer' ? 'ยืนยันว่าได้รับสินค้าเรียบร้อยแล้ว?' : 'ยืนยันว่าส่งมอบสินค้าเรียบร้อยแล้ว?'}
        description="เมื่อยืนยันแล้ว รายการนี้จะปิดสมบูรณ์ทันทีทั้งสองฝ่าย และไม่สามารถย้อนกลับได้"
        confirmLabel="ยืนยันสำเร็จดีล"
        cancelLabel="ย้อนกลับ"
        variant="info"
        loading={completing}
      />

      {/* ─── Confirm Cancel Dialog ─── */}
      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={executeCancel}
        title="ยืนยันการยกเลิกนัดหมายนี้?"
        description="การยกเลิกจะไม่สามารถย้อนกลับได้ หากต้องการนัดรับสินค้านี้อีกครั้งจะต้องสร้างคำขอนัดหมายใหม่"
        confirmLabel="ยืนยันยกเลิกนัด"
        cancelLabel="ไม่ยกเลิก"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
}