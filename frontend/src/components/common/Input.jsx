import { forwardRef } from "react";
export const Input = forwardRef(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return <div className="flex flex-col gap-1.5">{label && <label htmlFor={inputId} className="text-sm font-medium text-ink-900">{label}</label>}<input
      ref={ref}
      id={inputId}
      className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors ${error ? "border-red-400" : "border-surface-border"} ${className}`}
      aria-invalid={!!error}
      aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : void 0}
      {...props}
    />{error && <p id={`${inputId}-error`} className="text-xs font-medium text-red-500">{error}</p>}{!error && hint && <p id={`${inputId}-hint`} className="text-xs text-ink-500">{hint}</p>}</div>;
  }
);
Input.displayName = "Input";
