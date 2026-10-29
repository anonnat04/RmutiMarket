import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useFeedStore = create()(
  persist(
    (set, get) => ({
      viewCounts: {}, // { [productId]: count }
      categoryViewCounts: {}, // { [categoryId]: count }
      likedCategories: {}, // { [categoryId]: count }
      searchKeywords: [], // list of searched words
      /** หมวดหมู่ที่เลือกตอนสมัคร — ใช้ boost feed score */
      seededInterests: [], // ['cat-electronics', 'cat-fashion', ...]

      recordSearch: (query) => {
        if (!query || typeof query !== 'string') return;
        const clean = query.trim().toLowerCase();
        if (!clean) return;
        set((state) => {
          const filtered = state.searchKeywords.filter((k) => k !== clean);
          return { searchKeywords: [clean, ...filtered].slice(0, 20) };
        });
      },

      recordView: (product) => {
        if (!product || !product.id) return;
        set((state) => {
          const newViews = { ...state.viewCounts, [product.id]: (state.viewCounts[product.id] || 0) + 1 };
          const newCatViews = { ...state.categoryViewCounts };
          if (product.categoryId) {
            newCatViews[product.categoryId] = (newCatViews[product.categoryId] || 0) + 1;
          }
          return { viewCounts: newViews, categoryViewCounts: newCatViews };
        });
      },

      recordLike: (product, isLiked) => {
        if (!product) return;
        set((state) => {
          const newLikedCats = { ...state.likedCategories };
          const catId = product.categoryId;
          if (catId) {
            const current = newLikedCats[catId] || 0;
            newLikedCats[catId] = isLiked ? current + 1 : Math.max(0, current - 1);
          }
          return { likedCategories: newLikedCats };
        });
      },

      /**
       * เรียกหลังผู้ใช้เลือก interests ตอนสมัคร
       * จะ seed คะแนนเริ่มต้นให้กับหมวดที่เลือกเพื่อให้ feed ทำงานได้ทันที
       */
      seedInterests: (interestIds = []) => {
        if (!interestIds.length) return;
        set((state) => {
          const newCatViews = { ...state.categoryViewCounts };
          // Seed score ให้ categories ที่เลือก (เสมือนดูแล้ว 5 ครั้ง)
          interestIds.forEach((id) => {
            newCatViews[id] = (newCatViews[id] || 0) + 5;
          });
          return {
            seededInterests: interestIds,
            categoryViewCounts: newCatViews,
          };
        });
      },

      /**
       * Calculate unified smart recommendation feed
       * Priority: 1) Wishlist > 2) Category likes > 3) Direct views > 4) Category views
       *           > 5) Seeded interests > 6) Searched keywords > 7) Trust score
       */
      getRecommendedFeed: (allProducts = [], wishlistIds = []) => {
        const { viewCounts, categoryViewCounts, likedCategories, searchKeywords, seededInterests } = get();

        return [...allProducts].map((p) => {
          let score = 0;

          // 1. Direct liked product (+25)
          if (wishlistIds.includes(p.id)) {
            score += 25;
          }

          // 2. Category affinity from likes (+10 per liked item in same category)
          if (p.categoryId && likedCategories[p.categoryId]) {
            score += likedCategories[p.categoryId] * 10;
          }

          // 3. Direct views count (+5 per view, up to 30)
          if (viewCounts[p.id]) {
            score += Math.min(viewCounts[p.id] * 5, 30);
          }

          // 4. Category affinity from views (+3 per view in category, up to 20)
          if (p.categoryId && categoryViewCounts[p.categoryId]) {
            score += Math.min(categoryViewCounts[p.categoryId] * 3, 20);
          }

          // 5. ⭐ INTEREST BOOST — ตรงกับหมวดที่เลือกตอนสมัคร (+20 flat bonus)
          if (p.categoryId && seededInterests.includes(p.categoryId)) {
            score += 20;
          }

          // 6. Matching searched keywords (+12 per matched word)
          if (searchKeywords.length > 0) {
            const titleLower = (p.title || '').toLowerCase();
            const descLower = (p.description || '').toLowerCase();
            for (const kw of searchKeywords) {
              if (titleLower.includes(kw) || descLower.includes(kw)) {
                score += 12;
                break;
              }
            }
          }

          // 7. Base popularity & trust score
          if (p.seller?.trustScore) {
            score += p.seller.trustScore * 0.5;
          }

          return { ...p, _feedScore: score };
        }).sort((a, b) => b._feedScore - a._feedScore);
      },

      /** รายการ interests ที่ seeded (อ่านจาก authStore โดยตรง) */
      getSeededInterests: () => get().seededInterests,
    }),
    { name: "cm-user-feed-store" }
  )
);
