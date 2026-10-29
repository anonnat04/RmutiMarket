import { useState } from "react";
import { ChevronRight, User } from "lucide-react";
import { Eyebrow, Field, TextInput, PasswordInput, PrimaryButton } from "../ui";
import { UNIVERSITY_EMAIL_REGEX, STUDENT_ID_REGEX, formatStudentId } from "../../lib/utils";
import { api } from "../../lib/api";

const isValidLogin = (v) => {
  const clean = (v || "").trim();
  return UNIVERSITY_EMAIL_REGEX.test(clean) || STUDENT_ID_REGEX.test(clean) || /^\d{12,13}$/.test(clean);
};

export default function LoginView({ goTo }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleIdentifierChange = (e) => {
    const val = e.target.value;
    // หากพิมพ์เฉพาะตัวเลข (รหัสนักศึกษา) ให้จัดฟอร์แมต 11 หลัก - 1 หลัก อัตโนมัติ
    if (!val.includes("@") && /^\d/.test(val)) {
      setIdentifier(formatStudentId(val));
    } else {
      setIdentifier(val);
    }
    if (err) setErr("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!isValidLogin(identifier)) {
      setErr("กรุณากรอกรหัสนักศึกษา (เช่น 116410400011-1) หรืออีเมลมหาวิทยาลัย (@rmuti.ac.th)");
      return;
    }
    if (!password) {
      setErr("กรุณากรอกรหัสผ่าน");
      return;
    }
    setLoading(true);
    try {
      const res = await api.login({ identifier, password });
      setLoading(false);
      if (res.requireOtp) {
        goTo("otp", { email: res.email || identifier, purpose: "login_verify" });
      } else {
        const token = res.accessToken || res.token;
        if (token) {
          localStorage.setItem("cm_token", token);
        }
        if (res.isAdmin) {
          localStorage.setItem("cm_admin_token", token);
          goTo("loggedin", {
            isAdmin: true,
            token,
            user: {
              id: res.id || "admin",
              name: res.fullName || "ผู้ดูแลระบบ RMUTI",
              email: res.email,
              role: "admin",
            },
          });
        } else {
          localStorage.setItem("cm_user", JSON.stringify(res.user));
          goTo("loggedin", {
            isAdmin: false,
            token,
            user: {
              id: res.user?.id || "me",
              name: res.user?.displayName || res.user?.fullName || identifier.split("@")[0],
              email: res.user?.email || identifier,
              role: "user",
              ...res.user,
            },
          });
        }
      }
    } catch (error) {
      setLoading(false);
      setErr(error.message || "เข้าสู่ระบบไม่สำเร็จ ตรวจสอบรหัสผ่านหรือข้อมูล");
    }
  };

  return (
    <div>
      <Eyebrow>เข้าสู่ระบบ</Eyebrow>
      <h1 className="font-[Kanit] font-bold text-[26px] text-[#1A1A1A] mb-1">
        เข้าสู่ระบบ <span className="text-[#E8631C]">RmutiMarket</span>
      </h1>
      <p className="text-[13.5px] text-[#6B6B6B] mb-7">เข้าสู่ระบบเพื่อใช้งานตลาดซื้อขายภายในมหาวิทยาลัย</p>

      <form onSubmit={submit}>
        <Field label="รหัสนักศึกษา / อีเมลมหาวิทยาลัย" error={err}>
          <TextInput
            icon={User}
            placeholder="เช่น 116410400011-1 หรือ name@rmuti.ac.th"
            value={identifier}
            onChange={handleIdentifierChange}
            maxLength={50}
            error={!!err}
          />
        </Field>

        <Field label="รหัสผ่าน">
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="กรอกรหัสผ่าน"
          />
        </Field>

        <div className="flex items-center justify-between mb-6 text-[13px]">
          <label className="flex items-center gap-2 text-[#4D4D4D] cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded border-[#D9D9D9] accent-[#E8631C]"
            />
            จำฉันไว้
          </label>
          <button
            type="button"
            onClick={() => goTo("forgot")}
            className="text-[#E8631C] font-medium hover:underline"
          >
            ลืมรหัสผ่าน?
          </button>
        </div>

        <PrimaryButton type="submit" loading={loading}>
          เข้าสู่ระบบ <ChevronRight size={16} />
        </PrimaryButton>
      </form>

      <p className="text-center text-[13.5px] text-[#6B6B6B] mt-6">
        ยังไม่มีบัญชี?{" "}
        <button onClick={() => goTo("register")} className="text-[#E8631C] font-semibold hover:underline">
          สมัครสมาชิก
        </button>
      </p>
    </div>
  );
}
