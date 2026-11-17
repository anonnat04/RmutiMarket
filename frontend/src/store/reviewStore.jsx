import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useReviewStore = create()(
  persist(
    (set, get) => ({
      reviews: [],

      clearReviews: () => set({ reviews: [] }),

      addReview: ({ targetUserId, reviewerId, reviewerName, reviewerRole, rating, comment, productTitle, meetupId, images }) => {
        const newReview = {
          id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          targetUserId: targetUserId || 's1',
          reviewerId: reviewerId || 'me',
          reviewerName: reviewerName || 'ผู้ใช้งาน',
          reviewerRole: reviewerRole || 'ผู้ซื้อ',
          rating: Number(rating),
          comment: comment?.trim() || 'ไม่มีความคิดเห็นเพิ่มเติม',
          productTitle: productTitle || 'สินค้าในระบบ',
          meetupId,
          images: images || [],
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          reviews: [newReview, ...state.reviews],
        }));
      },

      // ตัดคะแนน 1 ดาวทันทีเมื่อมีการคืนสินค้าเนื่องจากตำหนิไม่ตรงตามที่แจ้ง
      applyReturnPenalty: ({ sellerId, buyerName, productTitle, returnReason, meetupId }) => {
        const penaltyReview = {
          id: `pen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          targetUserId: sellerId || 's1',
          reviewerId: 'system_penalty',
          reviewerName: buyerName ? `${buyerName} (ขอคืนสินค้า)` : 'ระบบหักคะแนน',
          reviewerRole: 'ผู้ซื้อ / ระบบตรวจสอบ',
          rating: 1, // ตัดคะแนนเหลือ 1 ดาว
          comment: `⚠️ ถูกหักคะแนนอัตโนมัติ (1 ดาว) จากการคืนสินค้า: ${returnReason || 'สินค้ามีตำหนิไม่ตรงตามที่ลงประกาศไว้'}`,
          productTitle: productTitle || 'สินค้าที่มีการคืน',
          meetupId,
          createdAt: new Date().toISOString(),
          isPenalty: true,
        };

        set((state) => ({
          reviews: [penaltyReview, ...state.reviews],
        }));
      },

      getReviewsForUser: (userId) => {
        const all = get().reviews;
        const userReviews = all.filter((r) => r.targetUserId === userId || (userId === 'me' && r.targetUserId === 'me'));
        return userReviews.length > 0 ? userReviews : all;
      },

      calculateUserTrustStats: (userId) => {
        const userReviews = get().getReviewsForUser(userId);
        const total = userReviews.length;
        if (total === 0) {
          return {
            trustScore: 92,
            averageRating: 4.8,
            totalReviews: total,
            starsBreakdown: { 5: 60, 4: 28, 3: 8, 2: 4, 1: 0 },
            verifiedStudent: true,
          };
        }

        const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let sumRating = 0;

        userReviews.forEach((r) => {
          const star = Math.min(5, Math.max(1, Math.round(r.rating)));
          counts[star] = (counts[star] || 0) + 1;
          sumRating += r.rating;
        });

        const avg = (sumRating / total).toFixed(1);
        const starsBreakdown = {};
        [5, 4, 3, 2, 1].forEach((star) => {
          starsBreakdown[star] = Math.round((counts[star] / total) * 100);
        });

        const trustScore = Math.min(100, Math.round((sumRating / (total * 5)) * 80 + 20));

        return {
          trustScore,
          averageRating: Number(avg),
          totalReviews: total,
          starsBreakdown,
          verifiedStudent: true,
        };
      },
    }),
    { name: 'rmuti-reviews', version: 1, migrate: () => ({}), partialize: () => ({}) }
  )
);
