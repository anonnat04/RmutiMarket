import { forwardRef } from "react";
export const Select = forwardRef(
  ({ label, error, className = "", id, children, ...props }, ref) => {
    const selectId = id ?? props.name;
    return <div className="flex flex-col gap-1.5">{label && <label htmlFor={selectId} className="text-sm font-medium text-ink-900">{label}</label>}<select
      ref={ref}
      id={selectId}
      className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors ${error ? "border-red-400" : "border-surface-border"} ${className}`}
      aria-invalid={!!error}
      {...props}
    >{children}</select>{error && <p className="text-xs font-medium text-red-500">{error}</p>}</div>;
  }
);
Select.displayName = "Select";
