import { cx } from "../../lib/utils";

const STEPS = ["ข้อมูลส่วนตัว", "ยืนยันตัวตน", "ตรวจสอบ", "เสร็จสิ้น"];

export default function Stepper({ current = 1 }) {
  return (
    <div className="flex items-start mb-7">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <div key={label} className={cx("flex items-center", n < STEPS.length && "flex-1")}>
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cx(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0",
                  active
                    ? "bg-[#E8631C] text-white"
                    : done
                    ? "bg-[#F6C6A3] text-white"
                    : "bg-[#EDEDED] text-[#9A9A9A]"
                )}
              >
                {n}
              </div>
              <span
                className={cx(
                  "text-[10.5px] whitespace-nowrap",
                  active ? "text-[#E8631C] font-medium" : "text-[#9A9A9A]"
                )}
              >
                {label}
              </span>
            </div>
            {n < STEPS.length && (
              <div className={cx("h-[2px] flex-1 mx-1.5 mt-[14px]", done ? "bg-[#F6C6A3]" : "bg-[#EDEDED]")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
