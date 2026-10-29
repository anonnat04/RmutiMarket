import { forwardRef } from "react";
export const Textarea = forwardRef(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const areaId = id ?? props.name;
    return <div className="flex flex-col gap-1.5">{label && <label htmlFor={areaId} className="text-sm font-medium text-ink-900">{label}</label>}<textarea
      ref={ref}
      id={areaId}
      className={`w-full resize-none rounded-xl border px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors ${error ? "border-red-400" : "border-surface-border"} ${className}`}
      aria-invalid={!!error}
      {...props}
    />{error && <p className="text-xs font-medium text-red-500">{error}</p>}{!error && hint && <p className="text-xs text-ink-500">{hint}</p>}</div>;
  }
);
Textarea.displayName = "Textarea";
