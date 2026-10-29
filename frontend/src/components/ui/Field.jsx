export default function Field({ label, children, hint, error }) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-medium text-[#1A1A1A] mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block mt-1 text-[12px] text-[#6B6B6B]">{hint}</span>}
      {error && <span className="block mt-1 text-[12px] text-[#C0392B]">{error}</span>}
    </label>
  );
}
