import { ChevronDown } from "lucide-react";
import { cx } from "../../lib/utils";

export default function Select({ error, className, icon: Icon, children, ...rest }) {
  return (
    <div className="relative">
      {Icon && (
        <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#B0876B] z-[1]" />
      )}
      <select
        {...rest}
        className={cx(
          "w-full appearance-none rounded-lg border bg-white py-2.5 pr-9 text-[14px] outline-none transition focus:ring-2 focus:ring-[#E8631C]/20 focus:border-[#E8631C]",
          Icon ? "pl-9" : "pl-3.5",
          rest.value ? "text-[#1A1A1A]" : "text-[#A6A6A6]",
          error ? "border-[#C0392B]" : "border-[#E2E2E2]",
          className
        )}
      >
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8A8A]" />
    </div>
  );
}
