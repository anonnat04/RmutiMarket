import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const INITIAL_REPORTS = [
  {
    id: 'rep-1',
    type: 'product', // 'product' | 'user' | 'scam'
    targetId: 'p2',
    targetTitle: 'iPad Gen 9 สภาพนางฟ้า (ราคาต่ำผิดปกติ)',
    targetUser: 'student_fake99',
    reporterName: 'kanok_engineer',
    reporterEmail: 'kanok@rmuti.ac.th',
    category: 'ต้องสงสัยว่าโกง / ราคาผิดปกติ',
    description: 'ผู้ขายแจ้งให้โอนเงินมัดจำก่อน ทั้งที่ระบบแจ้งให้นัดรับเท่านั้น',
    status: 'pending', // 'pending' | 'resolved' | 'dismissed'
    createdAt: '2026-06-10T14:20:00Z',
    adminNote: '',
  },
  {
    id: 'rep-2',
    type: 'user',
    targetId: 'u-baduser',
    targetTitle: 'บัญชีผู้ใช้ user_scam01',
    targetUser: 'user_scam01',
    reporterName: 'nong_cs',
    reporterEmail: 'nong@rmuti.ac.th',
    category: 'ใช้ภาษาไม่สุภาพ / ก่อกวน',
    description: 'ทักแชทมาส่งข้อความสแปมและไม่ยอมมาตามเวลานัด',
    status: 'resolved',
    createdAt: '2026-06-08T09:15:00Z',
    adminNote: 'ตักเตือนผู้ใช้งานและระงับการโพสต์ชั่วคราว 3 วัน',
  },
];

export const useReportStore = create()(
  persist(
    (set, get) => ({
      reports: INITIAL_REPORTS,

      submitReport: ({ type, targetType, targetId, targetTitle, targetUser, reporterName, reporterEmail, category, description }) => {
        const resolvedType = targetType || type || 'product';
        const newReport = {
          id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: resolvedType,
          target_type: resolvedType,
          targetId,
          targetTitle: targetTitle || 'รายการที่รายงาน',
          targetUser: targetUser || 'ไม่ระบุ',
          reporterName: reporterName || 'ผู้ใช้นิรนาม',
          reporterEmail: reporterEmail || 'student@rmuti.ac.th',
          category: category || 'พฤติกรรมไม่เหมาะสม',
          description: description || '',
          status: 'pending',
          createdAt: new Date().toISOString(),
          adminNote: '',
        };


        set((state) => ({
          reports: [newReport, ...state.reports],
        }));

        return newReport.id;
      },

      resolveReport: (reportId, status, adminNote = '') => {
        set((state) => ({
          reports: state.reports.map((r) =>
            r.id === reportId ? { ...r, status, adminNote, resolvedAt: new Date().toISOString() } : r
          ),
        }));
      },

      getPendingCount: () => {
        return get().reports.filter((r) => r.status === 'pending').length;
      },
    }),
    { name: 'rmuti-reports' }
  )
);
