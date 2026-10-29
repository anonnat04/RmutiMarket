import { useState } from 'react';
import { useReportStore } from '@/store/reportStore';
import { ShieldAlert, CheckCircle, XCircle, Search, Filter, AlertTriangle } from 'lucide-react';

export function AdminReportsPage() {
  const reports = useReportStore((s) => s.reports);
  const resolveReport = useReportStore((s) => s.resolveReport);

  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = reports.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-xl font-extrabold text-white flex items-center gap-2">
          <ShieldAlert size={22} className="text-red-400" />
          รายงานพฤติกรรมและการร้องเรียน (Reports & Moderation)
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          ตรวจสอบรายงานจากผู้ใช้ จัดการพฤติกรรมเสี่ยง และลงบันทึกมาตรการ
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            statusFilter === 'all' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          ทั้งหมด ({reports.length})
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            statusFilter === 'pending' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          รอดำเนินการ ({reports.filter((r) => r.status === 'pending').length})
        </button>
        <button
          onClick={() => setStatusFilter('resolved')}
          className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            statusFilter === 'resolved' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          ดำเนินการแล้ว ({reports.filter((r) => r.status === 'resolved').length})
        </button>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        {filtered.map((r) => {
          const isPending = r.status === 'pending';
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-[11px] font-bold text-red-400 border border-red-500/30">
                      หมวด: {r.category}
                    </span>
                    <span className="text-xs text-slate-500">
                      เมื่อ {new Date(r.createdAt).toLocaleString('th-TH')}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mt-1">เป้าหมาย: {r.targetTitle}</h3>
                  <p className="text-xs text-slate-400">
                    ผู้ถูกรายงาน: <strong className="text-slate-200">{r.targetUser}</strong> | ผู้รายงาน:{' '}
                    <strong className="text-slate-200">{r.reporterName}</strong> ({r.reporterEmail})
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    isPending
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {isPending ? '⏳ รอตรวจสอบ' : '✅ ตรวจสอบแล้ว'}
                </span>
              </div>

              <div className="rounded-xl bg-slate-900/80 p-3.5 text-xs text-slate-300 space-y-1 border border-slate-800">
                <p className="font-semibold text-slate-200">รายละเอียดและหลักฐาน:</p>
                <p className="text-slate-400 leading-relaxed">{r.description}</p>
                {r.adminNote && (
                  <p className="mt-2 text-emerald-400 border-t border-slate-800 pt-2 font-medium">
                    บันทึก Admin: {r.adminNote}
                  </p>
                )}
              </div>

              {isPending && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      const note = prompt('บันทึกมาตรการที่ดำเนินการ (เช่น ตักเตือน, แบนบัญชี):') || 'ตักเตือนผู้ใช้';
                      resolveReport(r.id, 'resolved', note);
                    }}
                    className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
                  >
                    ✅ ดำเนินการและบันทึกมาตรการ
                  </button>
                  <button
                    onClick={() => resolveReport(r.id, 'dismissed', 'รายงานไม่พบมูลความจริง')}
                    className="rounded-xl bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    ยกเลิกรายงาน (ไม่มีมูล)
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
