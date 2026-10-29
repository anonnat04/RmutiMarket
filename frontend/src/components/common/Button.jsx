import { forwardRef } from "react";
const variantClasses = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700",
  secondary: "bg-ink-900 text-white hover:bg-black",
  ghost: "bg-transparent text-ink-900 hover:bg-surface-muted",
  outline: "bg-white text-ink-900 border border-surface-border hover:bg-surface-muted"
};
const sizeClasses = {
  sm: "text-sm px-3 py-1.5 rounded-lg",
  md: "text-sm px-4 py-2.5 rounded-xl",
  lg: "text-base px-6 py-3 rounded-xl"
};
export const Button = forwardRef(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => {
    return <button
      ref={ref}
      className={`font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />;
  }
);
Button.displayName = "Button";
