import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, CheckCircle, XCircle, X } from 'lucide-react';

/**
 * ConfirmDialog — modal ยืนยันก่อน action สำคัญ
 *
 * Props:
 *   open        boolean              แสดง/ซ่อน
 *   onClose     () => void           กดยกเลิก หรือ X
 *   onConfirm   () => void           กดยืนยัน
 *   title       string               หัวข้อ
 *   description string               คำอธิบายเพิ่มเติม (optional)
 *   confirmLabel string              ข้อความปุ่มยืนยัน (default "ยืนยัน")
 *   cancelLabel  string              ข้อความปุ่มยกเลิก (default "ยกเลิก")
 *   variant     'danger'|'warning'|'info'   สี/ไอคอน (default 'danger')
 *   loading     boolean              ปุ่มยืนยัน loading state
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'ยืนยันการดำเนินการ?',
  description = '',
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  variant = 'danger',
  loading = false,
}) {
  const confirmBtnRef = useRef(null);

  // focus ปุ่ม cancel เมื่อเปิด (ป้องกันกด Enter โดยไม่ตั้งใจ)
  const cancelBtnRef = useRef(null);
  useEffect(() => {
    if (open) {
      setTimeout(() => cancelBtnRef.current?.focus(), 50);
    }
  }, [open]);

  // กด Escape ปิด dialog
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const variants = {
    danger: {
      icon: <Trash2 size={28} className="text-red-500" />,
      iconBg: 'bg-red-50 border-red-100',
      confirmCls: 'bg-red-500 hover:bg-red-600 text-white',
    },
    warning: {
      icon: <AlertTriangle size={28} className="text-amber-500" />,
      iconBg: 'bg-amber-50 border-amber-100',
      confirmCls: 'bg-amber-500 hover:bg-amber-600 text-white',
    },
    info: {
      icon: <CheckCircle size={28} className="text-brand-500" />,
      iconBg: 'bg-brand-50 border-brand-100',
      confirmCls: 'bg-brand-500 hover:bg-brand-600 text-white',
    },
  };

  const cfg = variants[variant] ?? variants.danger;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-surface-border animate-in fade-in zoom-in-95 duration-150"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${cfg.iconBg}`}>
            {cfg.icon}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:bg-surface-muted transition-colors"
            aria-label="ปิด"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pt-3 pb-5">
          <h3
            id="confirm-dialog-title"
            className="text-base font-extrabold text-ink-900 mt-1"
          >
            {title}
          </h3>
          {description && (
            <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">{description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 border-t border-surface-border px-5 py-4">
          <button
            ref={cancelBtnRef}
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-surface-border bg-white py-2.5 text-sm font-semibold text-ink-700 hover:bg-surface-muted transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5 ${cfg.confirmCls}`}
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                กำลังดำเนินการ...
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
