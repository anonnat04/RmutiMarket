import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} rounded-2xl border border-gray-100 bg-white p-5 shadow-lg animate-fade-in-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="ปิด"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-500 hover:bg-surface-muted hover:text-ink-900 transition-colors"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
