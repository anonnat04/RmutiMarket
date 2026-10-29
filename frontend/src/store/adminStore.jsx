import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const INITIAL_USERS = [
  {
    id: 'u-1',
    name: 'นายกนก วัฒนา',
    studentId: '6401012345678',
    email: 'kanok.wa@rmuti.ac.th',
    faculty: 'วิศวกรรมศาสตร์และเทคโนโลยี',
    role: 'user',
    status: 'active', // 'active' | 'suspended' | 'banned'
    trustScore: 95,
    joinedDate: '2026-01-15',
    listingsCount: 4,
    tradesCount: 12,
  },
  {
    id: 'u-2',
    name: 'นางสาวพิมพ์ชนก ใจดี',
    studentId: '6502023456789',
    email: 'pimchanok.ja@rmuti.ac.th',
    faculty: 'บริหารธุรกิจ',
    role: 'user',
    status: 'active',
    trustScore: 92,
    joinedDate: '2026-02-01',
    listingsCount: 6,
    tradesCount: 8,
  },
  {
    id: 'u-3',
    name: 'นายสมชาย หลอกลวง (ต้องสงสัย)',
    studentId: '6303034567890',
    email: 'scammer.fake@rmuti.ac.th',
    faculty: 'วิทยาศาสตร์และศิลปศาสตร์',
    role: 'user',
    status: 'suspended',
    trustScore: 40,
    joinedDate: '2026-05-10',
    listingsCount: 2,
    tradesCount: 1,
    suspensionReason: 'มีผู้รายงานพฤติกรรมขอให้โอนเงินมัดจำล่วงหน้า',
  },
];

const INITIAL_LISTINGS = [
  {
    id: 'p1',
    title: 'กล้อง Canon EOS M50 สภาพสวย',
    price: 8500,
    sellerName: 'นายกนก วัฒนา',
    sellerEmail: 'kanok.wa@rmuti.ac.th',
    category: 'electronics',
    status: 'active', // 'active' | 'hidden' | 'banned'
    createdAt: '2026-06-01',
    views: 142,
  },
  {
    id: 'p2',
    title: 'iPad Air 5 64GB พร้อมเคสแท้',
    price: 14900,
    sellerName: 'นางสาวพิมพ์ชนก ใจดี',
    sellerEmail: 'pimchanok.ja@rmuti.ac.th',
    category: 'electronics',
    status: 'active',
    createdAt: '2026-06-05',
    views: 89,
  },
  {
    id: 'p3',
    title: 'หนังสือ Calculus 1 สำหรับ นศ.วิศวะ',
    price: 250,
    sellerName: 'นายทดสอบ ระบบ',
    sellerEmail: 'student@rmuti.ac.th',
    category: 'books',
    status: 'active',
    createdAt: '2026-06-08',
    views: 35,
  },
  {
    id: 'p4',
    title: 'บุหรี่ไฟฟ้าและอุปกรณ์ (สินค้าผิดระเบียบ)',
    price: 990,
    sellerName: 'นายสมชาย หลอกลวง (ต้องสงสัย)',
    sellerEmail: 'scammer.fake@rmuti.ac.th',
    category: 'others',
    status: 'banned',
    createdAt: '2026-06-09',
    views: 12,
    banReason: 'สินค้าผิดระเบียบและกฎหมายมหาวิทยาลัย',
  },
];

export const useAdminStore = create()(
  persist(
    (set, get) => ({
      users: INITIAL_USERS,
      listings: INITIAL_LISTINGS,

      // User Management
      toggleUserStatus: (userId, newStatus, reason = '') => {
        set((state) => ({
          users: state.users.map((u) =>
            u.id === userId ? { ...u, status: newStatus, suspensionReason: reason } : u
          ),
        }));
      },

      // Listing Management
      toggleListingStatus: (listingId, newStatus, reason = '') => {
        set((state) => ({
          listings: state.listings.map((l) =>
            l.id === listingId ? { ...l, status: newStatus, banReason: reason } : l
          ),
        }));
      },

      // Dashboard Stats
      getStats: () => {
        const users = get().users;
        const listings = get().listings;
        return {
          totalUsers: users.length,
          activeUsers: users.filter((u) => u.status === 'active').length,
          suspendedUsers: users.filter((u) => u.status === 'suspended').length,
          totalListings: listings.length,
          activeListings: listings.filter((l) => l.status === 'active').length,
          bannedListings: listings.filter((l) => l.status === 'banned').length,
          completedTrades: 38,
          totalTradeVolume: 124500, // บาท
        };
      },
    }),
    { name: 'rmuti-admin' }
  )
);
