import { ShieldCheck, MapPin, Star, MessageCircle, Landmark } from "lucide-react";
import campusBg from "../../assets/campus-bg.png";
import logoFull from "../../assets/logo.png";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');`;

const FEATURES = [
  { icon: ShieldCheck, title: "ปลอดภัย", desc: "ยืนยันตัวตนด้วยบัตรนักศึกษา" },
  { icon: MapPin, title: "นัดรับสินค้า", desc: "จุดนัดรับปลอดภัยในมหาวิทยาลัย" },
  { icon: Star, title: "Trust Score & รีวิว", desc: "ซื้อขายกับผู้ใช้ที่น่าเชื่อถือ" },
  { icon: MessageCircle, title: "แชทง่าย", desc: "คุยต่อรองสะดวก ปลอดภัย" },
];

export function Logo({ dark }) {
  // ใช้ logoFull ทั้งสองกรณี เพราะ logo.png มีทั้ง icon + ข้อความในตัวแล้ว
  if (dark) {
    return <img src={logoFull} alt="RmutiMarket" className="h-8 w-auto" />;
  }
  return (
    <div className="flex items-center gap-2.5">
      <img src={logoFull} alt="RmutiMarket" className="h-9 w-auto drop-shadow" />
    </div>
  );
}

function BrandPanel({ variant }) {
  const isLogin = variant === "login";
  return (
    <div className="relative hidden lg:flex lg:w-[44%] flex-col overflow-hidden bg-[#FFF8F0]">
      {/* illustration — cropped to keep the characters + RMUTI arch on the right in frame */}
      <img
        src={campusBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "88% center" }}
      />
      {/* soft wash only at the very top so the logo stays legible over the sky area */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/70 to-transparent" />

      <div className="relative z-10 flex flex-col h-full p-8">
        <div>
          <Logo dark />
          <p className="mt-1 ml-[46px] text-[11.5px] text-[#6B5B4D]">ตลาดซื้อขายภายในมหาวิทยาลัย</p>
        </div>

        <div className="mt-8 max-w-[220px]">
          {isLogin ? (
            <>
              <h2 className="font-[Kanit] font-bold text-[26px] leading-[1.3] text-[#1A1A1A] mb-2.5 [text-shadow:0_1px_12px_rgba(255,255,255,0.6)]">
                <span className="text-[#E8631C]">ซื้อ-ขายง่าย</span> ปลอดภัย
                <br />
                มั่นใจภายในรั้ว
                <br />
                มหาวิทยาลัย
              </h2>
              <p className="text-[#5B4A3D] text-[12.5px] leading-relaxed [text-shadow:0_1px_10px_rgba(255,255,255,0.5)]">
                ยืนยันตัวตนด้วยอีเมลและรหัสนักศึกษา นัดรับของที่จุดนัดปลอดภัย
              </p>
            </>
          ) : (
            <>
              <h2 className="font-[Kanit] font-bold text-[22px] leading-[1.3] text-[#1A1A1A] mb-2 [text-shadow:0_1px_12px_rgba(255,255,255,0.6)]">
                เข้าร่วมตลาดนัด
                <br />
                เฉพาะคนในรั้ว
                <br />
                มหาวิทยาลัย
              </h2>
              <p className="text-[#5B4A3D] text-[12px] leading-relaxed [text-shadow:0_1px_10px_rgba(255,255,255,0.5)]">
                สมัครสมาชิกด้วยอีเมลมหาวิทยาลัยของคุณ ใช้เวลาไม่ถึง 5 นาที
              </p>
            </>
          )}
        </div>

        {/* spacer lets the illustration's characters show through untouched */}
        <div className="flex-1" />

        {isLogin ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-black/20 backdrop-blur-[2px] p-3.5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon size={12} className="text-white" />
                </div>
                <div>
                  <p className="text-white text-[11.5px] font-medium leading-tight">{title}</p>
                  <p className="text-white/75 text-[10px] leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 rounded-lg bg-black/25 backdrop-blur-[2px] px-3.5 py-2.5 text-white text-[11.5px] w-fit">
            <Landmark size={15} className="text-[#FFC08A] shrink-0" />
            สำหรับนักศึกษาและบุคลากร มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthShell({ children, view }) {
  const variant = view === "login" ? "login" : "default";
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8 font-[Noto_Sans_Thai]"
      style={{ background: "linear-gradient(135deg,#FFF6EC 0%,#FDECD9 55%,#FCE3C8 100%)" }}
    >
      <style>{FONT_IMPORT}</style>
      <div className="w-full max-w-[1080px] rounded-[26px] overflow-hidden bg-white shadow-[0_25px_70px_-15px_rgba(232,99,28,0.35)] flex flex-col lg:flex-row lg:min-h-[640px]">
        <BrandPanel variant={variant} />

        <div className="flex-1 flex flex-col">
          <div className="lg:hidden px-6 pt-6">
            <Logo dark />
          </div>
          <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-12">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
