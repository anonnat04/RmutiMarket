import { useEffect, useRef, useState, useCallback } from 'react';
import {
  CAMPUS_CENTER,
  CAMPUS_ZOOM,
  CAMPUS_BOUNDARY,
} from '@/constants/meetupPoints';
import { getSocket, joinMeetupTracking, leaveMeetupTracking, emitLiveLocation } from '@/services/socket';
import { Navigation, MapPin, AlertCircle, Compass, ShieldCheck, CheckCircle2 } from 'lucide-react';

function ensureLeafletCSS() {
  if (document.querySelector('link[data-leaflet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.setAttribute('data-leaflet', '1');
  document.head.appendChild(link);
}

// Marker สำหรับเป้าหมายจุดนัดรับ
function makeTargetIcon(L, label = 'จุดนัดรับ') {
  const html = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      width:42px;height:42px;background:#ea580c;
      border:3px solid #fff;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 4px 12px rgba(234,88,12,0.5);
    ">
      <span style="transform:rotate(45deg);font-size:20px;line-height:1">📍</span>
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [42, 42],
    iconAnchor: [21, 42],
    popupAnchor: [0, -42],
  });
}

// Marker พิกัดสดของผู้ใช้ (ฉัน หรือ อีกฝ่าย)
function makeUserLiveIcon(L, role = 'me', name = 'ฉัน') {
  const isMe = role === 'me';
  const bgColor = isMe ? '#2563eb' : '#16a34a'; // ฟ้า = ตัวเรา, เขียว = อีกฝ่าย
  const emoji = isMe ? '👤' : '🤝';

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%, -100%)">
      <div style="
        background:white;color:#1e293b;font-size:11px;font-weight:700;
        padding:2px 8px;border-radius:12px;box-shadow:0 2px 6px rgba(0,0,0,0.2);
        white-space:nowrap;margin-bottom:4px;border:1px solid ${bgColor};
      ">
        ${isMe ? 'ตำแหน่งของคุณ' : name}
      </div>
      <div style="position:relative;width:28px;height:28px">
        <div style="
          width:28px;height:28px;background:${bgColor};
          border:3px solid #fff;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 3px 8px rgba(0,0,0,0.3);
          font-size:14px;
        ">
          ${emoji}
        </div>
        <div style="
          position:absolute;inset:-4px;border-radius:50%;
          border:2px solid ${bgColor};
          animation:live-pulse 1.8s infinite;
        "></div>
      </div>
    </div>
    <style>
      @keyframes live-pulse {
        0%{transform:scale(0.9);opacity:0.9}
        100%{transform:scale(1.8);opacity:0}
      }
    </style>
  `;

  return L.divIcon({
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/**
 * RealtimeMeetupMap — แผนที่ติดตามการนัดรับสดฟรี 100% (OpenStreetMap + HTML5 Geolocation + Socket.IO)
 * Props:
 * - meetupId: ID ของการนัดรับ
 * - currentUser: { id, displayName }
 * - userRole: 'buyer' | 'seller'
 * - targetPoint: { name, lat, lng } (จุดนัดรับที่นัดกันไว้)
 * - onArrived: callback เมื่อถึงจุดนัดรับ
 */
export default function RealtimeMeetupMap({
  meetupId,
  currentUser,
  userRole = 'buyer',
  targetPoint = { name: 'จุดนัดรับ มทร.อีสาน', lat: 14.98545, lng: 102.12037 },
  onArrived,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const leafletRef = useRef(null);

  // Markers
  const myMarkerRef = useRef(null);
  const peerMarkerRef = useRef(null);
  const targetMarkerRef = useRef(null);

  // Watch Position ID
  const watchIdRef = useRef(null);

  // States
  const [gpsStatus, setGpsStatus] = useState('prompt'); // 'prompt' | 'granted' | 'denied' | 'watching'
  const [myLocation, setMyLocation] = useState(null);
  const [peerLocation, setPeerLocation] = useState(null);
  const [distanceToTarget, setDistanceToTarget] = useState(null);
  const [peerDistanceToTarget, setPeerDistanceToTarget] = useState(null);
  const [arrivedAlert, setArrivedAlert] = useState(null);

  // 1. โหลด Leaflet และ Initialize Map
  useEffect(() => {
    ensureLeafletCSS();

    let isMounted = true;
    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;
      leafletRef.current = L.default || L;

      // ถ้ามีแผนที่อยู่แล้วไม่ต้องสร้างซ้ำ
      if (mapInstanceRef.current) return;

      const map = leafletRef.current.map(mapContainerRef.current, {
        center: [targetPoint.lat || CAMPUS_CENTER.lat, targetPoint.lng || CAMPUS_CENTER.lng],
        zoom: CAMPUS_ZOOM,
        maxZoom: 19,
        minZoom: 15,
      });

      // 🗺️ แผนที่ OpenStreetMap (ฟรี 100% ไม่มีโควตา ไม่มีค่าใช้จ่าย)
      leafletRef.current.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors | RMUTI Market Live GPS',
      }).addTo(map);

      // เส้นขอบเขต มทร.อีสาน
      leafletRef.current.polygon(CAMPUS_BOUNDARY, {
        color: '#ea580c',
        weight: 2,
        fillColor: '#ea580c',
        fillOpacity: 0.05,
        dashArray: '5, 8',
      }).addTo(map);

      // วาง Marker จุดนัดรับ
      if (targetPoint?.lat && targetPoint?.lng) {
        const icon = makeTargetIcon(leafletRef.current, targetPoint.name);
        targetMarkerRef.current = leafletRef.current
          .marker([targetPoint.lat, targetPoint.lng], { icon })
          .addTo(map)
          .bindPopup(`<b>📍 ${targetPoint.name || 'จุดนัดรับ'}</b><br/><span style="color:#666">จุดหมายปลายทาง</span>`)
          .openPopup();
      }

      mapInstanceRef.current = map;
    });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [targetPoint]);

  // 2. ขอสิทธิ์เปิด GPS และแชร์พิกัดแบบสดผ่าน HTML5 Geolocation WatchPosition
  const startLiveGps = useCallback(() => {
    if (!navigator.geolocation) {
      alert('อุปกรณ์ของคุณไม่รองรับระบบตรวจจับ GPS');
      setGpsStatus('denied');
      return;
    }

    setGpsStatus('watching');

    // เคลียร์ watchPosition เดิมถ้ามี
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    // ติดตามพิกัดสดแบบ highAccuracy
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsStatus('granted');
        setMyLocation({ lat: latitude, lng: longitude, accuracy });

        // คำนวณระยะห่างถึงจุดนัดรับ
        if (targetPoint?.lat && targetPoint?.lng) {
          const dMeters = Math.round(
            getDistanceBetweenCoords(latitude, longitude, targetPoint.lat, targetPoint.lng) * 1000
          );
          setDistanceToTarget(dMeters);
        }

        // ส่งผ่าน Socket ไปยังอีกฝ่ายแบบเรียลไทม์
        emitLiveLocation({
          meetupId,
          userId: currentUser?.id,
          userName: currentUser?.displayName || 'ผู้ใช้',
          role: userRole,
          lat: latitude,
          lng: longitude,
          accuracy,
          targetPoint,
        });

        // อัปเดต Marker ของตัวเองบนแผนที่
        if (mapInstanceRef.current && leafletRef.current) {
          const L = leafletRef.current;
          if (!myMarkerRef.current) {
            myMarkerRef.current = L.marker([latitude, longitude], {
              icon: makeUserLiveIcon(L, 'me', 'คุณ'),
              zIndexOffset: 1000,
            }).addTo(mapInstanceRef.current);
          } else {
            myMarkerRef.current.setLatLng([latitude, longitude]);
          }
        }
      },
      (err) => {
        console.warn('GPS Error:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );
  }, [meetupId, currentUser, userRole, targetPoint]);

  // 3. Socket.IO Listeners รับพิกัดสดของอีกฝ่าย
  useEffect(() => {
    const socket = getSocket();
    joinMeetupTracking({ meetupId, userId: currentUser?.id, role: userRole });

    const handleLocationUpdate = (data) => {
      // ได้รับพิกัดจากอีกฝ่าย
      if (data.userId !== currentUser?.id) {
        setPeerLocation(data);
        if (data.distanceToPointMeters !== null) {
          setPeerDistanceToTarget(data.distanceToPointMeters);
        }

        // วาด/อัปเดต Marker ของอีกฝ่าย
        if (mapInstanceRef.current && leafletRef.current) {
          const L = leafletRef.current;
          if (!peerMarkerRef.current) {
            peerMarkerRef.current = L.marker([data.lat, data.lng], {
              icon: makeUserLiveIcon(L, 'peer', data.userName || 'คู่ค้า'),
              zIndexOffset: 900,
            }).addTo(mapInstanceRef.current);
          } else {
            peerMarkerRef.current.setLatLng([data.lat, data.lng]);
          }
        }
      }
    };

    const handleProximityAlert = (alert) => {
      setArrivedAlert(alert.message);
      if (onArrived) onArrived(alert);
    };

    socket.on('live_location_update', handleLocationUpdate);
    socket.on('proximity_alert', handleProximityAlert);

    return () => {
      socket.off('live_location_update', handleLocationUpdate);
      socket.off('proximity_alert', handleProximityAlert);
      leaveMeetupTracking({ meetupId, userId: currentUser?.id });

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [meetupId, currentUser, userRole, onArrived]);

  // ปุ่มจัดกึ่งกลางแผนที่
  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (myLocation) {
        mapInstanceRef.current.setView([myLocation.lat, myLocation.lng], 18);
      } else if (targetPoint) {
        mapInstanceRef.current.setView([targetPoint.lat, targetPoint.lng], CAMPUS_ZOOM);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-orange-100 overflow-hidden">
      {/* ส่วนหัวแสดงข้อมูลการนัดรับและสถานะ GPS */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
              <Compass className="w-5 h-5 text-white animate-spin-slow" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-1.5">
                เรดาร์นัดรับสด (Realtime GPS Meetup)
                <span className="text-xs bg-white text-orange-600 font-semibold px-2 py-0.5 rounded-full">
                  FREE 100%
                </span>
              </h3>
              <p className="text-xs text-orange-100 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> จุดนัด: {targetPoint?.name || 'มหาวิทยาลัย มทร.อีสาน'}
              </p>
            </div>
          </div>

          {/* ปุ่มเริ่มเปิด GPS */}
          {gpsStatus !== 'granted' && (
            <button
              onClick={startLiveGps}
              className="px-3.5 py-1.5 bg-white text-orange-600 font-semibold text-xs rounded-xl shadow-sm hover:bg-orange-50 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <Navigation className="w-4 h-4 text-orange-600" />
              เปิดแชร์ GPS สด
            </button>
          )}
        </div>

        {/* แถบสถานะระยะห่าง */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/20 text-xs">
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 flex items-center justify-between">
            <span className="text-orange-100">ระยะของคุณถึงจุดนัด:</span>
            <span className="font-bold">
              {distanceToTarget !== null ? `${distanceToTarget} เมตร` : 'ยังไม่ได้เปิด GPS'}
            </span>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2 flex items-center justify-between">
            <span className="text-orange-100">ระยะอีกฝ่ายถึงจุดนัด:</span>
            <span className="font-bold">
              {peerDistanceToTarget !== null ? `${peerDistanceToTarget} เมตร` : 'กำลังรอเชื่อมต่อ'}
            </span>
          </div>
        </div>
      </div>

      {/* แจ้งเตือนเมื่ออีกฝ่ายมาถึง */}
      {arrivedAlert && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex items-center gap-2 text-emerald-800 text-xs font-semibold animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>{arrivedAlert}</span>
        </div>
      )}

      {/* คำเตือนหากปฏิเสธ GPS */}
      {gpsStatus === 'denied' && (
        <div className="bg-amber-50 border-b border-amber-200 p-3 flex items-start gap-2 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <b>ไม่สามารถดึงตำแหน่ง GPS ได้:</b> กรุณากดอนุญาตสิทธิ์เข้าถึงตำแหน่ง (Location Permission) ในเว็บเบราว์เซอร์
          </div>
        </div>
      )}

      {/* แผนที่ Leaflet (OpenStreetMap) */}
      <div className="relative flex-1 min-h-[360px] w-full">
        <div ref={mapContainerRef} className="absolute inset-0 z-0" />

        {/* ปุ่มลอยสำหรับจัดกึ่งกลางแผนที่ */}
        <button
          onClick={handleRecenter}
          title="จัดกึ่งกลางตำแหน่ง"
          className="absolute bottom-4 right-4 z-[400] p-2.5 bg-white text-slate-700 rounded-xl shadow-lg border border-slate-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95 transition-all"
        >
          <Compass className="w-5 h-5" />
        </button>

        {/* ป้ายกำกับสัญลักษณ์ */}
        <div className="absolute bottom-4 left-4 z-[400] bg-white/90 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200 text-[11px] flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
            <span className="text-slate-600">ตัวคุณ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
            <span className="text-slate-600">อีกฝ่าย</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block"></span>
            <span className="text-slate-600">จุดนัด</span>
          </div>
        </div>
      </div>

      {/* แถบด้านล่าง: ระบบความปลอดภัย */}
      <div className="bg-slate-50 border-t border-slate-100 px-4 py-2.5 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>แชร์เฉพาะช่วงเวลาที่นัดรับ และไม่เก็บประวัติพิกัดหลังจบดีล</span>
        </div>
        <span className="text-[11px] text-slate-400">OpenStreetMap Free Tile</span>
      </div>
    </div>
  );
}

// Helper: คำนวณระยะห่างพิกัด (กม.)
function getDistanceBetweenCoords(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
