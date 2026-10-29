import { CheckCircle2 } from "lucide-react";
import { PrimaryButton } from "../ui";

export default function DoneView({ title, subtitle, goTo, ctaLabel = "ไปหน้าเข้าสู่ระบบ", ctaTarget = "login" }) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-full bg-[#FBEEDF] text-[#1A1A1A] flex items-center justify-center mx-auto mb-5">
        <CheckCircle2 size={26} />
      </div>
      <h1 className="font-[Kanit] font-bold text-[24px] text-[#1A1A1A] mb-2">{title}</h1>
      <p className="text-[13.5px] text-[#6B6B6B] mb-7">{subtitle}</p>
      <PrimaryButton onClick={() => goTo(ctaTarget)}>{ctaLabel}</PrimaryButton>
    </div>
  );
}
