import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const INITIAL_REVIEWS = [
  {
    id: 'rev-1',
    targetUserId: 's1', // seller id
    reviewerId: 'u-kanok',
    reviewerName: 'kanok_engineer',
    reviewerRole: 'ผู้ซื้อ',
    rating: 5,
    comment: 'นัดตรงเวลา สินค้าตรงปก สภาพดีมากครับ',
    productTitle: 'iPad Air 5 64GB WiFi',
    createdAt: '2026-05-24T10:30:00Z',
  },
  {
    id: 'rev-2',
    targetUserId: 's1',
    reviewerId: 'u-nong',
    reviewerName: 'nong_cs',
    reviewerRole: 'ผู้ซื้อ',
    rating: 5,
    comment: 'ผู้ขายนิสัยดี เป็นกันเอง แนะนำเลยครับ',
    productTitle: 'เสื้อช็อปวิศวะ มทร.อีสาน',
    createdAt: '2026-05-20T14:15:00Z',
  },
  {
    id: 'rev-3',
    targetUserId: 's1',
    reviewerId: 'u-ice',
    reviewerName: 'ice_business',
    reviewerRole: 'ผู้ซื้อ',
    rating: 4,
    comment: 'ต่อรองราคาง่าย สินค้ามีรอยนิดหน่อยแต่ตรงตามรูป',
    productTitle: 'กล้อง Canon EOS M50',
    createdAt: '2026-05-18T09:00:00Z',
  },
  {
    id: 'rev-4',
    targetUserId: 'me',
    reviewerId: 's1',
    reviewerName: 'อาจารย์/รุ่นพี่ มทร.',
    reviewerRole: 'ผู้ขาย',
    rating: 5,
    comment: 'มารับสินค้าตรงเวลา พูดจาสุภาพมากครับ',
    productTitle: 'หนังสือแคลคูลัส 1',
    createdAt: '2026-06-01T16:00:00Z',
  },
];

export const useReviewStore = create()(
  persist(
    (set, get) => ({
      reviews: INITIAL_REVIEWS,

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
    { name: 'rmuti-reviews' }
  )
);
