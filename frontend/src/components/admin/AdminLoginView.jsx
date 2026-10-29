import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminLoginView({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email || !password) {
      setErr("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }
    setLoading(true);
    try {
      const data = await api.adminLogin(email, password);
      onLoggedIn(data); // data.mustChangePassword tells the app to route to the change-password screen first
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#1A1A1A] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#E8631C] flex items-center justify-center mb-3">
            <ShieldCheck size={22} className="text-[#1A1A1A]" />
          </div>
          <p className="text-white/50 text-[12px] uppercase tracking-[0.16em] font-semibold">Admin Console</p>
          <h1 className="font-[Kanit] font-bold text-[22px] text-white mt-1">RMUTI Campus Market</h1>
        </div>

        <form onSubmit={submit} className="bg-[#242424] border border-white/10 rounded-2xl p-6">
          <label className="block mb-4">
            <span className="block text-[13px] font-medium text-white/80 mb-1.5">อีเมลผู้ดูแลระบบ</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@rmuti-market.internal"
              className="w-full rounded-lg border border-white/15 bg-[#1A1A1A] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-[#E8631C]/30 focus:border-[#E8631C]"
            />
          </label>
          <label className="block mb-2">
            <span className="block text-[13px] font-medium text-white/80 mb-1.5">รหัสผ่าน</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full rounded-lg border border-white/15 bg-[#1A1A1A] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-[#E8631C]/30 focus:border-[#E8631C]"
            />
          </label>
          {err && <p className="text-[12px] text-[#FF7A5C] mb-3">{err}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 rounded-lg bg-[#E8631C] text-white font-semibold py-[11px] text-[14px] hover:bg-[#C24E12] disabled:opacity-50 transition"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบผู้ดูแลระบบ"}
          </button>
        </form>

        <p className="text-center text-[12px] text-white/30 mt-6">
          บัญชีนี้บังคับเปลี่ยนรหัสผ่านในการเข้าสู่ระบบครั้งแรก และจำกัดจำนวนครั้งที่ลองผิดพลาดอย่างเข้มงวด
        </p>
      </div>
    </div>
  );
}
