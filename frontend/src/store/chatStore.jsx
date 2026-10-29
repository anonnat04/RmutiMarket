import { create } from 'zustand';
import { api } from '@/lib/api';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';

export const useChatStore = create((set, get) => ({
  unreadCount: 0,
  loading: false,

  fetchUnreadCount: async () => {
    const token = useAuthStore.getState().token;
    if (!token) {
      set({ unreadCount: 0 });
      return;
    }

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
      set({ loading: false });
    }
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

// Realtime socket listeners
const socket = getSocket();

socket.on('new_message', (msg) => {
  const currentUser = useAuthStore.getState().user;
  const senderId = msg?.sender?.id || msg?.sender_id;
  // ถ้าไม่ใช่ข้อความที่ตัวเองส่ง ให้ดึงยอด unread ใหม่ทันที
  if (!currentUser || String(senderId) !== String(currentUser?.id)) {
    useChatStore.getState().fetchUnreadCount();
  }
});

socket.on('connect', () => {
  useChatStore.getState().fetchUnreadCount();
});

socket.on('new_notification', (n) => {
  if (n?.type === 'message' || n?.type === 'chat_message') {
    useChatStore.getState().fetchUnreadCount();
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
