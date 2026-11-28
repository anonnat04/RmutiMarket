import { create } from 'zustand';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';

// กัน fetch ซ้อนกัน และรวมการเรียกถี่ๆ ให้เหลือครั้งเดียว
let inflight = false;
let debounceTimer = null;

export const useChatStore = create((set, get) => ({
  unreadCount: 0,
  loading: false,

  fetchUnreadCount: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ unreadCount: 0 });
      return;
    }
    if (inflight) return;

    inflight = true;
    try {
      set({ loading: true });
      const res = await api.getConversations();
      if (res?.conversations && Array.isArray(res.conversations)) {
        // รวม unreadCount จากทุกบทสนทนา
        const total = res.conversations.reduce((acc, c) => {
          return acc + (Number(c.unreadCount) || (c.unread ? 1 : 0));
        }, 0);
        set({ unreadCount: total });
      }
    } catch (err) {
      console.warn('[useChatStore] fetchUnreadCount error:', err?.message);
    } finally {
      inflight = false;
      set({ loading: false });
    }
  },

  // เรียกแบบ debounce ใช้กับ event จาก socket ที่อาจมาถี่
  scheduleFetch: (delay = 300) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => get().fetchUnreadCount(), delay);
  },

  incrementUnread: () => {
    set((state) => ({ unreadCount: state.unreadCount + 1 }));
  },

  decrementUnread: (count = 1) => {
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - count) }));
  },

  setUnreadCount: (count) => {
    set({ unreadCount: Math.max(0, count) });
  },
}));

// ─── Realtime socket listeners ───────────────────────────────────
const socket = getSocket();

// หมายเหตุ: server ส่ง new_message เฉพาะเข้าห้อง conv_ ที่ผู้ใช้ join อยู่ (เปิดหน้าแชทค้างไว้)
// ส่วนผู้ใช้ที่อยู่หน้าอื่นจะได้รับ new_notification ทางห้อง user_ แทน (ด้านล่าง)
socket.on('new_message', (msg) => {
  const currentUser = useAuthStore.getState().user;
  const senderId = msg?.sender?.id || msg?.sender_id;
  // ถ้าไม่ใช่ข้อความที่ตัวเองส่ง ให้ดึงยอด unread ใหม่
  if (!currentUser || String(senderId) !== String(currentUser?.id)) {
    // รอให้หน้าแชทที่เปิดอยู่ mark read ก่อน แล้วค่อยเทียบยอดกับฐานข้อมูล
    useChatStore.getState().scheduleFetch(350);
  }
});

// มีคนทักมา/ส่งข้อความมา หรือส่งคำขอนัดรับเข้าแชท ขณะที่ผู้ใช้ไม่ได้เปิดห้องนั้น
socket.on('new_notification', (n) => {
  const t = String(n?.type || '').toLowerCase();
  if (
    ['message', 'chat_message', 'meetup_scheduled', 'meetup_confirmed', 'meetup_cancelled', 'deal_completed', 'transaction_update'].includes(t) ||
    t.includes('meetup')
  ) {
    useChatStore.getState().scheduleFetch(150);
  }
});

socket.on('meetup_updated', () => {
  useChatStore.getState().scheduleFetch(200);
});

socket.on('meetup_status_update', () => {
  useChatStore.getState().scheduleFetch(200);
});

// อ่านข้อความแล้ว (เช่น เปิดอ่านจากอีกแท็บ) ให้ลดยอดตาม
socket.on('messages_read', () => {
  useChatStore.getState().scheduleFetch(300);
});

socket.on('connect', () => {
  useChatStore.getState().fetchUnreadCount();
});

// ─── Refresh สำรอง: polling + กลับมาที่แท็บ ───────────────────────
// กันกรณี socket หลุด/ยังไม่ authenticate ทัน ทำให้ไม่ได้รับ event
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && useAuthStore.getState().token) {
      useChatStore.getState().fetchUnreadCount();
    }
  }, 30000);

  window.addEventListener('focus', () => {
    useChatStore.getState().fetchUnreadCount();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      useChatStore.getState().fetchUnreadCount();
    }
  });
}

// Refresh the badge immediately after login/account switch, not only on the
// first Socket.IO connection (which can happen before authentication finishes).
useAuthStore.subscribe((state, previousState) => {
  if (state.token !== previousState.token) {
    if (!state.token) {
      useChatStore.getState().setUnreadCount(0);
    } else {
      useChatStore.getState().fetchUnreadCount();
    }
  }
});

// ตรวจสอบเมื่อ token เปลี่ยนหรือ hydrate
if (useAuthStore.persist?.hasHydrated?.()) {
  useChatStore.getState().fetchUnreadCount();
} else {
  useAuthStore.persist?.onFinishHydration?.(() => {
    useChatStore.getState().fetchUnreadCount();
  });
}