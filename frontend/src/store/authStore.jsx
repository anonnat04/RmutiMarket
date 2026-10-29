import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      role: 'guest',
      interests: [],
      isHydrated: false,

      setHydrated: () => set({ isHydrated: true }),

      login: (user, token) => {
        set({
          user: { ...user, role: user?.role || 'user' },
          token: token || null,
          role: user?.role || 'user',
          isAuthenticated: true,
        });

        // ยืนยันตัวตน socket ทันที เพื่อรับแจ้งเตือนแบบ realtime
        import('@/services/socket').then(({ authenticateSocketNow }) => {
          authenticateSocketNow();
        });

        // ดึง wishlist ของบัญชีนี้จาก backend มาทับค่าที่ค้างในเบราว์เซอร์ทันที
        import('@/store/cartWishlistStore').then(({ useWishlistStore }) => {
          useWishlistStore.getState().fetchWishlist();
        });

        // ดึงแจ้งเตือนของบัญชีนี้จาก backend ทันทีหลัง login
        import('@/store/notificationStore').then(({ useNotificationStore }) => {
          useNotificationStore.getState().fetchNotifications();
        });

        // ดึงยอดข้อความแชทที่ยังไม่อ่าน
        import('@/store/chatStore').then(({ useChatStore }) => {
          useChatStore.getState().fetchUnreadCount();
        });
      },

      logout: () => {
        // ล้าง token และข้อมูล session ทั้งหมดออกจาก localStorage และ sessionStorage
        try {
          localStorage.removeItem('cm_token');
          localStorage.removeItem('cm_admin_token');
          localStorage.removeItem('cm_user');
          localStorage.removeItem('token');
          localStorage.removeItem('rmuti-auth');
          sessionStorage.clear();
        } catch (e) {
          console.warn('Error clearing localStorage on logout:', e);
        }

        // เคลียร์ wishlist
        import('@/store/cartWishlistStore').then(({ useWishlistStore }) => {
          useWishlistStore.getState().clearWishlist();
        });

        // เคลียร์แจ้งเตือน
        import('@/store/notificationStore').then(({ useNotificationStore }) => {
          useNotificationStore.setState({ notifications: [], loaded: false });
        });

        // เคลียร์แชท unread
        import('@/store/chatStore').then(({ useChatStore }) => {
          useChatStore.setState({ unreadCount: 0 });
        });

        // เคลียร์สินค้าที่เคยลงขาย
        import('@/store/myListingsStore').then(({ useMyListingsStore }) => {
          useMyListingsStore.getState().clearListings();
        });

        set({
          user: null,
          token: null,
          role: 'guest',
          isAuthenticated: false,
          interests: [],
        });
      },

      setRole: (newRole) => set((state) => ({
        role: newRole,
        user: state.user ? { ...state.user, role: newRole } : null,
      })),

      setInterests: (interestIds) => set({ interests: interestIds }),

      toggleInterest: (categoryId) => set((state) => {
        const current = state.interests || [];
        const has = current.includes(categoryId);
        return { interests: has ? current.filter((id) => id !== categoryId) : [...current, categoryId] };
      }),

      /** ตรวจสอบ token กับ server (เรียกตอน app โหลดหรือรีเฟรชหน้า) */
      verifyToken: async () => {
        const { token } = get();
        if (!token) return;
        try {
          const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          // สำคัญมาก: logout เฉพาะเมื่อ server ตอบ 401 หรือ 403 ชัดเจนเท่านั้น
          // ถ้าเป็น error 500, 502, 503, 429 หรือเน็ตกระตุก ไม่ต้อง logout เพื่อไม่ให้ session หลุด
          if (res.status === 401 || res.status === 403) {
            console.warn('[authStore] Token expired or invalid, logging out.');
            get().logout();
          } else if (res.ok) {
            const data = await res.json();
            if (data.user) {
              set({ user: { ...get().user, ...data.user } });
            }
          }
        } catch (err) {
          // ถ้า server ออฟไลน์หรือไม่ตอบสนอง ไม่ต้อง logout (ให้ใช้ cached session ต่อ)
          console.warn('[authStore] verifyToken network error, maintaining cached session:', err?.message);
        }
      },
    }),
    {
      name: 'rmuti-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHydrated?.();
      },
      // ระบุ field ที่ persist เพื่อป้องกัน schema conflict
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        role: state.role,
        interests: state.interests,
      }),
    }
  )
);