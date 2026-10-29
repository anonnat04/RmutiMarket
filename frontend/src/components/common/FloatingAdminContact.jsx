import { useState } from 'react';
import { Headset, X, Send, CheckCircle2, QrCode, ArrowLeft } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useReportStore } from '@/store/reportStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import { TermsModal } from '@/components/views/TermsModal';
import iconRules from '@/assets/iconrlues.png';
import qrCodeImg from '@/assets/QR.jpg';

export function FloatingAdminContact() {
  const [open, setOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [view, setView] = useState('form'); // 'form' | 'qr'
  const [issueType, setIssueType] = useState('general');
  const [message, setMessage] = useState('');
  const [sentSuccess, setSentSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || submitting) return;

    setSubmitting(true);

    const user = useAuthStore.getState().user;
    const catLabel =
      issueType === 'scam'
        ? 'แจ้งโกง/มิจฉาชีพ'
        : issueType === 'system'
        ? 'แจ้งปัญหาระบบ'
        : 'สอบถามทั่วไป';
    const reporterName =
      user?.name || user?.full_name || user?.display_name || user?.username || 'ผู้ใช้ในระบบ';
    const reporterEmail = user?.email || 'student@rmuti.ac.th';

    try {
      await api.createReport({
        targetType: 'support_ticket',
        targetId: Date.now(),
        targetTitle: `ศูนย์ช่วยเหลือ: ${catLabel}`,
        targetUserName: '-',
        category: catLabel,
        description: message.trim(),
      });
    } catch (err) {
      console.warn('API support_ticket error (saved to localStore):', err?.message);
    }

    useReportStore.getState().submitReport({
      targetType: 'support_ticket',
      targetId: Date.now(),
      targetTitle: `ศูนย์ช่วยเหลือ: ${catLabel}`,
      targetUser: 'ฝ่ายสนับสนุน',
      reporterName,
      reporterEmail,
      category: catLabel,
      description: message.trim(),
    });

    addNotification({
      userId: 'me',
      title: '📩 ส่งเรื่องถึงแอดมินเรียบร้อยแล้ว',
      message: `แอดมินได้รับเรื่องเกี่ยวกับ "${catLabel}" แล้ว จะตรวจสอบในหน้าจัดการและติดต่อกลับโดยเร็ว`,
      type: 'security',
      link: '/notifications',
    });

    setSubmitting(false);
    setSentSuccess(true);
    setTimeout(() => {
      setMessage('');
      setSentSuccess(false);
      setOpen(false);
    }, 2000);
  };

  return (
    <>
      {/* Floating Action Buttons Container */}
      <div className="fixed bottom-20 md:bottom-6 right-3.5 md:right-6 z-40 flex flex-col items-center gap-2.5">
        {/* Rules Button */}
        <div className="group relative">
          {/* Tooltip */}
          <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1 text-[11px] font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 select-none">
            กฎของเว็บไซต์
          </span>

          <button
            type="button"
            onClick={() => setRulesOpen(true)}
            className="flex items-center justify-center w-11 h-11 sm:w-14 sm:h-14 md:w-16 md:h-16 hover:scale-110 active:scale-95 transition-all duration-200 drop-shadow-md hover:drop-shadow-xl"
            aria-label="กฎของเว็บไซต์"
          >
            <img
              src={iconRules}
              alt="กฎของเว็บไซต์"
              className="w-full h-full object-contain"
            />
          </button>
        </div>

        {/* Floating Action Button — Admin Contact */}
        <div className="group relative">
          {/* Tooltip */}
          <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1 text-[11px] font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 select-none">
            ติดต่อแอดมิน
          </span>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-r from-[#ff5722] to-[#f4511e] text-white shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200"
            aria-label="ติดต่อแอดมิน"
          >
            <div className="relative">
              <Headset size={20} className="sm:w-[22px] sm:h-[22px]" />
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Rules Modal */}
      <TermsModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
      />

      {/* Admin Help Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className={`px-5 py-4 text-white flex items-center justify-between transition-colors duration-200 ${
                view === 'qr'
                  ? 'bg-gradient-to-r from-emerald-500 to-green-600'
                  : 'bg-gradient-to-r from-[#ff5722] to-[#f4511e]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {view === 'qr' ? (
                  <button
                    type="button"
                    onClick={() => setView('form')}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 hover:bg-white/30 transition-colors cursor-pointer"
                    aria-label="ย้อนกลับ"
                  >
                    <ArrowLeft size={18} />
                  </button>
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-xs">
                    <Headset size={20} />
                  </div>
                )}
                <div>
                  <h3 className="text-base font-extrabold leading-tight">
                    {view === 'qr' ? 'กลุ่มไลน์แจ้งปัญหา & ช่วยเหลือ' : 'ศูนย์ช่วยเหลือ & ติดต่อแอดมิน'}
                  </h3>
                  <p className="text-[11px] text-white/85">
                    {view === 'qr' ? 'สแกนเพื่อเข้าร่วมกลุ่ม Line OpenChat' : 'ทีมงาน RmutiMarket พร้อมดูแลตลอดเวลา'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setView('form');
                }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                aria-label="ปิด"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4 overflow-y-auto">
              {view === 'qr' ? (
                <div className="flex flex-col items-center gap-4 py-2 text-center animate-in fade-in duration-200">
                  <div className="p-2.5 bg-white rounded-2xl shadow-md border-2 border-emerald-100">
                    <img
                      src={qrCodeImg}
                      alt="LINE Group QR Code"
                      className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-xl"
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-800">
                      สแกน QR Code ด้วยแอป LINE
                    </p>
                    <p className="text-[11px] text-gray-500 leading-relaxed max-w-xs">
                      เข้าร่วมกลุ่มแจ้งปัญหา ข้อสงสัย หรือติดต่อทีมงาน RmutiMarket พร้อมดูแลตลอดเวลา
                    </p>
                  </div>

                  <div className="w-full flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setView('form')}
                      className="flex-1 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 transition-colors cursor-pointer"
                    >
                      กลับไปหน้าแจ้งปัญหา
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setView('form');
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-colors cursor-pointer shadow-xs"
                    >
                      ปิดหน้าต่าง
                    </button>
                  </div>
                </div>
              ) : sentSuccess ? (
                <div className="py-8 text-center space-y-2">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="text-base font-bold text-ink-900">ส่งข้อความถึงแอดมินสำเร็จ!</h4>
                  <p className="text-xs text-gray-500">ทีมงานกำลังตรวจสอบและจะติดต่อกลับโดยเร็วที่สุด</p>
                </div>
              ) : (
                <>
                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    {/* Issue Type */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">เรื่องที่ต้องการแจ้ง</label>
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        {[
                          { key: 'general', label: 'สอบถามทั่วไป' },
                          { key: 'scam', label: 'แจ้งโกง/มิจฉาชีพ' },
                          { key: 'system', label: 'แจ้งปัญหาระบบ' },
                        ].map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setIssueType(t.key)}
                            className={`rounded-xl py-2 px-1 text-center font-bold transition-all border ${
                              issueType === t.key
                                ? 'bg-orange-50 text-[#f95721] border-orange-300 shadow-xs'
                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Message details */}
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">
                        รายละเอียดปัญหา <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="อธิบายปัญหาที่พบ เช่น ชื่อผู้ใช้ที่ต้องการรายงาน หรือปัญหาที่เกิดขึ้น..."
                        className="w-full rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs text-ink-900 outline-none focus:border-[#f95721] focus:bg-white transition-all"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || !message.trim()}
                      className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#f95721] py-2.5 text-xs font-bold text-white hover:bg-orange-600 active:scale-98 transition-all disabled:opacity-50 shadow-md cursor-pointer"
                    >
                      <Send size={14} />
                      {submitting ? 'กำลังส่งข้อมูล...' : 'ส่งเรื่องถึงแอดมิน'}
                    </button>
                  </form>

                  {/* Quick Contact Links */}
                  <div className="border-t border-gray-100 pt-3 space-y-2 text-xs">
                    <p className="text-[11px] font-bold text-gray-400">ช่องทางติดต่อด่วนอื่นๆ</p>
                    <button
                      type="button"
                      onClick={() => setView('qr')}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80 hover:bg-emerald-100/80 transition-all cursor-pointer group text-left shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-white font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
                          L
                        </span>
                        <div>
                          <p className="font-bold text-gray-800 text-xs">แจ้งปัญหาผ่านกลุ่มไลน์</p>
                          <p className="text-[10px] text-gray-500">แตะเพื่อดู QR Code สแกนเข้ากลุ่ม</p>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs group-hover:bg-emerald-600 group-hover:text-white transition-all">
                        <QrCode size={13} />
                        เข้ากลุ่ม
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
