import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { Eyebrow, PrimaryButton } from "../ui";
import { cx } from "../../lib/utils";
import { api } from "../../lib/api";

export default function OtpView({ ctx, goTo }) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [seconds, setSeconds] = useState(60);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const refs = useRef([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    pasted.split("").forEach((char, idx) => {
      if (idx < 6) next[idx] = char;
    });
    setDigits(next);
    const nextIdx = Math.min(pasted.length, 5);
    refs.current[nextIdx]?.focus();
  };

  const handleChange = (i, val) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[i] = "";
      setDigits(next);
      return;
    }

    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split("");
      const next = [...digits];
      chars.forEach((c, idx) => {
        if (i + idx < 6) next[i + idx] = c;
      });
      setDigits(next);
      const nextIdx = Math.min(i + chars.length, 5);
      refs.current[nextIdx]?.focus();
      return;
    }

    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const verify = async () => {
    const code = digits.join("").trim();
    if (code.length < 6) {
      setErr("กรุณากรอกรหัส OTP ให้ครบ 6 หลัก");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const purpose = ctx?.purpose || "register_verify";
      const cleanEmail = (ctx?.email || "").trim().toLowerCase();
      const result = await api.verifyOtp({
        email: cleanEmail,
        code,
        purpose,
      });
      setLoading(false);

      if (purpose === "password_reset") {
        goTo("reset", { ...ctx, email: cleanEmail, resetToken: result.resetToken || result.token });
      } else {
        // บันทึก session/token เมื่อยืนยันเสร็จ
        if (result.token) {
          localStorage.setItem("cm_token", result.token);
          localStorage.setItem("cm_user", JSON.stringify(result.user));
        }
        goTo(purpose === "register_verify" ? "interests" : "loggedin", {
          ...ctx,
          token: result.token,
          user: result.user,
        });
      }
    } catch (error) {
      setLoading(false);
      setErr(error.message || "รหัส OTP ไม่ถูกต้อง");
      setDigits(Array(6).fill(""));
      refs.current[0]?.focus();
    }
  };

  const resend = async () => {
    if (seconds > 0) return;
    setErr("");
    try {
      await api.resendOtp({
        email: ctx?.email,
        purpose: ctx?.purpose || "register_verify",
      });
      setSeconds(60);
      setDigits(Array(6).fill(""));
    } catch (error) {
      setErr(error.message || "ไม่สามารถส่ง OTP ใหม่ได้");
    }
  };

  return (
    <div>
      <button onClick={() => goTo("login")} className="text-[#6B6B6B] text-[13px] flex items-center gap-1 mb-5 hover:text-[#E8631C]">
        <ArrowLeft size={14} /> กลับ
      </button>
      <Eyebrow>ยืนยันตัวตน</Eyebrow>
      <h1 className="font-[Kanit] font-bold text-[26px] text-[#1A1A1A] mb-1">กรอกรหัส OTP</h1>
      <p className="text-[13.5px] text-[#6B6B6B] mb-7">
        เราส่งรหัส 6 หลักไปที่ <span className="font-medium text-[#1A1A1A]">{ctx?.email || "อีเมลของคุณ"}</span> (หมดอายุใน 5 นาที)
      </p>

      <div className="flex gap-2.5 mb-2 justify-between">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            inputMode="numeric"
            maxLength={1}
            className={cx(
              "w-11 h-[52px] text-center text-[20px] font-semibold rounded-lg border bg-white outline-none transition focus:ring-2 focus:ring-[#E8631C]/20 focus:border-[#E8631C]",
              err ? "border-[#C0392B]" : "border-[#E2E2E2]"
            )}
          />
        ))}
      </div>
      {err && <p className="text-[12px] text-[#C0392B] mb-3">{err}</p>}
      <p className="text-[12px] text-[#6B6B6B] mb-6">เหลือโอกาสกรอกรหัสผิดอีก {attemptsLeft} ครั้ง ก่อนบัญชีถูกล็อกชั่วคราว</p>

      <PrimaryButton onClick={verify} loading={loading} className="mb-4">
        ยืนยันรหัส
      </PrimaryButton>

      <div className="flex items-center justify-center gap-1.5 text-[13px] text-[#6B6B6B]">
        <Clock size={14} />
        {seconds > 0 ? (
          <span>ขอรหัสใหม่ได้ในอีก {seconds} วินาที</span>
        ) : (
          <button onClick={resend} className="text-[#E8631C] font-semibold hover:underline">
            ส่งรหัส OTP อีกครั้ง
          </button>
        )}
      </div>
    </div>
  );
}
