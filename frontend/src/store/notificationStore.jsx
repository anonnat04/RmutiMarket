import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';

// แปลง type/reference ของแจ้งเตือนจาก backend ให้เป็นลิงก์ที่กดแล้วพาไปหน้าที่เกี่ยวข้อง
// ปรับ mapping ตรงนี้ได้ตามเส้นทาง route จริงของโปรเจกต์
function buildNotificationLink(n) {
  switch (n.type) {
    case 'message':
    case 'chat_message': // ← เพิ่ม: backend (chatController.js/chatSocket.js) ส่ง type เป็น "chat_message" จริง
                          //    เดิมมีแค่เคส "message" ทำให้ไม่ match เคสไหนเลย ตกไป default ('#') กดแล้วไม่ไปไหน
      return '/chat';
    case 'meetup':
      return '/meetups';
    case 'return':
      return '/returns';
    case 'product':
      return n.reference_id ? `/products/${n.reference_id}` : '/products';
    default:
      return '#';
  }
}

// แปลงแถวดิบจากตาราง notifications (backend) ให้เป็นรูปแบบที่ UI ใช้
function mapBackendNotification(n) {
  return {
    id: n.id,
    userId: n.user_id != null ? String(n.user_id) : undefined,
    title: n.title,
    message: n.message,
    type: n.type,
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

      // ดึงแจ้งเตือนจริงจาก backend (ตาราง notifications) — backend กรองให้เฉพาะของ user ที่ login อยู่แล้ว
      fetchNotifications: async () => {
        // ── เพิ่ม guard: ถ้ายังไม่มี token (ยังไม่ login หรือ authStore ยังโหลดจาก
        // localStorage ไม่เสร็จ) ไม่ต้องยิง request เลย กันเกิด 401 โดยไม่จำเป็นตอนหน้าเว็บเพิ่งโหลด ──
        const token = useAuthStore.getState().token;
        if (!token) return;

        try {
          const res = await api.getNotifications();
          if (res?.notifications) {
            set({
              notifications: res.notifications.map(mapBackendNotification),
              loaded: true,
            });
          }
        } catch (err) {
          console.warn('Could not fetch notifications:', err);
        }
      },

      // เพิ่มแจ้งเตือนทันทีตอนได้รับ event แบบ real-time จาก socket ("new_notification")
      // ไม่ต้องรอ fetch ใหม่ทั้งหมด
      pushRealtimeNotification: (rawNotif) => {
        const mapped = mapBackendNotification(rawNotif);
        set((state) => {
          if (state.notifications.some((n) => String(n.id) === String(mapped.id))) {
            return state; // กันซ้ำ ถ้ามาซ้ำ id เดิม
          }
          return { notifications: [mapped, ...state.notifications] };
        });
      },

      // ใช้สำหรับแจ้งเตือนที่สร้างขึ้นเฉพาะฝั่ง frontend เท่านั้น (ยังไม่มี endpoint backend รองรับ
      // เช่น การแจ้งเตือนเรื่องคำขอนัดรับใน ProductDetailPage) — คงพฤติกรรมเดิมไว้เป็น fallback
      addNotification: (notification) => {
        set((state) => ({
          notifications: [
            {
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              read: false,
              createdAt: new Date().toISOString(),
              ...notification,
            },
            ...state.notifications,
          ],
        }));
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