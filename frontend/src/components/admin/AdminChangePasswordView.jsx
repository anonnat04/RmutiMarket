import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminChangePasswordView({ session, onDone }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (newPassword !== confirm) return setErr("รหัสผ่านใหม่ไม่ตรงกัน");
    if (newPassword.length < 12) return setErr("รหัสผ่านผู้ดูแลระบบต้องมีอย่างน้อย 12 ตัวอักษร");

    setLoading(true);
    try {
      await api.adminChangePassword(session.accessToken, currentPassword, newPassword);
      // เซสชันเดิมถูก revoke ทั้งหมดฝั่ง backend หลังเปลี่ยนรหัสผ่าน — ให้ล็อกอินใหม่
      onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#1A1A1A] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#E8631C] flex items-center justify-center mb-3">
            <ShieldAlert size={22} className="text-[#1A1A1A]" />
          </div>
          <p className="text-white/50 text-[12px] uppercase tracking-[0.16em] font-semibold">บังคับเปลี่ยนรหัสผ่าน</p>
          <h1 className="font-[Kanit] font-bold text-[20px] text-white mt-1">
            ต้องตั้งรหัสผ่านใหม่ก่อนใช้งาน
          </h1>
          <p className="text-white/40 text-[12.5px] mt-2 leading-relaxed">
            บัญชีนี้ถูกสร้างด้วยรหัสผ่านชั่วคราว กรุณาตั้งรหัสผ่านของคุณเองก่อนเข้าใช้งานส่วนอื่น
          </p>
        </div>

        <form onSubmit={submit} className="bg-[#242424] border border-white/10 rounded-2xl p-6">
          <label className="block mb-4">
            <span className="block text-[13px] font-medium text-white/80 mb-1.5">รหัสผ่านชั่วคราว / ปัจจุบัน</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#1A1A1A] px-3.5 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-[#E8631C]/30 focus:border-[#E8631C]"
            />
          </label>
          <label className="block mb-4">
            <span className="block text-[13px] font-medium text-white/80 mb-1.5">รหัสผ่านใหม่</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="อย่างน้อย 12 ตัว มีพิมพ์ใหญ่ เล็ก ตัวเลข อักขระพิเศษ"
              className="w-full rounded-lg border border-white/15 bg-[#1A1A1A] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:ring-2 focus:ring-[#E8631C]/30 focus:border-[#E8631C]"
            />
          </label>
          <label className="block mb-2">
            <span className="block text-[13px] font-medium text-white/80 mb-1.5">ยืนยันรหัสผ่านใหม่</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-white/15 bg-[#1A1A1A] px-3.5 py-2.5 text-[14px] text-white outline-none focus:ring-2 focus:ring-[#E8631C]/30 focus:border-[#E8631C]"
            />
          </label>
          {err && <p className="text-[12px] text-[#FF7A5C] mb-3">{err}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 rounded-lg bg-[#E8631C] text-white font-semibold py-[11px] text-[14px] hover:bg-[#C24E12] disabled:opacity-50 transition"
          >
            {loading ? "กำลังบันทึก..." : "ตั้งรหัสผ่านใหม่"}
          </button>
        </form>
      </div>
    </div>
  );
}
