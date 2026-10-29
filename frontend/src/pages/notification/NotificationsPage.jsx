import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, MessageCircle, CalendarClock, ShieldAlert, Heart, Trash2, ArrowLeft } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';

const typeIcons = {
  chat: MessageCircle,
  meetup: CalendarClock,
  security: ShieldAlert,
  wishlist: Heart,
  default: Bell
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const notifications = useNotificationStore((s) => s.notifications);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearNotifications = useNotificationStore((s) => s.clearNotifications);

  const [filter, setFilter] = useState('all');

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.read;
    if (filter === 'meetup') return n.type === 'meetup';
    if (filter === 'chat') return n.type === 'chat';
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-black text-ink-900 flex items-center gap-2">
              <Bell size={20} className="text-[#f95721]" />
              การแจ้งเตือน
            </h1>
            <p className="text-xs text-gray-500">
              แจ้งเตือนข้อความ นัดรับ และกิจกรรมทั้งหมดในระบบ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={markAllAsRead}
            className="inline-flex items-center gap-1 rounded-xl bg-orange-50 px-3 py-1.5 text-xs font-bold text-[#f95721] hover:bg-orange-100 transition-colors"
          >
            <CheckCheck size={14} />
            อ่านทั้งหมด
          </button>
          {notifications.length > 0 && (
            <button
              onClick={clearNotifications}
              className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 size={14} />
              ล้าง
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { key: 'all', label: `ทั้งหมด (${notifications.length})` },
          { key: 'unread', label: `ยังไม่ได้อ่าน (${notifications.filter((n) => !n.read).length})` },
          { key: 'meetup', label: 'การนัดรับ' },
          { key: 'chat', label: 'ข้อความแชท' }
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
              filter === tab.key
                ? 'bg-[#f95721] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const Icon = typeIcons[item.type] || typeIcons.default;
          return (
            <div
              key={item.id}
              onClick={() => markAsRead(item.id)}
              className={`flex items-start gap-3.5 rounded-2xl border p-4 transition-all cursor-pointer ${
                item.read
                  ? 'bg-white border-gray-100 text-gray-600'
                  : 'bg-orange-50/50 border-orange-200/80 shadow-xs'
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  item.read ? 'bg-gray-100 text-gray-500' : 'bg-orange-100 text-[#f95721]'
                }`}
              >
                <Icon size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-sm ${item.read ? 'font-medium text-ink-900' : 'font-bold text-[#f95721]'}`}>
                    {item.title}
                  </h3>
                  <span className="text-[11px] text-gray-400 shrink-0">
                    {item.time || 'ไม่นานมานี้'}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">{item.message}</p>
                {item.link && (
                  <Link
                    to={item.link}
                    className="mt-2 inline-block text-xs font-bold text-[#f95721] hover:underline"
                  >
                    ดูรายละเอียด →
                  </Link>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
            <Bell size={36} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-bold text-gray-700">ไม่มีการแจ้งเตือน</p>
            <p className="text-xs text-gray-400 mt-1">คุณไม่มีการแจ้งเตือนใหม่ในหมวดหมู่นี้</p>
          </div>
        )}
      </div>
    </div>
  );
}
