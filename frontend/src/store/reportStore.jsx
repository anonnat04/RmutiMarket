import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useReportStore = create()(
  persist(
    (set, get) => ({
      reports: [],

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
    { name: 'rmuti-reports', version: 1, migrate: () => ({}), partialize: () => ({}) }
  )
);
