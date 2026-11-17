import { create } from 'zustand';

// ล้าง key เก่าที่เคยบันทึกไว้ใน localStorage ทั้งหมด เพื่อไม่ให้มีโพสต์ผีค้างในเครื่อง
try {
  localStorage.removeItem('campusmarket-want-to-buy');
  localStorage.removeItem('campusmarket-want-to-buy-v2');
  localStorage.removeItem('campusmarket-want-to-buy-v3');
} catch (e) {
  // Ignore
}

export const useWantToBuyStore = create((set) => ({
  // ใช้ in-memory state เท่านั้น ข้อมูลจริงทั้งหมดต้องอิงจากฐานข้อมูล Supabase
  requests: [],

  setRequests: (requests) => set({ requests: Array.isArray(requests) ? requests : [] }),
  clearRequests: () => set({ requests: [] }),
  addRequest: (req) =>
    set((state) => ({
      requests: [req, ...state.requests.filter((r) => String(r.id) !== String(req.id))],
    })),
  updateRequest: (id, updatedData) =>
    set((state) => ({
      requests: state.requests.map((r) => (String(r.id) === String(id) ? { ...r, ...updatedData } : r)),
    })),
  removeRequest: (id) =>
    set((state) => ({
      requests: state.requests.filter((r) => String(r.id) !== String(id)),
    })),
  resolveRequest: (id) =>
    set((state) => ({
      requests: state.requests.map((r) => (String(r.id) === String(id) ? { ...r, status: 'resolved' } : r)),
    })),
}));