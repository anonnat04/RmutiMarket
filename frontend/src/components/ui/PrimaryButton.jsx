import { cx } from "../../lib/utils";

export default function PrimaryButton({ children, loading, className, ...rest }) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className={cx(
        "w-full rounded-lg bg-[#E8631C] text-white font-semibold py-[11px] text-[14px] transition hover:bg-[#C24E12] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
        className
      )}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
