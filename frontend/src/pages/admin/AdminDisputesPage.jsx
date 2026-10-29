import { useState, useEffect } from 'react';
import { useReportStore } from '@/store/reportStore';
import {
  ShieldAlert, Headset, Package, MessageSquareText,
  CheckCircle2, XCircle, Trash2, RefreshCw, AlertTriangle,
  Clock, User, Tag, FileText, Filter, Phone, Mail, HelpCircle,
  ExternalLink, Check, AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

export function AdminDisputesPage() {
  const localReports = useReportStore((s) => s.reports);
  const resolveLocalReport = useReportStore((s) => s.resolveReport);

  const [activeMainTab, setActiveMainTab] = useState('reports'); // 'reports' (สินค้า/โพสต์) | 'support' (แจ้งปัญหา)
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending'); // 'all' | 'pending' | 'resolved' | 'dismissed'
  const [subTypeFilter, setSubTypeFilter] = useState('all');
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [takeDownReport, setTakeDownReport] = useState(null);

  // ดึงรายการรายงานทั้งหมดจาก Backend API
  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await api.getReports();
      if (res?.reports && Array.isArray(res.reports)) {
        // รวมข้อมูลจาก backend และ localStore
        const map = new Map();
        res.reports.forEach((r) => map.set(String(r.id), r));

        localReports.forEach((lr) => {
          if (!map.has(String(lr.id))) {
            map.set(String(lr.id), {
              ...lr,
              target_type: lr.target_type || lr.type || 'product',
              target_title: lr.targetTitle,
              target_user_name: lr.targetUser,
              reporter_name: lr.reporterName,
              reporter_email: lr.reporterEmail,
              created_at: lr.createdAt,
            });
          }
        });

        setAllReports(Array.from(map.values()));
      } else {
        setAllReports(localReports);
      }
    } catch (err) {
      console.warn('Could not fetch backend reports, using localStore fallback:', err?.message);
      setAllReports(localReports);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [localReports]);

  // แยกรายงานออกเป็น 2 กลุ่ม:
  // 1) รายงานสินค้าและโพสต์ (product / wanted_post)
  // 2) รายการแจ้งปัญหาจากศูนย์ช่วยเหลือ (support_ticket / user / scam / general)
  const productAndPostReports = allReports.filter((r) => {
    const t = r.target_type || r.type || 'product';
    return t === 'product' || t === 'wanted_post';
  });

  const supportTicketReports = allReports.filter((r) => {
    const t = r.target_type || r.type;
    return t === 'support_ticket' || t === 'user' || t === 'scam' || t === 'system';
  });

  // Action: ปลด/ลบสินค้าหรือโพสต์ทันที
  const handleTakeDown = (report) => {
    setTakeDownReport(report);
  };

  const confirmTakeDown = async () => {
    if (!takeDownReport) return;
    const report = takeDownReport;
    setTakeDownReport(null);

    const isPost = (report.target_type || report.type) === 'wanted_post';
    const itemLabel = isPost ? 'โพสต์ตามหา' : 'สินค้า';

    setActionLoadingId(report.id);
    try {
      await api.takeDownReportedItem(report.id, {
        reason: report.category || 'ละเมิดข้อกำหนดความปลอดภัยของมหาวิทยาลัย',
      });
      resolveLocalReport(report.id, 'resolved', `ปลด/ลบ${itemLabel}ออกจากระบบเรียบร้อย`);
      alert(`✅ ปลดและลบ ${itemLabel} เรียบร้อยแล้ว`);
      fetchReports();
    } catch (err) {
      alert(`เกิดข้อผิดพลาดในการปลด: ${err?.message || 'โปรดลองอีกครั้ง'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Action: จัดการสถานะ (resolved หรือ dismissed)
  const handleResolve = async (report, resolution) => {
    const isDismiss = resolution === 'dismissed';
    const note = prompt(
      isDismiss
        ? 'ระบุบันทึกเหตุผลที่เพิกเฉยคำร้อง (ถ้ามี):'
        : 'ระบุบันทึกการดำเนินการของแอดมิน (ถ้ามี):',
      isDismiss ? 'ตรวจสอบแล้ว ไม่พบการละเมิดระเบียบ' : 'ตรวจสอบและดำเนินการแก้ไขเรียบร้อย'
    );
    if (note === null) return;

    setActionLoadingId(report.id);
    try {
      await api.resolveReport(report.id, {
        status: resolution,
        adminNote: note,
      });
      resolveLocalReport(report.id, resolution, note);
      fetchReports();
    } catch (err) {
      console.warn('API resolve error, updated locally:', err?.message);
      resolveLocalReport(report.id, resolution, note);
      setAllReports((prev) =>
        prev.map((r) =>
          r.id === report.id
            ? { ...r, status: resolution, admin_note: note, adminNote: note }
            : r
        )
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  // ตัวกรองของแต่ละแท็บ
  const currentList = activeMainTab === 'reports' ? productAndPostReports : supportTicketReports;

  const filteredItems = currentList.filter((item) => {
    const curStatus = item.status || 'pending';
    const curType = item.target_type || item.type || 'product';
    const category = item.category || '';

    // กรองสถานะ
    if (statusFilter !== 'all' && curStatus !== statusFilter) return false;

    // กรองประเภทย่อย
    if (activeMainTab === 'reports') {
      if (subTypeFilter !== 'all' && curType !== subTypeFilter) return false;
    } else {
      if (subTypeFilter !== 'all' && !category.includes(subTypeFilter)) return false;
    }

    return true;
  });

  const pendingReportsCount = productAndPostReports.filter((r) => (r.status || 'pending') === 'pending').length;
  const pendingSupportCount = supportTicketReports.filter((r) => (r.status || 'pending') === 'pending').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* ─── Page Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={24} className="text-[#f95721]" />
            ศูนย์จัดการรายงานและแจ้งปัญหา (Reports & Help Center)
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            ตรวจสอบรายงานสินค้าไม่เหมาะสม, โพสต์ผิดระเบียบ และข้อความแจ้งปัญหาจากศูนย์ช่วยเหลือผู้ใช้
          </p>
        </div>

        <button
          onClick={fetchReports}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-2xs disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          รีเฟรชข้อมูล
        </button>
      </div>

      {/* ─── Main Tabs Navigation (เชื่อมต่อระหว่าง รายงานสินค้า/โพสต์ กับ แจ้งปัญหาจากผู้ใช้) ─── */}
      <div className="flex gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
        <button
          onClick={() => {
            setActiveMainTab('reports');
            setSubTypeFilter('all');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            activeMainTab === 'reports'
              ? 'bg-white text-[#f95721] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ShieldAlert size={16} className={activeMainTab === 'reports' ? 'text-[#f95721]' : 'text-gray-400'} />
          <span>รายงานสินค้าและโพสต์</span>
          {pendingReportsCount > 0 && (
            <span className="rounded-full bg-red-500 text-white text-[10px] px-2 py-0.5 font-extrabold">
              {pendingReportsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveMainTab('support');
            setSubTypeFilter('all');
          }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            activeMainTab === 'support'
              ? 'bg-white text-[#f95721] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Headset size={16} className={activeMainTab === 'support' ? 'text-[#f95721]' : 'text-gray-400'} />
          <span>รายการแจ้งปัญหาจากผู้ใช้ (ศูนย์ช่วยเหลือ)</span>
          {pendingSupportCount > 0 && (
            <span className="rounded-full bg-orange-500 text-white text-[10px] px-2 py-0.5 font-extrabold">
              {pendingSupportCount}
            </span>
          )}
        </button>
      </div>

      {/* ─── Sub-filters Toolbar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs">
        {/* Status Filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
            <Filter size={13} /> สถานะ:
          </span>
          {[
            { key: 'all', label: 'ทั้งหมด' },
            {
              key: 'pending',
              label: 'รอดำเนินการ',
              badge: activeMainTab === 'reports' ? pendingReportsCount : pendingSupportCount,
            },
            { key: 'resolved', label: 'ดำเนินการแล้ว' },
            { key: 'dismissed', label: 'เพิกเฉย' },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s.key
                  ? 'bg-[#f95721] text-white font-bold shadow-xs'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {s.label}
              {s.badge > 0 && (
                <span className="ml-1.5 rounded-full bg-white text-orange-600 px-1.5 py-0.2 text-[10px] font-extrabold">
                  {s.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Type / Category Filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-gray-500 mr-1">หมวดหมู่:</span>
          {activeMainTab === 'reports' ? (
            <>
              <button
                onClick={() => setSubTypeFilter('all')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${
                  subTypeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setSubTypeFilter('product')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold flex items-center gap-1 ${
                  subTypeFilter === 'product' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Package size={12} /> สินค้า
              </button>
              <button
                onClick={() => setSubTypeFilter('wanted_post')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold flex items-center gap-1 ${
                  subTypeFilter === 'wanted_post' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <MessageSquareText size={12} /> โพสต์ตามหา
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setSubTypeFilter('all')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${
                  subTypeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setSubTypeFilter('แจ้งโกง')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${
                  subTypeFilter === 'แจ้งโกง' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                แจ้งโกง/มิจฉาชีพ
              </button>
              <button
                onClick={() => setSubTypeFilter('ระบบ')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${
                  subTypeFilter === 'ระบบ' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                ปัญหาระบบ
              </button>
              <button
                onClick={() => setSubTypeFilter('ทั่วไป')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold ${
                  subTypeFilter === 'ทั่วไป' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                สอบถามทั่วไป
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Content List ─── */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-xs">
          {activeMainTab === 'reports' ? (
            <ShieldAlert size={36} className="mx-auto text-gray-300 mb-2.5" />
          ) : (
            <Headset size={36} className="mx-auto text-gray-300 mb-2.5" />
          )}
          <p className="text-sm font-bold text-gray-600">
            {activeMainTab === 'reports' ? 'ไม่พบรายงานสินค้าหรือโพสต์ในตัวกรองนี้' : 'ยังไม่มีข้อความแจ้งปัญหาในตัวกรองนี้'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {statusFilter === 'pending'
              ? 'ไม่มีรายการที่ค้างการตรวจสอบ ระบบทำงานเรียบร้อยดี'
              : 'ยังไม่มีประวัติการดำเนินการในตัวกรองที่เลือก'}
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredItems.map((item) => {
            const isPending = (item.status || 'pending') === 'pending';
            const isResolved = item.status === 'resolved';
            const isDismissed = item.status === 'dismissed';
            const itemType = item.target_type || item.type || 'product';
            const isPost = itemType === 'wanted_post';
            const isSupport = itemType === 'support_ticket' || activeMainTab === 'support';
            const title = item.target_title || item.targetTitle || (isSupport ? 'แจ้งปัญหาจากศูนย์ช่วยเหลือ' : `รายการ #${item.target_id || ''}`);
            const reporter = item.reporter_name || item.reporterName || 'ผู้ใช้ในระบบ';
            const reporterEmail = item.reporter_email || item.reporterEmail || '';
            const targetUser = item.target_user_name || item.targetUser || '-';
            const category = item.category || (isSupport ? 'สอบถามทั่วไป' : 'พฤติกรรมไม่เหมาะสม');
            const description = item.description || '';
            const createdAt = item.created_at || item.createdAt;
            const adminNote = item.admin_note || item.adminNote;
            const isLoading = actionLoadingId === item.id;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-white p-5 space-y-3.5 shadow-xs transition-all ${
                  isPending ? 'border-orange-200 hover:border-orange-300' : 'border-gray-200 opacity-90'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Type Badge */}
                      {isSupport ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 text-[#f95721] border border-orange-200 px-2.5 py-0.5 text-[11px] font-bold">
                          <Headset size={11} /> ศูนย์ช่วยเหลือ & ติดต่อแอดมิน
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-bold ${
                            isPost
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {isPost ? <MessageSquareText size={11} /> : <Package size={11} />}
                          {isPost ? 'โพสต์ตามหาสินค้า' : 'สินค้าลงขาย'}
                        </span>
                      )}

                      {/* Category Badge */}
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-[11px] font-bold">
                        <Tag size={11} /> {category}
                      </span>

                      {/* Timestamp */}
                      {createdAt && (
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <Clock size={11} />
                          {new Date(createdAt).toLocaleString('th-TH')}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-extrabold text-gray-900 mt-1">{title}</h3>

                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <User size={12} className="text-gray-400" />
                        ผู้แจ้งเรื่อง: <strong className="text-gray-800">{reporter}</strong>
                        {reporterEmail ? ` (${reporterEmail})` : ''}
                      </span>

                      {!isSupport && (
                        <>
                          <span>•</span>
                          <span>
                            ผู้ถูกรายงาน: <strong className="text-gray-800">{targetUser}</strong>
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold border ${
                      isPending
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : isResolved
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {isPending ? '⏳ รอดำเนินการ' : isResolved ? '✅ จัดการแล้ว' : '⚪ เพิกเฉย'}
                  </span>
                </div>

                {/* Description Box */}
                <div className="rounded-xl bg-orange-50/40 p-3.5 text-xs text-gray-700 space-y-1.5 border border-orange-100/80">
                  <p className="font-bold text-gray-800 flex items-center gap-1">
                    <FileText size={13} className="text-[#f95721]" />
                    {isSupport ? 'ข้อความแจ้งปัญหา / ติดต่อกลับ:' : 'รายละเอียดการรายงาน:'}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed text-gray-600">
                    {description || 'ไม่มีรายละเอียดเพิ่มเติม'}
                  </p>

                  {adminNote && (
                    <div className="mt-2 pt-2 border-t border-orange-100 text-[11px] font-semibold text-emerald-700">
                      📌 บันทึกการจัดการแอดมิน: {adminNote}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {isPending && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    {/* ปุ่มสำหรับแท็บรายงานสินค้า/โพสต์ */}
                    {!isSupport && (
                      <button
                        type="button"
                        onClick={() => handleTakeDown(item)}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition-colors shadow-2xs disabled:opacity-50"
                      >
                        <Trash2 size={13} />
                        ปลด/ลบ{isPost ? 'โพสต์' : 'สินค้า'}ออกจากระบบทันที
                      </button>
                    )}

                    {/* ปุ่มสำหรับแท็บแจ้งปัญหาศูนย์ช่วยเหลือ */}
                    {isSupport && (
                      <div className="text-[11px] text-gray-500 flex items-center gap-1">
                        <AlertCircle size={13} className="text-orange-500" />
                        ติดต่อกลับผู้ใช้ตามช่องทางที่ระบุ แล้วกดทำเครื่องหมายจัดการแล้ว
                      </div>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={() => handleResolve(item, 'resolved')}
                        disabled={isLoading}
                        className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-600 transition-colors shadow-2xs disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        ทำเครื่องหมายจัดการแล้ว
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResolve(item, 'dismissed')}
                        disabled={isLoading}
                        className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        <XCircle size={13} />
                        เพิกเฉย
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!takeDownReport}
        title={`ยืนยันการปลดและลบ${(takeDownReport?.target_type || takeDownReport?.type) === 'wanted_post' ? 'โพสต์ตามหา' : 'สินค้า'}`}
        message={`ต้องการปลดและลบ "${takeDownReport?.target_title || takeDownReport?.targetTitle || takeDownReport?.target_id}" ออกจากระบบทันทีใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ปลดและลบรายการ"
        cancelText="ยกเลิก"
        variant="danger"
        onConfirm={confirmTakeDown}
        onCancel={() => setTakeDownReport(null)}
      />
    </div>
  );
}
