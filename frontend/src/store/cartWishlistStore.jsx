import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";

export const useWishlistStore = create()(
  persist(
    (set, get) => ({
      productIds: [],

      // เทียบแบบ string เสมอ กัน bug number vs string (id สินค้าจาก formatListing เป็น string)
      isSaved: (productId) => get().productIds.includes(String(productId)),

      toggle: async (productId) => {
        const id = String(productId); // บังคับเป็น string ตั้งแต่ต้นทาง
        const current = get().productIds;
        const exists = current.includes(id);
        const nextIds = exists
          ? current.filter((pid) => pid !== id)
          : [...current, id];

        set({ productIds: nextIds });

        try {
          if (exists) {
            await api.removeFromWishlist(id);
          } else {
            await api.addToWishlist(id);
          }
        } catch (err) {
          console.warn("Wishlist sync error:", err);
        }
      },

      fetchWishlist: async () => {
        try {
          const res = await api.getWishlist();
          if (res?.wishlist) {
            // บังคับแปลงเป็น String ทุกตัว กัน bigint จาก Supabase กลายเป็น number
            // แล้วไป mismatch กับ p.id (string) ตอน filter ในหน้า WishlistPage
            const ids = res.wishlist
              .map((item) => item.listing_id ?? item.listings?.id)
              .filter((v) => v !== null && v !== undefined)
              .map((v) => String(v));
            set({ productIds: ids });
            return res.wishlist;
          }
        } catch (err) {
          console.warn("Could not fetch backend wishlist:", err);
        }
      },

      clearWishlist: () => set({ productIds: [] }),
    }),
    { name: "cm-wishlist" }
  )
);