import { forwardRef } from "react";
const variantClasses = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 shadow-xs",
  secondary: "bg-ink-900 text-white hover:bg-black active:bg-ink-900",
  ghost: "bg-transparent text-ink-900 hover:bg-surface-muted",
  outline: "bg-white text-ink-900 border border-surface-border hover:bg-surface-muted hover:border-gray-300",
  danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700 shadow-xs"
};
const sizeClasses = {
  sm: "text-xs px-3 py-1.5 rounded-lg gap-1.5",
  md: "text-sm px-4 py-2.5 rounded-xl gap-2",
  lg: "text-base px-6 py-3 rounded-xl gap-2"
};
export const Button = forwardRef(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return <button
      ref={ref}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${variantClasses[variant] || variantClasses.primary} ${sizeClasses[size]} ${className}`}
      {...props}
    />;
  }
);
Button.displayName = "Button";
