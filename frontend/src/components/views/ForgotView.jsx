import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Eyebrow, Field, TextInput, PrimaryButton } from "../ui";
import { UNIVERSITY_EMAIL_REGEX } from "../../lib/utils";
import { api } from "../../lib/api";

export default function ForgotView({ goTo }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!UNIVERSITY_EMAIL_REGEX.test(cleanEmail)) {
      setErr("กรุณาใช้อีเมลมหาวิทยาลัยที่ลงทะเบียนไว้");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      await api.forgotPassword({ email: cleanEmail });
      setLoading(false);
      goTo("otp", { email: cleanEmail, purpose: "password_reset" });
    } catch (error) {
      setLoading(false);
      setErr(error.message || "เกิดข้อผิดพลาดในการส่งรหัส");
    }
  };

  return (
    <div>
      <button onClick={() => goTo("login")} className="text-[#6B6B6B] text-[13px] flex items-center gap-1 mb-5 hover:text-[#E8631C]">
        <ArrowLeft size={14} /> กลับ
      </button>
      <Eyebrow>ลืมรหัสผ่าน</Eyebrow>
      <h1 className="font-[Kanit] font-bold text-[26px] text-[#1A1A1A] mb-1">ตั้งรหัสผ่านใหม่</h1>
      <p className="text-[13.5px] text-[#6B6B6B] mb-7">
        กรอกอีเมลมหาวิทยาลัยที่ใช้สมัคร เราจะส่งรหัส OTP 6 หลักไปยืนยันตัวตนก่อนให้ตั้งรหัสผ่านใหม่
      </p>

      <form onSubmit={submit}>
        <Field label="อีเมลมหาวิทยาลัย" error={err}>
          <TextInput
            type="email"
            placeholder="yourname@rmuti.ac.th"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!err}
          />
        </Field>
        <PrimaryButton type="submit" loading={loading}>
          ส่งรหัส OTP
        </PrimaryButton>
      </form>
    </div>
  );
}
