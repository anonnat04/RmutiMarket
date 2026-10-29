import { cx } from "../../lib/utils";

export const inputBase =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-[#1A1A1A] placeholder:text-[#A6A6A6] outline-none transition focus:ring-2 focus:ring-[#E8631C]/20 focus:border-[#E8631C]";

export default function TextInput(props) {
  const { error, className, icon: Icon, ...rest } = props;

  if (!Icon) {
    return (
      <input
        {...rest}
        className={cx(inputBase, error ? "border-[#C0392B]" : "border-[#E2E2E2]", className)}
      />
    );
  }

  return (
    <div className="relative">
      <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#B0876B]" />
      <input
        {...rest}
        className={cx(inputBase, "pl-9", error ? "border-[#C0392B]" : "border-[#E2E2E2]", className)}
      />
    </div>
  );
}
