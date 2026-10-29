import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Eyebrow, Field, PasswordInput, PasswordMeter, PrimaryButton } from "../ui";
import { scorePassword } from "../../lib/utils";
import { api } from "../../lib/api";

export default function ResetView({ ctx, goTo }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const e2 = {};
    if (scorePassword(pw) < 2) e2.pw = "รหัสผ่านยังไม่ปลอดภัยพอ อย่างน้อย 8 ตัวอักษรผสมกัน";
    if (confirm !== pw) e2.confirm = "รหัสผ่านไม่ตรงกัน";
    setErrors(e2);
    if (Object.keys(e2).length) return;
    setLoading(true);
    try {
      await api.resetPassword({
        resetToken: ctx?.resetToken,
        newPassword: pw,
      });
      setLoading(false);
      setDone(true);
    } catch (err) {
      setLoading(false);
      setErrors({ pw: err.message || "ไม่สามารถเปลี่ยนรหัสผ่านได้" });
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <div className="w-14 h-14 rounded-full bg-[#FBEEDF] text-[#1A1A1A] flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={26} />
        </div>
        <h1 className="font-[Kanit] font-bold text-[24px] text-[#1A1A1A] mb-2">ตั้งรหัสผ่านใหม่สำเร็จ</h1>
        <p className="text-[13.5px] text-[#6B6B6B] mb-7">ระบบได้ออกจากระบบทุกอุปกรณ์ที่เคยล็อกอินไว้แล้วเพื่อความปลอดภัย</p>
        <PrimaryButton onClick={() => goTo("login")}>ไปหน้าเข้าสู่ระบบ</PrimaryButton>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>ตั้งรหัสผ่านใหม่</Eyebrow>
      <h1 className="font-[Kanit] font-bold text-[26px] text-[#1A1A1A] mb-1">สร้างรหัสผ่านใหม่</h1>
      <p className="text-[13.5px] text-[#6B6B6B] mb-7">เลือกรหัสผ่านที่คาดเดายากและไม่เคยใช้ที่อื่น</p>

      <form onSubmit={submit}>
        <Field label="รหัสผ่านใหม่" error={errors.pw}>
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" />
          <PasswordMeter value={pw} />
        </Field>
        <Field label="ยืนยันรหัสผ่านใหม่" error={errors.confirm}>
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="กรอกรหัสผ่านอีกครั้ง" />
        </Field>
        <PrimaryButton type="submit" loading={loading}>
          บันทึกรหัสผ่านใหม่
        </PrimaryButton>
      </form>
    </div>
  );
}
