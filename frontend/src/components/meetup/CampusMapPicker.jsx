import { useEffect, useRef, useState, useCallback } from 'react';
import {
  meetupPoints,
  CAMPUS_CENTER,
  CAMPUS_ZOOM,
  CAMPUS_BOUNDARY,
  categoryColors,
  categoryLabel,
} from '@/constants/meetupPoints';

// ─── Leaflet CSS ────────────────────────────────────────────────────────────
// โหลด CSS ผ่าน JS เพื่อไม่ต้องแก้ index.html
function ensureLeafletCSS() {
  if (document.querySelector('link[data-leaflet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.setAttribute('data-leaflet', '1');
  document.head.appendChild(link);
}

// ─── สร้าง custom div icon สำหรับ Leaflet ────────────────────────────────
function makeMarkerIcon(L, emoji, color, active = false) {
  const size = active ? 44 : 36;
  const html = `
    <div style="
      display:flex;align-items:center;justify-content:center;
      width:${size}px;height:${size}px;
      background:${color};
      border:3px solid ${active ? '#fff' : color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
      transition:all 0.2s;
    ">
      <span style="transform:rotate(45deg);font-size:${active ? 18 : 15}px;line-height:1">${emoji}</span>
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
    className: '',
  });
}

function makeGpsIcon(L) {
  const html = `
    <div style="position:relative;width:22px;height:22px">
      <div style="
        position:absolute;inset:0;
        background:#3b82f6;border:3px solid #fff;border-radius:50%;
        box-shadow:0 0 0 6px rgba(59,130,246,0.25);
        animation:gps-pulse 1.8s infinite;
      "></div>
    </div>
    <style>
      @keyframes gps-pulse {
        0%,100%{box-shadow:0 0 0 0 rgba(59,130,246,0.4)}
        50%{box-shadow:0 0 0 12px rgba(59,130,246,0)}
      }
    </style>
  `;
  return L.divIcon({
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    className: '',
  });
}

function makeCustomPinIcon(L) {
  const html = `
    <div style="
      width:28px;height:28px;
      background:#f97316;
      border:3px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    ">
      <span style="display:block;transform:rotate(45deg);text-align:center;font-size:13px;line-height:22px">✏️</span>
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
    className: '',
  });
}

// ─── CampusMapPicker ──────────────────────────────────────────────────────
/**
 * Props:
 *  value   : { type: 'point', id: string } | { type: 'custom', lat, lng, name } | null
 *  onChange: (value) => void
 */
export function CampusMapPicker({ value, onChange }) {
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const markerLayerRef = useRef({});  // id → marker
  const gpsMarkerRef = useRef(null);
  const customMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const LRef = useRef(null);

  const [gpsActive, setGpsActive] = useState(false);
  const [gpsStatus, setGpsStatus] = useState(''); // 'tracking' | 'error' | ''
  const [gpsCoords, setGpsCoords] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedPoint, setSelectedPoint] = useState(null); // meetupPoints item
  const [customLocation, setCustomLocation] = useState(null); // { lat, lng }

  // ─── init map ───────────────────────────────────────────────────────────
  useEffect(() => {
    ensureLeafletCSS();
    let cancelled = false;

    import('leaflet').then((mod) => {
      if (cancelled || leafletMapRef.current) return;
      const L = mod.default ?? mod;
      LRef.current = L;

      // Fix icon URL issue with webpack/vite
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current, {
        center: [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng],
        zoom: CAMPUS_ZOOM,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 20,
      }).addTo(map);

      // วาด Polygon ขอบเขตมหาวิทยาลัย (เส้นสีแดงทึบ)
      const campusPolygon = L.polygon(CAMPUS_BOUNDARY, {
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.07,
        weight: 3,
        dashArray: null,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);

      // ซูมและปรับมุมมองแผนที่ให้ครอบคลุมขอบเขตมหาลัยพอดี
      map.fitBounds(campusPolygon.getBounds(), { padding: [20, 20] });

      // วาง markers อาคาร RMUTI
      meetupPoints.forEach((pt) => {
        const color = categoryColors[pt.category] ?? '#6b7280';
        const icon = makeMarkerIcon(L, pt.icon, color, false);
        const marker = L.marker([pt.lat, pt.lng], { icon })
          .addTo(map)
          .bindPopup(
            `<div style="min-width:180px">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px">${pt.icon} ${pt.name}</div>
              <div style="font-size:11px;color:#555;margin-bottom:8px">${pt.description}</div>
              <button
                onclick="window._cmSelectPoint && window._cmSelectPoint('${pt.id}')"
                style="background:#f97316;color:#fff;border:none;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;width:100%"
              >📍 เลือกจุดนี้</button>
            </div>`,
            { maxWidth: 220 }
          );
        markerLayerRef.current[pt.id] = marker;
      });

      // คลิกบนแผนที่ → กำหนดจุดกำหนดเอง
      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        setCustomLocation({ lat, lng });
        setSelectedPoint(null);
        onChange({ type: 'custom', lat, lng, name: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });

        if (customMarkerRef.current) {
          customMarkerRef.current.setLatLng([lat, lng]);
        } else {
          customMarkerRef.current = L.marker([lat, lng], { icon: makeCustomPinIcon(L) })
            .addTo(map)
            .bindPopup('<div style="font-size:12px;font-weight:600">📍 จุดที่คุณเลือก<br><span style="font-size:10px;color:#777">คลิกบนแผนที่เพื่อเปลี่ยนตำแหน่ง</span></div>')
            .openPopup();
        }
      });

      leafletMapRef.current = map;

      // global callback สำหรับปุ่มใน popup
      window._cmSelectPoint = (id) => {
        const pt = meetupPoints.find((p) => p.id === id);
        if (!pt) return;
        setSelectedPoint(pt);
        setCustomLocation(null);
        onChange({ type: 'point', id: pt.id });
        // ปิด custom marker
        if (customMarkerRef.current) {
          customMarkerRef.current.remove();
          customMarkerRef.current = null;
        }
        // update icon styles
        meetupPoints.forEach((p) => {
          const color = categoryColors[p.category] ?? '#6b7280';
          const active = p.id === id;
          markerLayerRef.current[p.id]?.setIcon(makeMarkerIcon(L, p.icon, color, active));
        });
        map.closePopup();
      };
    });

    return () => {
      cancelled = true;
      stopGps();
      window._cmSelectPoint = undefined;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  // ─── sync external value → highlight marker ────────────────────────────
  useEffect(() => {
    if (!LRef.current || !value) return;
    if (value.type === 'point') {
      window._cmSelectPoint?.(value.id);
    }
  }, []);

  // ─── filter markers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!leafletMapRef.current || !LRef.current) return;
    const L = LRef.current;
    meetupPoints.forEach((pt) => {
      const marker = markerLayerRef.current[pt.id];
      if (!marker) return;
      const visible = filter === 'all' || pt.category === filter;
      if (visible) {
        if (!leafletMapRef.current.hasLayer(marker)) marker.addTo(leafletMapRef.current);
      } else {
        if (leafletMapRef.current.hasLayer(marker)) marker.remove();
      }
    });
  }, [filter]);

  // ─── GPS functions ─────────────────────────────────────────────────────
  const stopGps = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (gpsMarkerRef.current && leafletMapRef.current?.hasLayer(gpsMarkerRef.current)) {
      gpsMarkerRef.current.remove();
      gpsMarkerRef.current = null;
    }
    setGpsActive(false);
    setGpsStatus('');
    setGpsCoords(null);
  }, []);

  const startGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }
    setGpsActive(true);
    setGpsStatus('tracking');

    const update = (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      setGpsCoords({ lat, lng, accuracy });

      if (!leafletMapRef.current || !LRef.current) return;
      const L = LRef.current;

      if (!gpsMarkerRef.current) {
        gpsMarkerRef.current = L.marker([lat, lng], { icon: makeGpsIcon(L), zIndexOffset: 1000 })
          .addTo(leafletMapRef.current)
          .bindPopup(`<div style="font-size:12px;font-weight:600">📡 ตำแหน่งของคุณ<br><span style="font-size:10px;color:#777">ความแม่นยำ ±${accuracy?.toFixed(0)} ม.</span></div>`);
        leafletMapRef.current.setView([lat, lng], 18);
      } else {
        gpsMarkerRef.current.setLatLng([lat, lng]);
        gpsMarkerRef.current
          .getPopup()
          ?.setContent(`<div style="font-size:12px;font-weight:600">📡 ตำแหน่งของคุณ<br><span style="font-size:10px;color:#777">ความแม่นยำ ±${accuracy?.toFixed(0)} ม.</span></div>`);
        leafletMapRef.current.panTo([lat, lng]);
      }
    };

    const error = (err) => {
      setGpsStatus('error');
      console.warn('GPS error:', err.message);
    };

    // อัปเดตทุก 30 วินาที
    watchIdRef.current = navigator.geolocation.watchPosition(update, error, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000, // cache 30 วิ
    });
  }, []);

  const toggleGps = () => {
    if (gpsActive) {
      stopGps();
    } else {
      startGps();
    }
  };

  // ─── Filtered categories for filter bar ───────────────────────────────
  const categories = [
    { key: 'all', label: 'ทั้งหมด', emoji: '🗺️' },
    { key: 'safe', label: 'จุดปลอดภัย', emoji: '🛡️' },
    { key: 'food', label: 'ร้านอาหาร', emoji: '🍜' },
    { key: 'landmark', label: 'สถานที่สำคัญ', emoji: '🏛️' },
    { key: 'building', label: 'อาคาร', emoji: '🏢' },
    { key: 'parking', label: 'ที่จอดรถ', emoji: '🅿️' },
  ];

  const currentSelection = selectedPoint
    ? selectedPoint
    : value?.type === 'custom'
    ? { name: 'จุดที่คุณกำหนดเอง', description: `${value.lat?.toFixed(5)}, ${value.lng?.toFixed(5)}`, icon: '✏️' }
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* ─── แผนที่ ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-surface-border shadow-sm">
        {/* Filter bar ลอยบนแผนที่ */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            display: 'flex',
            gap: 6,
            flexWrap: 'nowrap',
            background: 'rgba(255,255,255,0.92)',
            backdropFilter: 'blur(8px)',
            borderRadius: 999,
            padding: '4px 8px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            overflowX: 'auto',
            maxWidth: 'calc(100% - 120px)',
          }}
        >
          {categories.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setFilter(c.key)}
              style={{
                padding: '3px 10px',
                borderRadius: 999,
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                background: filter === c.key ? '#f97316' : 'transparent',
                color: filter === c.key ? '#fff' : '#374151',
                transition: 'all 0.15s',
              }}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        {/* GPS button ─ ขวาบน */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <button
            type="button"
            onClick={toggleGps}
            title={gpsActive ? 'หยุดติดตาม GPS' : 'ใช้ตำแหน่ง GPS ปัจจุบัน'}
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: 'none',
              background: gpsActive ? '#3b82f6' : 'rgba(255,255,255,0.95)',
              color: gpsActive ? '#fff' : '#374151',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(6px)',
              transition: 'all 0.2s',
            }}
          >
            {gpsActive ? '📡' : '📍'}
          </button>
          {/* กลับไปมุมมองมหาวิทยาลัย */}
          <button
            type="button"
            onClick={() => leafletMapRef.current?.setView([CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], CAMPUS_ZOOM)}
            title="กลับไปมุมมองมหาวิทยาลัย"
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              border: 'none',
              background: 'rgba(255,255,255,0.95)',
              color: '#374151',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
          >
            🏫
          </button>
        </div>

        {/* ─── Map container ──────────────────────────────────────── */}
        <div ref={mapRef} style={{ height: 380, width: '100%' }} />
      </div>

      {/* ─── GPS status bar ─────────────────────────────────────── */}
      {gpsActive && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 12,
            background: gpsStatus === 'error' ? '#fef2f2' : '#eff6ff',
            border: `1px solid ${gpsStatus === 'error' ? '#fecaca' : '#bfdbfe'}`,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 16 }}>{gpsStatus === 'error' ? '⚠️' : '📡'}</span>
          <div style={{ flex: 1 }}>
            {gpsStatus === 'error' ? (
              <span style={{ color: '#dc2626', fontWeight: 600 }}>ไม่สามารถเข้าถึง GPS ได้ — ตรวจสอบการอนุญาต</span>
            ) : (
              <span style={{ color: '#1d4ed8', fontWeight: 600 }}>
                กำลังติดตาม GPS · อัปเดตทุก 30 วิ
                {gpsCoords && (
                  <span style={{ fontWeight: 400, fontSize: 11, color: '#3b82f6', marginLeft: 8 }}>
                    ({gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)})
                  </span>
                )}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={stopGps}
            style={{
              padding: '2px 10px',
              borderRadius: 8,
              border: 'none',
              background: gpsStatus === 'error' ? '#dc2626' : '#3b82f6',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            หยุด
          </button>
        </div>
      )}

      {/* ─── คำแนะนำ ─────────────────────────────────────────────── */}
      {!currentSelection && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            background: '#fff7ed',
            border: '1px solid #fed7aa',
            fontSize: 12,
            color: '#9a3412',
          }}
        >
          <strong>วิธีเลือกจุดนัดรับ:</strong>
          <ul style={{ margin: '4px 0 0 0', paddingLeft: 16, lineHeight: 1.8 }}>
            <li>📍 กดที่ <strong>pin อาคาร</strong> บนแผนที่แล้วกด "เลือกจุดนี้"</li>
            <li>✏️ กดที่ <strong>ตำแหน่งใดก็ได้</strong> บนแผนที่เพื่อปักหมุดเอง</li>
            <li>📡 กด <strong>ปุ่ม GPS</strong> เพื่อดูตำแหน่งปัจจุบันของคุณ</li>
          </ul>
        </div>
      )}

      {/* ─── ตำแหน่งที่เลือก ─────────────────────────────────────── */}
      {currentSelection && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #fff7ed, #fff)',
            border: '2px solid #f97316',
            boxShadow: '0 2px 12px rgba(249,115,22,0.12)',
          }}
        >
          <span style={{ fontSize: 24 }}>{currentSelection.icon ?? '📍'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', marginBottom: 2 }}>
              ✅ จุดนัดหมาย: {currentSelection.name}
            </p>
            {currentSelection.description && (
              <p style={{ fontSize: 11, color: '#78716c' }}>{currentSelection.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPoint(null);
              setCustomLocation(null);
              onChange(null);
              if (customMarkerRef.current) {
                customMarkerRef.current.remove();
                customMarkerRef.current = null;
              }
              // reset all icons
              if (LRef.current) {
                meetupPoints.forEach((p) => {
                  const color = categoryColors[p.category] ?? '#6b7280';
                  markerLayerRef.current[p.id]?.setIcon(makeMarkerIcon(LRef.current, p.icon, color, false));
                });
              }
            }}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid #f97316',
              background: '#fff',
              color: '#f97316',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            เปลี่ยน
          </button>
        </div>
      )}

      {/* ─── รายการอาคาร ─────────────────────────────────────────── */}
      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8, marginTop: 4 }}>
          หรือเลือกจากรายการอาคารด้านล่าง
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {meetupPoints
            .filter((pt) => filter === 'all' || pt.category === filter)
            .map((pt) => {
              const isSelected = value?.type === 'point' && value.id === pt.id;
              const color = categoryColors[pt.category] ?? '#6b7280';
              return (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => window._cmSelectPoint?.(pt.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `2px solid ${isSelected ? '#f97316' : '#e5e7eb'}`,
                    background: isSelected ? '#fff7ed' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: `${color}22`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {pt.icon}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: isSelected ? '#c2410c' : '#1c1917',
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {pt.name}
                    </p>
                    <p style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pt.description}
                    </p>
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
