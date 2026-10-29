import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  CalendarClock,
  RotateCcw,
  ShoppingBag,
  Clock,
  ChevronRight,
  X,
} from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Link } from 'react-router-dom';

// ── แปลง string เวลาจาก backend ให้ตีความเป็น UTC เสมอ ──
// คอลัมน์ created_at ในฐานข้อมูลเป็น "timestamp without time zone" แต่ backend insert
// ด้วย new Date().toISOString() (เวลา UTC) ทำให้ค่าที่ query กลับมาไม่มี "Z" ต่อท้าย
// (เช่น "2026-09-21T11:50:45.586" แทนที่จะเป็น "...586Z")
// ถ้าปล่อยให้ `new Date(...)` parse ตรงๆ เบราว์เซอร์จะเข้าใจผิดว่าเป็นเวลา local (ไทย +7)
// ทำให้คำนวณเวลาผิดไปพอดี 7 ชั่วโมงเสมอ ฟังก์ชันนี้เติม "Z" ให้ชัดเจนว่าเป็น UTC ก่อน parse
function parseAsUtc(dateStr) {
  if (!dateStr) return null;
  const hasTimezone = /Z$|[+-]\d{2}:?\d{2}$/.test(dateStr);
  const normalized = dateStr.includes(' ') && !dateStr.includes('T')
    ? dateStr.replace(' ', 'T')
    : dateStr;
  return new Date(hasTimezone ? normalized : `${normalized}Z`);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const date = parseAsUtc(dateStr);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const dropdownRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  // อ่าน array โดยตรงจาก state (ไม่ใช่ getter function) เพื่อให้ Zustand detect การเปลี่ยนแปลงและ re-render
  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.notifications.filter((n) => !n.read).length);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearNotifications = useNotificationStore((s) => s.clearNotifications);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const getIconConfig = (type) => {
    switch (type) {
      case 'meetup':
        return {
          icon: CalendarClock,
          bg: 'bg-orange-50 text-orange-600 border border-orange-200',
          badge: 'นัดรับสินค้า',
        };
      case 'return':
        return {
          icon: RotateCcw,
          bg: 'bg-rose-50 text-rose-600 border border-rose-200',
          badge: 'การคืนสินค้า',
        };
      case 'product':
        return {
          icon: ShoppingBag,
          bg: 'bg-emerald-50 text-emerald-600 border border-emerald-200',
          badge: 'สินค้า',
        };
      default:
        return {
          icon: Bell,
          bg: 'bg-blue-50 text-blue-600 border border-blue-200',
          badge: 'ทั่วไป',
        };
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          isOpen
            ? 'bg-white/20 text-white'
            : 'text-white/90 hover:bg-white/15 hover:text-white'
        }`}
        aria-label="การแจ้งเตือน"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-white text-[9px] font-extrabold text-brand-500 px-1 border-2 border-brand-500 shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop on mobile screens */}
          <div
            className="fixed inset-0 z-40 bg-black/40 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown Container */}
          <div
            style={{ width: 'min(380px, calc(100vw - 24px))' }}
            className="fixed left-3 right-3 top-16 z-50 sm:absolute sm:inset-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2 rounded-2xl bg-white shadow-2xl border border-surface-border overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[32rem]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3 bg-surface-muted/50 shrink-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-ink-900 text-sm">การแจ้งเตือน</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-brand-100 text-brand-700 py-0.5 px-2 text-xs font-semibold">
                    {unreadCount} ใหม่
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {notifications.length > 0 && unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllAsRead(user?.id ?? 'me')}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-brand-50"
                  >
                    <CheckCheck size={13} />
                    <span>อ่านทั้งหมด</span>
                  </button>
                )}
                <Link
                  to="/notifications"
                  onClick={() => setIsOpen(false)}
                  className="text-xs font-semibold text-ink-500 hover:text-brand-600 flex items-center gap-0.5 px-2 py-1 rounded hover:bg-surface-muted"
                >
                  <span>ดูทั้งหมด</span>
                  <ChevronRight size={13} />
                </Link>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="sm:hidden text-ink-400 hover:text-ink-700 p-1"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1 overscroll-contain divide-y divide-surface-border bg-white">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-ink-300 mb-2">
                    <Bell size={24} />
                  </div>
                  <p className="text-sm font-bold text-ink-800">ไม่มีการแจ้งเตือนในขณะนี้</p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    ความคืบหน้านัดรับ หรือข้อความต่างๆ จะแจ้งเตือนที่นี่
                  </p>
                </div>
              ) : (
                notifications.map((n) => {
                  const { icon: Icon, bg, badge } = getIconConfig(n.type);
                  return (
                    <Link
                      key={n.id}
                      to={n.link ?? '#'}
                      onClick={() => {
                        markAsRead(n.id);
                        setIsOpen(false);
                      }}
                      className={`flex items-start gap-3 px-4 py-3.5 hover:bg-surface-muted transition-colors ${
                        !n.read ? 'bg-brand-50/40' : 'bg-white'
                      }`}
                    >
                      <div className={`mt-0.5 flex shrink-0 h-8 w-8 items-center justify-center rounded-xl ${bg}`}>
                        <Icon size={15} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${bg}`}>
                            {badge}
                          </span>
                          <span className="text-[10px] text-ink-400 flex items-center gap-1 font-medium">
                            <Clock size={10} />
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>

                        <p className={`text-xs sm:text-sm ${!n.read ? 'font-bold text-ink-900' : 'font-semibold text-ink-700'}`}>
                          {n.title}
                        </p>

                        <p className="text-xs text-ink-500 mt-0.5 line-clamp-2 leading-relaxed break-words">
                          {n.message}
                        </p>
                      </div>

                      {!n.read && (
                        <div className="flex items-center justify-center self-center shrink-0">
                          <span className="h-2 w-2 rounded-full bg-brand-500 ring-2 ring-brand-100" />
                        </div>
                      )}
                    </Link>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="border-t border-surface-border p-2 bg-surface-muted/20 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="w-full py-1.5 text-xs font-semibold text-ink-500 hover:text-red-600 flex items-center justify-center gap-1.5 hover:bg-surface-muted rounded-xl transition-colors"
                >
                  <Trash2 size={13} /> ล้างการแจ้งเตือนทั้งหมด
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Confirm Clear All Notifications Dialog */}
      <ConfirmDialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          clearNotifications(user?.id ?? 'me');
          setShowClearConfirm(false);
        }}
        title="ล้างการแจ้งเตือนทั้งหมด?"
        description="การแจ้งเตือนทั้งหมดจะถูกลบออกจากรายการของคุณอย่างถาวรและไม่สามารถกู้คืนได้"
        confirmLabel="ล้างทั้งหมด"
        cancelLabel="ยกเลิก"
        variant="danger"
      />
    </div>
  );
}