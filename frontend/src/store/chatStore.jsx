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
    // Let the open chat mark the message read first, then reconcile the badge
    // against the database's per-member last_read_at value.
    window.setTimeout(() => useChatStore.getState().fetchUnreadCount(), 350);
  }
});

socket.on('connect', () => {
  useChatStore.getState().fetchUnreadCount();
});

socket.on('new_notification', (n) => {
  if (['message', 'chat_message'].includes(String(n?.type || ''))) {
    useChatStore.getState().fetchUnreadCount();
  }
});

// Refresh the badge immediately after login/account switch, not only on the
// first Socket.IO connection (which can happen before authentication finishes).
useAuthStore.subscribe((state, previousState) => {
  if (state.token !== previousState.token) {
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
