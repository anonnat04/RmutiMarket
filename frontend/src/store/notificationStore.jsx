import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';

// แปลง type/reference ของแจ้งเตือนจาก backend ให้เป็นลิงก์ที่กดแล้วพาไปหน้าที่เกี่ยวข้องแบบตรงจุด
export function buildNotificationLink(n) {
  if (!n) return '/meetups';
  const type = String(n.type || '').toLowerCase();
  const refType = String(n.reference_type || n.ref_type || '').toLowerCase();
  const refId = n.reference_id || n.referenceId || n.ref_id;
  const title = String(n.title || '').toLowerCase();
  const message = String(n.message || '').toLowerCase();
  const meetupTarget = (tab) => `/meetups?tab=${tab}${refId ? `&highlight=${encodeURIComponent(refId)}` : ''}`;

  // 1. แชท (พาไปหน้าแชท พร้อมเปิดห้องแชทนั้นถ้ามี id)
  if (type.includes('chat') || type.includes('message') || refType === 'conversation') {
    return refId ? `/chat?conversationId=${refId}` : '/chat';
  }

  // 2. รีวิว (พาไปหน้ารวมรีวิว)
  if (type.includes('review') || refType === 'review') {
    return '/reviews';
  }

  // 3. การคืนสินค้า
  if (type.includes('return') || refType === 'return') {
    return '/returns';
  }

  // 4. สินค้า
  if ((type.includes('product') || refType === 'product') && refId) {
    return `/products/${refId}`;
  }

  // 5. นัดรับสินค้า / ซื้อขาย (ส่งไปแท็บที่ถูกต้องตามประเภทแจ้งเตือน + เลื่อนไปที่การ์ดนั้น)
  if (
    type.includes('meetup') ||
    type.includes('appointment') ||
    type.includes('deal') ||
    type.includes('transaction') ||
    type.includes('order') ||
    refType === 'meetup' ||
    refType === 'appointment' ||
    refType === 'transaction'
  ) {
    // ตรวจสถานะปลายทางก่อนคำกว้าง ๆ เช่น “คำขอ” หรือ “นัดหมาย”
    if (type.includes('no_show') || type.includes('noshow') || type.includes('missed') || title.includes('ไม่มาตามนัด') || title.includes('no-show') || message.includes('ไม่มาตามนัด')) {
      return meetupTarget('no_show');
    }
    if (type.includes('completed') || title.includes('เสร็จสมบูรณ์') || title.includes('เสร็จสิ้น') || title.includes('ส่งมอบสำเร็จ') || title.includes('รับสินค้าเรียบร้อย')) {
      return meetupTarget('completed');
    }
    if (type.includes('cancel') || type.includes('reject') || title.includes('ยกเลิก') || title.includes('ปฏิเสธ') || title.includes('หมดอายุ') || title.includes('ตัดจบ')) {
      return meetupTarget('cancelled');
    }
    if (type.includes('confirmed') || type.includes('checkin') || type.includes('check_in') || title.includes('ยืนยันการนัดรับ') || title.includes('เดินทางมาถึง')) {
      return meetupTarget('confirmed');
    }
    if (type.includes('scheduled') || title.includes('นัดหมายรับสินค้าใหม่') || title.includes('ขอนัดรับ') || title.includes('คำขอนัดรับ')) {
      return meetupTarget('pending');
    }
    // แจ้งเตือนที่อ้างถึงนัดรับแต่ไม่มีสถานะชัดเจน แสดงในทั้งหมดเพื่อไม่พาไปผิดแท็บ
    return meetupTarget('all');
  }

  if (n.link && n.link !== '#' && n.link !== '') return n.link;
  return '/meetups';
}

function dedupeNotifications(list) {
  const seenIds = new Set();
  const seenContent = new Set();
  return (list || []).filter((n) => {
    if (!n) return false;
    const contentKey = `${(n.title || '').trim()}|||${(n.message || '').trim()}`;
    if (seenContent.has(contentKey)) return false;
    seenContent.add(contentKey);

    if (n.id) {
      if (seenIds.has(String(n.id))) return false;
      seenIds.add(String(n.id));
    }
    return true;
  });
}

// แปลงแถวดิบจากตาราง notifications (backend) ให้เป็นรูปแบบที่ UI ใช้
function mapBackendNotification(n) {
  return {
    id: n.id,
    userId: n.user_id != null ? String(n.user_id) : undefined,
    title: n.title,
    message: n.message,
    type: n.type,
    reference_type: n.reference_type,
    reference_id: n.reference_id,
    link: buildNotificationLink(n),
    read: !!n.is_read,
    createdAt: n.created_at,
  };
}

export const useNotificationStore = create()(
  persist(
    (set, get) => ({
      notifications: [],
      loaded: false,

      // ดึงแจ้งเตือนจริงจาก backend (ตาราง notifications)
      fetchNotifications: async () => {
        const token = useAuthStore.getState().token;
        if (!token) return;

        try {
          const res = await api.getNotifications();
          if (res?.notifications) {
            const backendList = res.notifications.map(mapBackendNotification);
            set((state) => {
              const combined = dedupeNotifications([...backendList, ...state.notifications]);
              return {
                notifications: combined,
                loaded: true,
              };
            });
          }
        } catch (err) {
          console.warn('Could not fetch notifications:', err);
        }
      },

      // เพิ่มแจ้งเตือนทันทีตอนได้รับ event แบบ real-time จาก socket ("new_notification")
      pushRealtimeNotification: (rawNotif) => {
        const mapped = mapBackendNotification(rawNotif);
        set((state) => {
          if (
            state.notifications.some(
              (n) =>
                String(n.id) === String(mapped.id) ||
                (n.title === mapped.title && n.message === mapped.message)
            )
          ) {
            return state; // กันซ้ำ
          }
          return { notifications: [mapped, ...state.notifications] };
        });
      },

      // ใช้สำหรับแจ้งเตือนที่สร้างขึ้นเฉพาะฝั่ง frontend (มีระบบตรวจจับและกันแจ้งเตือนซ้ำ)
      addNotification: (notification) => {
        set((state) => {
          const isDuplicate = state.notifications.some(
            (n) =>
              (n.title || '').trim() === (notification.title || '').trim() &&
              (n.message || '').trim() === (notification.message || '').trim()
          );
          if (isDuplicate) return state;

          const newNotif = {
            id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            read: false,
            createdAt: new Date().toISOString(),
            ...notification,
            link: notification.link || buildNotificationLink(notification),
          };

          return {
            notifications: [newNotif, ...state.notifications],
          };
        });
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
        // sync ไป backend ด้วย (เฉพาะ id ที่เป็นของจริงจาก DB ไม่ใช่ id ปลอมแบบ "notif-...")
        if (typeof id === 'number' || /^\d+$/.test(String(id))) {
          api.markNotificationRead(id).catch((err) =>
            console.warn('markNotificationRead sync error:', err)
          );
        }
      },

      markAllAsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
        api.markAllNotificationsRead().catch((err) =>
          console.warn('markAllNotificationsRead sync error:', err)
        );
      },

      // หมายเหตุ: backend ยังไม่มี endpoint ลบแจ้งเตือนทั้งหมด ตอนนี้ทำได้แค่ซ่อนออกจากหน้าจอ
      // (mark ว่าอ่านแล้วทั้งหมด + เคลียร์ local state) ถ้าต้องการลบถาวรใน DB ด้วย ต้องเพิ่ม endpoint ฝั่ง backend
      clearNotifications: () => {
        api.markAllNotificationsRead().catch(() => {});
        set({ notifications: [] });
      },

      getNotificationsForUser: () => get().notifications,

      getUnreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    { name: 'cm-notifications' }
  )
);

// ── ฟัง event แจ้งเตือนแบบ real-time จาก backend (ผูกไว้ตั้งแต่โหลดแอป) ──
// เมื่อ chatSocket.js ฝั่ง backend insert แจ้งเตือนใหม่แล้วเจ้าตัว user นั้นออนไลน์อยู่
// จะ emit "new_notification" มาที่ socket ของ user คนนั้นโดยตรง ให้เด้งขึ้นทันทีไม่ต้องรอ refresh
const socket = getSocket();
socket.on('new_notification', (rawNotif) => {
  useNotificationStore.getState().pushRealtimeNotification(rawNotif);
});

socket.on('connect', () => {
  useNotificationStore.getState().fetchNotifications();
});

// ── เพิ่ม: ดึงแจ้งเตือนอีกครั้งทันทีที่ authStore โหลด token จาก localStorage เสร็จ (rehydration) ──
// เดิมพึ่งพา socket 'connect' อย่างเดียว ซึ่งอาจ fire เร็วกว่าที่ token จะโหลดจาก localStorage เสร็จ
// ทำให้ fetchNotifications() ครั้งแรกสุดหลัง refresh หน้าเว็บได้ 401 เพราะยังไม่มี token ตอนนั้น
if (useAuthStore.persist?.hasHydrated?.()) {
  useNotificationStore.getState().fetchNotifications();
} else {
  useAuthStore.persist?.onFinishHydration?.(() => {
    useNotificationStore.getState().fetchNotifications();
  });
}
