import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useWantToBuyStore = create(
  persist(
    (set) => ({
      // เอา mock data (wtb-1 ตามหา iPad, wtb-2 ชุดนักศึกษาหญิง) ออกทั้งหมด
      // เพราะมันไม่ใช่ข้อมูลจริงจากฐานข้อมูล แต่ถูก persist ค้างใน localStorage
      // ทำให้ลบยังไงก็ไม่หายไปจากหน้าเว็บ (ของจริงมาจาก backend ผ่าน dbPosts ใน WantToBuyPage.jsx)
      requests: [],

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
    }),
    {
      // เปลี่ยนชื่อ key เป็น v3 เพื่อล้างโพสต์เก่า/โพสต์ผีที่ค้างใน localStorage อัตโนมัติ
      name: 'campusmarket-want-to-buy-v3',
    }
  )
);