import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useMyListingsStore = create()(
  persist(
    (set) => ({
      listings: [],
      addListing: (product) => set((state) => ({ listings: [product, ...state.listings] })),
      updateListing: (productId, updatedData) => set((state) => ({
        listings: state.listings.map((p) => (String(p.id) === String(productId) ? { ...p, ...updatedData } : p)),
      })),
      updateStatus: (productId, status) => set((state) => ({
        listings: state.listings.map((p) => (String(p.id) === String(productId) ? { ...p, status } : p)),
      })),
      removeListing: (productId) => set((state) => ({
        listings: state.listings.filter((p) => String(p.id) !== String(productId)),
      })),
      // เพิ่มใหม่: ทับ state ทั้งก้อนด้วยข้อมูลจริงจาก backend (ที่กรอง seller_id
      // ถูกต้องอยู่แล้ว) — SelfProfilePage.jsx เรียกใช้ตัวนี้หลัง api.getMyListings()
      // สำเร็จ เพื่อ sync ให้ตรงกับความจริง แทนที่จะปล่อยให้เห็นแต่ข้อมูลดิบที่
      // ค้างอยู่ใน localStorage (ซึ่งอาจเป็นของบัญชีอื่นที่เคยใช้เครื่องนี้)
      // เดิมไฟล์นี้ไม่มีฟังก์ชันนี้เลย ทำให้ SelfProfilePage.jsx เรียก setListings()
      // แล้ว error เงียบๆ (TypeError: setListings is not a function) และไม่เคย
      // sync ข้อมูลจริงมาทับ state เก่าได้สักครั้ง
      setListings: (listings) => set({ listings: Array.isArray(listings) ? listings : [] }),
      // เพิ่มใหม่: ล้างข้อมูลสินค้าทั้งหมดที่ค้างอยู่ในเครื่อง (localStorage)
      // ต้องเรียกทุกครั้งที่ logout หรือ login สลับบัญชี ไม่งั้นสินค้าของบัญชีเก่า
      // (ที่บันทึกไว้แบบ optimistic ตอนกดลงขาย) จะปนมากับบัญชีใหม่บนเครื่องเดียวกัน
      clearListings: () => set({ listings: [] }),
    }),
    { name: "cm-my-listings" }
  )
);