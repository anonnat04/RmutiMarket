import { scorePassword, STRENGTH_LABEL, STRENGTH_COLOR } from "../../lib/utils";

export default function PasswordMeter({ value }) {
  const score = scorePassword(value);
  if (!value) return null;
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ backgroundColor: i < score ? STRENGTH_COLOR[score] : "#E2E2E2" }}
          />
        ))}
      </div>
      <span className="block mt-1 text-[12px]" style={{ color: STRENGTH_COLOR[score] }}>
        ความปลอดภัยของรหัสผ่าน: {STRENGTH_LABEL[score]}
      </span>
    </div>
  );
}
