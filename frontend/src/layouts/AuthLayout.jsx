import { Outlet, Link } from "react-router-dom";
export function AuthLayout() {
  return <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-10"><div className="grid w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-card md:grid-cols-2"><div className="cm-hero-gradient hidden flex-col justify-between p-10 text-white md:flex"><Link to="/" className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 font-extrabold">
              C
            </span><span className="text-lg font-extrabold">CampusMarket</span></Link><div><h2 className="text-2xl font-extrabold leading-snug">
              ซื้อ-ขายง่าย ปลอดภัย
              <br />
              ในรั้วมหาวิทยาลัย
            </h2><p className="mt-2 text-sm text-white/85">
              เฉพาะนักศึกษาและบุคลากร มทร.อีสาน ยืนยันตัวตนด้วยอีเมลมหาวิทยาลัยเท่านั้น
            </p></div><p className="text-xs text-white/70">© 2026 CampusMarket · มทร.อีสาน นครราชสีมา</p></div><div className="flex flex-col justify-center p-8 sm:p-10"><Outlet /></div></div></div>;
}
