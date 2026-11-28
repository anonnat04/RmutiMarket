import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, MessageCircle, X } from 'lucide-react';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { buildNotificationLink, useNotificationStore } from '@/store/notificationStore';

export function NotificationToast() {
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const markAsRead = useNotificationStore((s) => s.markAsRead);

  useEffect(() => {
    if (!token) {
      setToasts([]);
      return undefined;
    }

    const socket = getSocket();
    const handleNewNotification = (raw) => {
      if (!raw) return;
      const type = String(raw.type || '').toLowerCase();
      const refId = raw.reference_id || raw.referenceId || raw.ref_id;

      // ถ้าเปิดหน้าแชทห้องนี้อยู่แล้ว ไม่ต้องเด้ง toast ข้อความแชทซ้ำ
      if ((type === 'chat_message' || type === 'message') && location.pathname === '/chat') {
        const currentConvId = new URLSearchParams(location.search).get('conversationId');
        if (!refId || String(currentConvId) === String(refId)) {
          return;
        }
      }

      const toastId = raw.id != null ? String(raw.id) : `toast-${Date.now()}-${Math.random()}`;
      const link = buildNotificationLink(raw);

      setToasts((prev) => {
        if (prev.some((t) => t.toastId === toastId)) return prev;
        return [
          {
            toastId,
            notifId: raw.id,
            type,
            title: raw.title || 'การแจ้งเตือนใหม่',
            message: raw.message || '',
            link,
          },
          ...prev,
        ].slice(0, 3);
      });

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
      }, 6000);
    };

    socket.on('new_notification', handleNewNotification);
    return () => {
      socket.off('new_notification', handleNewNotification);
    };
  }, [token, location.pathname, location.search]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const isMeetup = t.type.includes('meetup') || t.type.includes('appointment');
        const isChat = t.type.includes('chat') || t.type.includes('message');
        const Icon = isMeetup ? CalendarClock : isChat ? MessageCircle : Bell;

        return (
          <div
            key={t.toastId}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (t.notifId != null) markAsRead(t.notifId);
              setToasts((prev) => prev.filter((x) => x.toastId !== t.toastId));
              navigate(t.link || '/meetups');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                if (t.notifId != null) markAsRead(t.notifId);
                setToasts((prev) => prev.filter((x) => x.toastId !== t.toastId));
                navigate(t.link || '/meetups');
              }
            }}
            className="pointer-events-auto flex cursor-pointer items-start gap-3 rounded-2xl border border-brand-200 bg-white p-3.5 shadow-xl ring-1 ring-black/5 transition-all hover:border-brand-400 hover:bg-orange-50/40"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              isMeetup ? 'bg-orange-100 text-brand-600' : isChat ? 'bg-blue-100 text-blue-600' : 'bg-brand-50 text-brand-600'
            }`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink-900">{t.title}</p>
              {t.message && (
                <p className="mt-0.5 line-clamp-2 text-xs text-ink-600">{t.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setToasts((prev) => prev.filter((x) => x.toastId !== t.toastId));
              }}
              aria-label="ปิดการแจ้งเตือน"
              className="rounded-lg p-1 text-ink-400 hover:bg-gray-100 hover:text-ink-700"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
