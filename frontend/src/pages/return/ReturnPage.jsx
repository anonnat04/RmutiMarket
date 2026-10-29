import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle, RotateCcw, Clock, Calendar, ArrowLeft, ShieldCheck, HelpCircle, FileText, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMeetupStore } from '@/store/meetupStore';
import { useNotificationStore } from '@/store/notificationStore';
import { Button } from '@/components/common/Button';
import { EmptyState } from '@/components/common/EmptyState';
import { ReturnModal } from '@/components/meetup/ReturnModal';

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function ReturnPage() {
  const user = useAuthStore((s) => s.user);
  const meetups = useMeetupStore((s) => s.meetups);
  const requestReturn = useMeetupStore((s) => s.requestReturn);
  const respondToReturn = useMeetupStore((s) => s.respondToReturn);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [selectedMeetup, setSelectedMeetup] = useState(null);
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'eligible'

  const myId = user?.id ?? 'me';
  const myMeetups = meetups.filter((m) => m.buyerId === myId || m.sellerId === myId);

  // คำร้องขอคืนสินค้า
  const returnRequests = myMeetups.filter((m) =>
    ['return_requested', 'return_accepted', 'return_rejected'].includes(m.status)
  );

  // รายการที่สำเร็จแล้วยังอยู่ใน 3 วัน (สามารถขอคืนได้)
  const eligibleForReturn = myMeetups.filter((m) => {
    if (m.status !== 'completed' || m.buyerId !== myId) return false;
    if (m.allowsReturn === false) return false; // ผู้ขายระบุไม่รับคืน
    if (!m.completedAt) return true;
    const returnLimitMs = (m.returnPolicyDays || 3) * 24 * 60 * 60 * 1000;
    const timeSinceCompleted = Date.now() - new Date(m.completedAt).getTime();
    return timeSinceCompleted <= returnLimitMs;
  });

  const handleReturnSubmit = (reason) => {
    if (!selectedMeetup) return;
    requestReturn(selectedMeetup.id, reason);

    // ⚠️ หักคะแนนผู้ขาย 1 ดาวทันทีเมื่อมีคำร้องขอคืนสินค้าตำหนิไม่ตรง
    import('@/store/reviewStore').then(({ useReviewStore }) => {
      useReviewStore.getState().applyReturnPenalty({
        sellerId: selectedMeetup.sellerId,
        buyerName: selectedMeetup.buyerName,
        productTitle: selectedMeetup.productTitle,
        returnReason: reason,
        meetupId: selectedMeetup.id,
      });
    });

    // แจ้งเตือนผู้ขาย
    addNotification({
      userId: selectedMeetup.sellerId,
      title: '⚠️ มีคำร้องขอคืนสินค้าและถูกหัก 1 ดาว',
      message: `ผู้ซื้อขอคืนสินค้า "${selectedMeetup.productTitle}" เนื่องจาก: ${reason} (ระบบได้บันทึกคะแนน 1 ดาวในประวัติความน่าเชื่อถือแล้ว)`,
      type: 'return',
      link: '/returns',
    });

    setSelectedMeetup(null);
  };

  const handleSellerRespond = (meetup, action) => {
    respondToReturn(meetup.id, action);

    // แจ้งเตือนผู้ซื้อ
    addNotification({
      userId: meetup.buyerId,
      title: action === 'accept' ? '✅ ยอมรับคำร้องขอคืนสินค้า' : '❌ ปฏิเสธคำร้องขอคืนสินค้า',
      message: `คำร้องขอคืนสินค้า "${meetup.productTitle}" ได้รับการตอบรับเรียบร้อยแล้ว`,
      type: 'return',
      link: '/returns',
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border pb-4">
        <div className="flex items-center gap-3">
          <Link to="/meetups" className="rounded-xl border border-surface-border p-2 text-ink-700 hover:bg-surface-muted transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ink-900 flex items-center gap-2">
              <RotateCcw className="text-brand-500" size={24} />
              ระบบขอคืนสินค้า & คืนเงิน (Return Center)
            </h1>
            <p className="text-xs text-ink-500">ยื่นคำร้องและติดตามสถานะการคืนสินค้าภายใน 24 ชั่วโมงหลังรับสินค้า</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Content (2 Columns Layout with Right Sidebar) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        
        {/* ─── LEFT COLUMN: Requests & Eligible Items ────────────────────── */}
        <div className="space-y-5">
          {/* Warning Policy Box */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-900 leading-relaxed space-y-1.5 shadow-sm">
            <div className="font-bold flex items-center gap-1.5 text-amber-800 text-sm">
              <AlertTriangle size={16} /> เงื่อนไขและนโยบายการขอคืนสินค้า
            </div>
            <p>1. สามารถยื่นคำร้องขอคืนสินค้าได้ <strong>ภายใน 24 ชั่วโมง</strong> หลังจากทั้งสองฝ่ายกดยืนยันรับส่งมอบสินค้าเสร็จสิ้น</p>
            <p>2. สินค้าต้องมีตำหนิ รอยชำรุด หรือไม่ตรงตามรายละเอียดที่ผู้ขายลงไว้เท่านั้น</p>
            <p>3. เมื่อส่งคำร้อง ผู้ขายจะพิจารณาเพื่อตกลงนัดหมายรับสินค้าคืนและคืนเงินให้แก่ผู้ซื้อ</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-surface-border pb-1">
            <button
              onClick={() => setActiveTab('requests')}
              className={`pb-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'requests'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              รายการคำร้องขอคืน ({returnRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('eligible')}
              className={`pb-2.5 px-4 text-sm font-bold border-b-2 transition-colors ${
                activeTab === 'eligible'
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-ink-500 hover:text-ink-700'
              }`}
            >
              สินค้าที่อยู่ในระยะเวลาขอคืน ({eligibleForReturn.length})
            </button>
          </div>

          {/* Tab Contents */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              {returnRequests.length === 0 ? (
                <EmptyState
                  title="ไม่มีคำร้องขอคืนสินค้า"
                  description="คุณไม่มีคำร้องขอคืนสินค้าที่กำลังดำเนินการ"
                  icon={RotateCcw}
                />
              ) : (
                returnRequests.map((m) => {
                  const role = m.buyerId === myId ? 'buyer' : 'seller';
                  const otherName = role === 'buyer' ? m.sellerName : m.buyerName;

                  return (
                    <div key={m.id} className="cm-card p-5 space-y-3 shadow-sm border border-surface-border">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-ink-500">{role === 'buyer' ? 'ผู้ขาย' : 'ผู้ซื้อ'}: {otherName}</span>
                          <h3 className="text-base font-bold text-ink-900 mt-0.5">{m.productTitle}</h3>
                        </div>
                        {m.status === 'return_requested' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                            <Clock size={13} /> รอการพิจารณา
                          </span>
                        )}
                        {m.status === 'return_accepted' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                            <CheckCircle2 size={13} /> ยอมรับการคืน
                          </span>
                        )}
                        {m.status === 'return_rejected' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
                            <XCircle size={13} /> ปฏิเสธคำร้อง
                          </span>
                        )}
                      </div>

                      <div className="rounded-xl bg-surface-muted/70 p-3.5 text-xs text-ink-700 space-y-1">
                        <p className="font-semibold text-ink-900">รายละเอียดปัญหาที่ระบุ:</p>
                        <p className="text-ink-600 leading-relaxed">{m.returnReason || 'ไม่ได้ระบุเหตุผลเพิ่มเติม'}</p>
                        {m.returnRequestedAt && (
                          <p className="text-[10px] text-ink-400 mt-1.5 font-medium">ส่งคำร้องเมื่อ: {formatDate(m.returnRequestedAt)}</p>
                        )}
                      </div>

                      {/* Seller Action Controls */}
                      {m.status === 'return_requested' && role === 'seller' && (
                        <div className="flex gap-2 pt-2 border-t border-surface-border">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white flex-1"
                            onClick={() => handleSellerRespond(m, 'accept')}
                          >
                            ✅ ยอมรับการคืนสินค้า & คืนเงิน
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50 flex-1"
                            onClick={() => handleSellerRespond(m, 'reject')}
                          >
                            ❌ ปฏิเสธคำร้อง
                          </Button>
                        </div>
                      )}

                      {m.status === 'return_requested' && role === 'buyer' && (
                        <p className="text-xs text-orange-600 font-medium text-center bg-orange-50 py-2 rounded-lg border border-orange-100">
                          ⏳ กำลังรอผู้ขายพิจารณาคำร้องขอคืนสินค้าของคุณ
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'eligible' && (
            <div className="space-y-4">
              {eligibleForReturn.length === 0 ? (
                <EmptyState
                  title="ไม่มีรายการสินค้าที่ขอคืนได้"
                  description="ไม่มีรายการที่เพิ่งส่งมอบสำเร็จภายใน 24 ชั่วโมง"
                  icon={Clock}
                />
              ) : (
                eligibleForReturn.map((m) => (
                  <div key={m.id} className="cm-card p-4 flex items-center justify-between shadow-sm border border-surface-border">
                    <div>
                      <h3 className="font-bold text-ink-900 text-sm">{m.productTitle}</h3>
                      <p className="text-xs text-ink-500 flex items-center gap-2 mt-1">
                        <span>ผู้ขาย: {m.sellerName}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={12} /> ส่งมอบสำเร็จเมื่อ: {formatDate(m.completedAt)}
                        </span>
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => setSelectedMeetup(m)}
                    >
                      <AlertTriangle size={14} className="mr-1" /> ยื่นขอคืนสินค้า
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ─── RIGHT SIDEBAR PANEL: Return Status & Guarantees ────────────── */}
        <div className="space-y-4">
          
          {/* Widget 1: 24h Buyer Protection Banner */}
          <div className="cm-card p-5 bg-gradient-to-br from-brand-500 to-orange-500 text-white space-y-3 shadow-md">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase text-white backdrop-blur-sm">
                24H Protection
              </span>
              <ShieldCheck size={22} className="text-white/90" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">คุ้มครองผู้ซื้อ 24 ชม.</h3>
              <p className="text-xs text-white/90 mt-1 leading-relaxed">
                มั่นใจทุกการซื้อขาย หากสินค้ามีตำหนิไม่ตรงตามที่ตกลง สามารถยื่นเรื่องขอคืนเงิน/คืนสินค้าได้ทันทีภายใน 24 ชม.
              </p>
            </div>
          </div>

          {/* Widget 2: Status Overview Card */}
          <div className="cm-card p-4 space-y-3 border border-surface-border">
            <h4 className="text-xs font-bold text-ink-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} className="text-brand-500" /> สรุปสถานะการคืนสินค้า
            </h4>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-orange-50 p-2.5 border border-orange-100">
                <span className="block text-lg font-extrabold text-orange-600">
                  {returnRequests.filter(r => r.status === 'return_requested').length}
                </span>
                <span className="text-[10px] font-semibold text-orange-800">รอพิจารณา</span>
              </div>

              <div className="rounded-xl bg-green-50 p-2.5 border border-green-100">
                <span className="block text-lg font-extrabold text-green-600">
                  {returnRequests.filter(r => r.status === 'return_accepted').length}
                </span>
                <span className="text-[10px] font-semibold text-green-800">ยอมรับแล้ว</span>
              </div>

              <div className="rounded-xl bg-red-50 p-2.5 border border-red-100">
                <span className="block text-lg font-extrabold text-red-600">
                  {returnRequests.filter(r => r.status === 'return_rejected').length}
                </span>
                <span className="text-[10px] font-semibold text-red-800">ปฏิเสธ</span>
              </div>
            </div>
          </div>

          {/* Widget 3: Return Checklist & FAQ */}
          <div className="cm-card p-4 space-y-3 border border-surface-border text-xs">
            <h4 className="font-bold text-ink-900 flex items-center gap-1.5">
              <HelpCircle size={15} className="text-brand-500" /> คำถามที่พบบ่อย
            </h4>
            
            <div className="space-y-2 text-ink-600">
              <details className="group cursor-pointer rounded-lg bg-surface-muted/50 p-2">
                <summary className="font-semibold text-ink-800 flex items-center justify-between">
                  จะได้รับเงินคืนอย่างไร?
                  <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-1.5 text-[11px] text-ink-500 leading-relaxed">
                  เมื่อผู้ขายยอมรับคำร้อง ให้นัดหมายเพื่อส่งมอบสินค้าคืนและรับเงินคืนโดยตรงที่จุดนัดรับในมหาวิทยาลัย
                </p>
              </details>

              <details className="group cursor-pointer rounded-lg bg-surface-muted/50 p-2">
                <summary className="font-semibold text-ink-800 flex items-center justify-between">
                  ถ้าเกิน 24 ชม. แล้วจะขอคืนได้ไหม?
                  <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                </summary>
                <p className="mt-1.5 text-[11px] text-ink-500 leading-relaxed">
                  เมื่อเกิน 24 ชม. ระบบจะปิดคำร้องอัตโนมัติ ต้องทักแชตตกลงกับผู้ขายโดยตรง
                </p>
              </details>
            </div>
          </div>

          {/* Widget 4: Quick Action back to Chat */}
          <Link
            to="/chat"
            className="flex items-center justify-between rounded-2xl border border-surface-border bg-white p-3.5 text-xs font-bold text-ink-800 hover:bg-surface-muted transition-colors shadow-sm"
          >
            <span className="flex items-center gap-2">
              💬 แชตพูดคุยกับคู่ค้า
            </span>
            <ChevronRight size={14} className="text-ink-400" />
          </Link>
        </div>

      </div>

      <ReturnModal
        open={!!selectedMeetup}
        onClose={() => setSelectedMeetup(null)}
        onSubmit={handleReturnSubmit}
      />
    </div>
  );
}
