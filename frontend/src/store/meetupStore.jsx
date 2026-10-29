import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────
// สถานะที่เป็นไปได้ของนัดหมาย
// pending           -> รอผู้ขายยืนยันครั้งแรก
// confirmed         -> นัดหมายแล้ว (รอถึงวันส่งมอบ) — แก้วัน/เวลา/สถานที่ไม่ได้
// rejected          -> ผู้ขายปฏิเสธ (จบดีล)
// cancelled         -> ถูกยกเลิกโดยผู้ซื้อหรือผู้ขาย (ก่อนถึงเวลาเช็คอิน)
// completed         -> ทั้งสองฝ่ายยืนยันรับ-ส่งสินค้าแล้ว
// return_requested / return_accepted / return_rejected -> ระบบขอคืนสินค้า (คงไว้ตามเดิม)
//
// ⚠️ ไม่มีระบบ "เลื่อนนัด" แล้ว — ถ้าต้องการเปลี่ยนวัน/เวลา/จุดนัด ต้องยกเลิกนัดเดิมแล้วสร้างนัดใหม่
// ─────────────────────────────────────────────────────────

export const SAFE_POINT_RADIUS_METERS = 800;
export const DEFAULT_MEETUP_DURATION_MIN = 30;

// ระยะเวลาแต่ละช่วงของการ Check-in (นาที)
const CHECKIN_OPENS_BEFORE_MIN = 30; // เปิดก่อนเวลานัด 30 นาที
const CHECKIN_NORMAL_AFTER_START_MIN = 15; // หลังเวลานัด 15 นาทีแรกยังถือว่าตรงเวลา
const CHECKIN_LATE_AFTER_START_MIN = 30; // หลังเวลานัดเกิน 30 นาทีถือว่าหมดเวลาปิด Check-in

// แจ้งเตือนล่วงหน้า (ชั่วโมง)
const REMINDER_HOURS_FAR = 6;
const REMINDER_HOURS_NEAR = 1;

function makeId() {
  return `mt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toDateTime(date, time) {
  // date: 'YYYY-MM-DD', time: 'HH:mm'
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

// คำนวณระยะทางระหว่างสองพิกัด (เมตร) ด้วยสูตร Haversine
export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return Infinity;
  }
  const R = 6371000; // รัศมีโลก (เมตร)
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// สถานะ Check-in ตามช่วงเวลา: 'waiting' | 'open' | 'late' | 'closed'
export function getCheckInWindow(meetup) {
  const start = toDateTime(meetup?.date, meetup?.startTime || meetup?.time);
  if (!start) return { status: 'unknown' };

  const opensAt = addMinutes(start, -CHECKIN_OPENS_BEFORE_MIN);
  const normalUntil = addMinutes(start, CHECKIN_NORMAL_AFTER_START_MIN);
  const closesAt = addMinutes(start, CHECKIN_LATE_AFTER_START_MIN);
  const now = new Date();

  let status = 'waiting';
  if (now < opensAt) status = 'waiting';
  else if (now >= opensAt && now < normalUntil) status = 'open';
  else if (now >= normalUntil && now < closesAt) status = 'late';
  else status = 'closed';

  return { status, opensAt, normalUntil, closesAt, meetupStart: start };
}

// ตรวจสอบว่าผู้ใช้อยู่ในระยะที่ Check-in ได้หรือไม่ (ต้องมี lat/lng ของ Safe Point ใน meetup)
export function isWithinSafePointRadius(meetup, userLat, userLng, radius = SAFE_POINT_RADIUS_METERS) {
  const distance = haversineDistanceMeters(meetup?.locationLat, meetup?.locationLng, userLat, userLng);
  return { withinRadius: distance <= radius, distance };
}

export const useMeetupStore = create()(
  persist(
    (set, get) => ({
      meetups: [],

      // ─── ตรวจสอบเวลาทับซ้อน (ผู้ซื้อ + ผู้ขาย + สินค้า) ───
      // คืนค่า meetup ที่ชนกัน หรือ null ถ้าไม่ชน
      checkOverlap: ({ buyerId, sellerId, productId, date, startTime, endTime, excludeId }) => {
        const start = toDateTime(date, startTime);
        const end = endTime ? toDateTime(date, endTime) : addMinutes(start, DEFAULT_MEETUP_DURATION_MIN);
        if (!start || !end) return null;

        const activeStatuses = ['pending', 'confirmed'];
        const conflict = get().meetups.find((m) => {
          if (m.id === excludeId) return false;
          if (!activeStatuses.includes(m.status)) return false;
          if (m.date !== date) return false;

          const involvesSameParty =
            m.buyerId === buyerId || m.sellerId === sellerId || m.productId === productId;
          if (!involvesSameParty) return false;

          const mStart = toDateTime(m.date, m.startTime || m.time);
          const mEnd = m.endTime ? toDateTime(m.date, m.endTime) : addMinutes(mStart, DEFAULT_MEETUP_DURATION_MIN);
          if (!mStart || !mEnd) return false;

          return rangesOverlap(start, end, mStart, mEnd);
        });

        return conflict || null;
      },

      // ขั้นตอน 1: ผู้ซื้อกด "นัดรับสินค้า" แล้วเลือกวัน/เวลา/Safe Point
      // ⚠️ หมายเหตุ (แก้ล่าสุด): ฟังก์ชันนี้ไม่ควรถูกเรียกจาก ScheduleMeetupPage.jsx
      // อีกต่อไปแล้ว เพราะการสร้างนัดรับจริงตอนนี้ทำผ่าน api.createMeetup() ที่เขียน
      // ลง backend (ตาราง appointments) โดยตรง — ถ้ายังเรียกคู่กันทั้งสองทาง
      // จะได้นัดหมายซ้ำ 2 รายการต่อการนัด 1 ครั้ง (คนละ id กัน dedupe ไม่เจอ)
      // เก็บฟังก์ชันนี้ไว้เผื่อ fallback ตอน backend ล่มเท่านั้น
      createRequest: ({
        productId,
        productTitle,
        productImage,
        seller,
        buyer,
        date,
        startTime,
        time, // รองรับของเดิมที่ยังส่ง `time` มาเป็น startTime
        endTime,
        locationId,
        locationName,
        locationLat,
        locationLng,
        note = '',
        allowsReturn = true,
        returnPolicyDays = 3,
      }) => {
        const resolvedStartTime = startTime || time;
        const conflict = get().checkOverlap({
          buyerId: buyer.id,
          sellerId: seller.id,
          productId,
          date,
          startTime: resolvedStartTime,
          endTime,
        });

        if (conflict) {
          return {
            success: false,
            reason: 'ไม่สามารถสร้างนัดได้ เนื่องจากมีนัดในช่วงเวลาเดียวกันอยู่แล้ว กรุณาเลือกช่วงเวลาอื่น',
            conflict,
          };
        }

        const resolvedEndTime =
          endTime ||
          (() => {
            const start = toDateTime(date, resolvedStartTime);
            const end = addMinutes(start, DEFAULT_MEETUP_DURATION_MIN);
            return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
          })();

        const meetup = {
          id: makeId(),
          productId,
          productTitle,
          productImage,
          buyerId: buyer.id,
          buyerName: buyer.name,
          sellerId: seller.id,
          sellerName: seller.name,
          status: 'pending',
          allowsReturn: allowsReturn !== false,
          returnPolicyDays: allowsReturn !== false ? returnPolicyDays : 0,
          date,
          startTime: resolvedStartTime,
          endTime: resolvedEndTime,
          time: resolvedStartTime, // เก็บไว้เพื่อ backward-compatibility กับโค้ดเดิม
          locationId,
          locationName,
          locationLat,
          locationLng,
          note,
          createdAt: new Date().toISOString(),
          buyerCheckedIn: false,
          sellerCheckedIn: false,
          buyerCheckedInAt: null,
          sellerCheckedInAt: null,
          buyerCheckedInLate: false,
          sellerCheckedInLate: false,
          buyerConfirmedDelivery: false,
          sellerConfirmedDelivery: false,
          buyerReview: null,
          sellerReview: null,
          reminder6hSent: false,
          reminder1hSent: false,
        };

        set((state) => ({ meetups: [meetup, ...state.meetups] }));
        return { success: true, id: meetup.id };
      },

      // ขั้นตอน 3: ผู้ขายยืนยัน / ปฏิเสธคำขอ (ไม่มีทางเลือก "ขอเลื่อน" อีกต่อไป)
      respondToRequest: (meetupId, action) => {
        set((state) => ({
          meetups: state.meetups.map((m) => {
            if (m.id !== meetupId || m.status !== 'pending') return m;
            if (action === 'confirm') return { ...m, status: 'confirmed' };
            if (action === 'reject') return { ...m, status: 'rejected' };
            return m;
          }),
        }));
      },

      // ยกเลิกนัด — ทำได้ทั้งตอน pending และ confirmed แต่ห้ามยกเลิกหลังมีฝ่ายใดฝ่ายหนึ่ง Check-in แล้ว
      // ถ้าต้องการเปลี่ยนวัน/เวลา/สถานที่ ให้ยกเลิกแล้วเรียก createRequest ใหม่
      cancelRequest: (meetupId) => {
        let result = { success: false, reason: 'ไม่พบนัดหมายนี้' };
        set((state) => ({
          meetups: state.meetups.map((m) => {
            if (m.id !== meetupId) return m;
            if (!['pending', 'confirmed'].includes(m.status)) {
              result = { success: false, reason: 'นัดนี้ไม่สามารถยกเลิกได้แล้ว' };
              return m;
            }
            if (m.buyerCheckedIn || m.sellerCheckedIn) {
              result = { success: false, reason: 'ไม่สามารถยกเลิกได้ เนื่องจากมีการ Check-in แล้ว' };
              return m;
            }
            result = { success: true };
            return { ...m, status: 'cancelled', cancelledAt: new Date().toISOString() };
          }),
        }));
        return result;
      },

      // ขั้นตอน 8: ระบบ Check-in ณ จุดนัดพบปลอดภัย
      // ต้องผ่านทั้งเงื่อนไขเวลาและระยะทางจาก Safe Point ก่อนถึงจะเช็คอินได้
      checkIn: (meetupId, role, { lat, lng } = {}) => {
        const meetup = get().meetups.find((m) => m.id === meetupId);
        if (!meetup) return { success: false, reason: 'ไม่พบนัดหมายนี้' };
        if (meetup.status !== 'confirmed') {
          return { success: false, reason: 'นัดหมายนี้ยังไม่ได้รับการยืนยัน จึง Check-in ไม่ได้' };
        }

        const window = getCheckInWindow(meetup);
        if (window.status === 'waiting') {
          return { success: false, reason: 'ยังไม่ถึงเวลาเปิด Check-in' };
        }
        if (window.status === 'closed') {
          return { success: false, reason: 'หมดเวลา Check-in แล้ว' };
        }

        if (typeof lat === 'number' && typeof lng === 'number' && meetup.locationLat != null) {
          const { withinRadius, distance } = isWithinSafePointRadius(meetup, lat, lng);
          if (!withinRadius) {
            return {
              success: false,
              reason: `คุณอยู่ห่างจากจุดนัด ${Math.round(distance)} เมตร กรุณาเข้าใกล้จุดนัดรับ`,
              distance,
            };
          }
        }

        const isLate = window.status === 'late';

        set((state) => ({
          meetups: state.meetups.map((m) => {
            if (m.id !== meetupId) return m;
            return {
              ...m,
              buyerCheckedIn: role === 'buyer' ? true : m.buyerCheckedIn,
              sellerCheckedIn: role === 'seller' ? true : m.sellerCheckedIn,
              buyerCheckedInAt: role === 'buyer' ? new Date().toISOString() : m.buyerCheckedInAt,
              sellerCheckedInAt: role === 'seller' ? new Date().toISOString() : m.sellerCheckedInAt,
              buyerCheckedInLate: role === 'buyer' ? isLate : m.buyerCheckedInLate,
              sellerCheckedInLate: role === 'seller' ? isLate : m.sellerCheckedInLate,
            };
          }),
        }));

        return { success: true, late: isLate };
      },

      // ขั้นตอน 10: ทั้งสองฝ่ายยืนยันว่ารับ-ส่งสินค้าเสร็จสมบูรณ์
      markDelivered: (meetupId, role) => {
        set((state) => ({
          meetups: state.meetups.map((m) => {
            if (m.id !== meetupId) return m;
            const next = {
              ...m,
              buyerConfirmedDelivery: role === 'buyer' ? true : m.buyerConfirmedDelivery,
              sellerConfirmedDelivery: role === 'seller' ? true : m.sellerConfirmedDelivery,
            };
            if (next.buyerConfirmedDelivery && next.sellerConfirmedDelivery) {
              next.status = 'completed';
              next.completedAt = new Date().toISOString();
            }
            return next;
          }),
        }));
      },

      // ระบบขอคืนสินค้า (คงไว้ตามเดิม ไม่ได้อยู่ในสเปคใหม่แต่ไม่ตัดออก)
      requestReturn: (meetupId, reason) => {
        set((state) => ({
          meetups: state.meetups.map((m) =>
            m.id === meetupId && m.status === 'completed'
              ? { ...m, status: 'return_requested', returnReason: reason, returnRequestedAt: new Date().toISOString() }
              : m
          ),
        }));
      },

      respondToReturn: (meetupId, action) => {
        set((state) => ({
          meetups: state.meetups.map((m) =>
            m.id === meetupId && m.status === 'return_requested'
              ? { ...m, status: action === 'accept' ? 'return_accepted' : 'return_rejected' }
              : m
          ),
        }));
      },

      // ขั้นตอน 11: เปิดให้รีวิวเฉพาะนัดที่ completed แล้วเท่านั้น
      submitReview: (meetupId, role, { rating, comment, photos = [] }) => {
        set((state) => ({
          meetups: state.meetups.map((m) =>
            m.id === meetupId && m.status === 'completed'
              ? {
                  ...m,
                  [role === 'buyer' ? 'buyerReview' : 'sellerReview']: {
                    rating,
                    comment,
                    photos,
                    createdAt: new Date().toISOString(),
                  },
                }
              : m
          ),
        }));
      },

      // ขั้นตอน 4: หา meetup ที่ถึงเวลาต้องแจ้งเตือน (6 ชม. / 1 ชม. ก่อนนัด) แต่ยังไม่เคยแจ้ง
      getDueReminders: () => {
        const now = new Date();
        const due = [];
        get().meetups.forEach((m) => {
          if (m.status !== 'confirmed') return;
          const start = toDateTime(m.date, m.startTime || m.time);
          if (!start) return;
          const hoursLeft = (start.getTime() - now.getTime()) / 3600000;

          if (!m.reminder6hSent && hoursLeft <= REMINDER_HOURS_FAR && hoursLeft > REMINDER_HOURS_NEAR) {
            due.push({ meetup: m, type: '6h' });
          }
          if (!m.reminder1hSent && hoursLeft <= REMINDER_HOURS_NEAR && hoursLeft > 0) {
            due.push({ meetup: m, type: '1h' });
          }
        });
        return due;
      },

      markReminderSent: (meetupId, type) => {
        set((state) => ({
          meetups: state.meetups.map((m) =>
            m.id === meetupId
              ? { ...m, [type === '6h' ? 'reminder6hSent' : 'reminder1hSent']: true }
              : m
          ),
        }));
      },

      getMeetupsForUser: (userId) =>
        get().meetups.filter((m) => m.buyerId === userId || m.sellerId === userId),

      getMeetupById: (meetupId) => get().meetups.find((m) => m.id === meetupId) || null,

      // ─── เพิ่มใหม่: ฝังข้อมูลนัดหมายจาก backend เข้า store ในเครื่อง ───
      // จำเป็นเพราะ checkIn()/markDelivered()/cancelRequest() ทำงานกับ
      // state.meetups ในเครื่องเท่านั้น แต่นัดรับที่สร้างจริงตอนนี้มาจาก backend
      // (ตาราง appointments) ล้วนๆ ไม่เคยถูกใส่เข้า store นี้เลย ถ้าเรียก checkIn()
      // ด้วย id จาก backend ตรงๆ จะหาไม่เจอในนี้ ("ไม่พบนัดหมายนี้") ทันที
      //
      // ฟังก์ชันนี้จะ merge ข้อมูลจริงจาก backend (สถานะ, วันเวลา, สินค้า ฯลฯ)
      // เข้ากับ record เดิมถ้ามีอยู่แล้ว แต่ "คงค่า" field ที่เป็น local-only ไว้
      // (เช่น buyerCheckedIn, buyerReview) ไม่ให้ backend data มาทับล้างของเก่า
      hydrateMeetup: (data) => {
        const LOCAL_ONLY_FIELDS = [
          'buyerCheckedIn', 'sellerCheckedIn',
          'buyerCheckedInAt', 'sellerCheckedInAt',
          'buyerCheckedInLate', 'sellerCheckedInLate',
          'buyerReview', 'sellerReview',
          'reminder6hSent', 'reminder1hSent',
        ];
        set((state) => {
          const existing = state.meetups.find((m) => m.id === data.id);
          if (existing) {
            const preserved = {};
            LOCAL_ONLY_FIELDS.forEach((key) => {
              if (existing[key] !== undefined) preserved[key] = existing[key];
            });
            return {
              meetups: state.meetups.map((m) =>
                m.id === data.id ? { ...data, ...preserved } : m
              ),
            };
          }
          return { meetups: [data, ...state.meetups] };
        });
        return get().getMeetupById(data.id);
      },
    }),
    { name: 'cm-meetups' }
  )
);