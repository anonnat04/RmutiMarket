import { useState, useEffect } from "react";
import { ChevronRight, User, CreditCard, Mail, Building2, BookOpen, Phone, AtSign } from "lucide-react";
import { Eyebrow, Field, TextInput, PasswordInput, PasswordMeter, Select, Stepper, PrimaryButton } from "../ui";
import { scorePassword, UNIVERSITY_EMAIL_REGEX, formatStudentId, isValidStudentId } from "../../lib/utils";
import { api } from "../../lib/api";
import { TermsModal } from "./TermsModal";

export default function RegisterView({ goTo }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    studentId: "",
    email: "",
    faculty: "",
    major: "",
    phone: "",
    password: "",
    confirm: "",
    terms: false,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // ── ดึงรายชื่อคณะ+สาขาจริงจาก backend (ตาราง faculties/majors) ──
  // เดิมหน้านี้ใช้ FACULTIES กับ MAJORS แบบ hardcode เป็น array แยกกันคนละก้อน
  // ไม่มีความสัมพันธ์กันเลย ทำให้ dropdown สาขาโชว์ทุกสาขารวมกันไม่ว่าจะเลือกคณะไหน
  const [faculties, setFaculties] = useState([]);
  const [loadingFaculties, setLoadingFaculties] = useState(true);

  useEffect(() => {
    api
      .getFacultiesAndMajors()
      .then((res) => setFaculties(res?.faculties || []))
      .catch((err) => {
        console.warn("โหลดรายชื่อคณะ/สาขาไม่สำเร็จ:", err);
        setFaculties([]);
      })
      .finally(() => setLoadingFaculties(false));
  }, []);

  // หา object คณะที่เลือกอยู่ตอนนี้ (จาก id) เพื่อเอา majors ของคณะนั้นมาโชว์ใน dropdown สาขา
  const selectedFaculty = faculties.find((f) => String(f.id) === String(form.facultyId));
  const availableMajors = selectedFaculty?.majors || [];

  // ตรวจจับและอัปเดตค่าพร้อมเคลียร์/แจ้งเตือน Error ทันทีขณะพิมพ์ (Real-time Validation)
  const set = (k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: val }));

    // Real-time checks
    setErrors((prev) => {
      const nextErrors = { ...prev };

      if (k === "firstName" && val.trim()) delete nextErrors.firstName;
      if (k === "lastName" && val.trim()) delete nextErrors.lastName;
      if (k === "username") {
        const clean = val.trim();
        if (/^[a-zA-Z0-9_]{3,30}$/.test(clean)) {
          delete nextErrors.username;
        } else if (clean.length > 0 && !/^[a-zA-Z0-9_]+$/.test(clean)) {
          nextErrors.username = "ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่าง (_) เท่านั้น";
        } else if (clean.length > 0 && (clean.length < 3 || clean.length > 30)) {
          nextErrors.username = "ชื่อผู้ใช้ต้องมีความยาว 3-30 ตัวอักษร";
        }
      }
      if (k === "phone") {
        if (/^0\d{8,9}$/.test(val)) delete nextErrors.phone;
        else if (val.length >= 10) nextErrors.phone = "เบอร์โทรศัพท์ต้องขึ้นต้นด้วย 0 และมี 10 หลัก";
      }
      if (k === "email") {
        if (UNIVERSITY_EMAIL_REGEX.test(val) && /[@.]rmuti\.ac\.th$/i.test(val)) {
          delete nextErrors.email;
        } else if (val.length > 5 && !val.includes("@")) {
          nextErrors.email = "รูปแบบอีเมลไม่ถูกต้อง ต้องมีเครื่องหมาย @";
        }
      }
      if (k === "password") {
        if (/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(val) && scorePassword(val) >= 2) {
          delete nextErrors.password;
        }
      }
      if (k === "confirm") {
        if (val === form.password) delete nextErrors.confirm;
        else if (val.length >= form.password.length && val !== form.password) {
          nextErrors.confirm = "รหัสผ่านยืนยันไม่ตรงกับรหัสผ่านด้านบน";
        }
      }
      if (k === "terms" && val) delete nextErrors.terms;

      return nextErrors;
    });
  };

  // ── เลือกคณะ: เก็บทั้ง id (ไว้ filter สาขา) และ name (ไว้ส่งไป backend) พร้อมล้างค่าสาขาที่เลือกไว้เดิมทันที ──
  const handleFacultyChange = (e) => {
    const facultyId = e.target.value;
    const facultyObj = faculties.find((f) => String(f.id) === String(facultyId));
    setForm((f) => ({
      ...f,
      facultyId,
      faculty: facultyObj?.name || "",
      majorId: "",
      major: "", // รีเซ็ตสาขาทุกครั้งที่เปลี่ยนคณะ กันเลือกสาขาของคณะเก่าค้างไว้
    }));
    setErrors((prev) => {
      const next = { ...prev };
      if (facultyId) delete next.faculty;
      return next;
    });
  };

  const handleMajorChange = (e) => {
    const majorId = e.target.value;
    const majorObj = availableMajors.find((m) => String(m.id) === String(majorId));
    setForm((f) => ({ ...f, majorId, major: majorObj?.name || "" }));
    setErrors((prev) => {
      const next = { ...prev };
      if (majorId) delete next.major;
      return next;
    });
  };

  // จัดฟอร์แมตรหัสนักศึกษา 11 หลัก - 1 หลัก อัตโนมัติขณะพิมพ์ พร้อมตรวจความถูกต้องทันที
  const handleStudentIdChange = (e) => {
    const formatted = formatStudentId(e.target.value);
    setForm((f) => ({ ...f, studentId: formatted }));
    setErrors((prev) => {
      const next = { ...prev };
      if (isValidStudentId(formatted)) {
        delete next.studentId;
      } else if (formatted.length >= 13) {
        next.studentId = "รหัสนักศึกษาไม่ถูกต้อง ต้องเป็น 11 หลัก ตามด้วยขีดและ 1 หลัก";
      }
      return next;
    });
  };

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = "กรุณากรอกชื่อ";
    if (!form.lastName.trim()) e.lastName = "กรุณากรอกนามสกุล";
    const cleanUsername = form.username.trim();
    if (!cleanUsername) {
      e.username = "กรุณากรอกชื่อผู้ใช้ (Username)";
    } else if (!/^[a-zA-Z0-9_]{3,30}$/.test(cleanUsername)) {
      e.username = "ชื่อผู้ใช้ต้องเป็นตัวอักษรภาษาอังกฤษ ตัวเลข หรือขีดล่าง (_) ความยาว 3-30 ตัวอักษร";
    }
    if (!isValidStudentId(form.studentId)) {
      e.studentId = "รหัสนักศึกษาต้องเป็นเลข 11 หลัก ตามด้วยขีด (-) และเลขตัวสุดท้าย (เช่น 116410400011-1)";
    }
    if (!UNIVERSITY_EMAIL_REGEX.test(form.email)) {
      e.email = "กรุณาใช้อีเมลมหาวิทยาลัยที่เป็นโดเมน @rmuti.ac.th";
    } else if (!/[@.]rmuti\.ac\.th$/i.test(form.email)) {
      e.email = "อีเมลต้องเป็น @rmuti.ac.th หรือโดเมนวิทยาเขต";
    }
    if (!form.facultyId) e.faculty = "กรุณาเลือกคณะ";
    if (!form.majorId) e.major = "กรุณาเลือกสาขา";
    if (!/^0\d{8,9}$/.test(form.phone)) e.phone = "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง";
    // รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร, มีอย่างน้อยหนึ่งตัวอักษรและหนึ่งตัวเลข, ไม่มีช่องว่าง, และระดับความปลอดภัยอย่างน้อย 2
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordPattern.test(form.password) || scorePassword(form.password) < 2) {
      e.password = "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร, มีตัวอักษรและตัวเลข, และปลอดภัยพอ";
    }
    if (form.confirm !== form.password) e.confirm = "รหัสผ่านไม่ตรงกัน";
    if (!form.terms) e.terms = "กรุณายอมรับข้อกำหนดการใช้งานก่อนสมัคร";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setErrors({});
    try {
      await api.register(form);
      setLoading(false);
      goTo("otp", { email: form.email, purpose: "register_verify", form, username: form.username.trim() });
    } catch (err) {
      setLoading(false);
      setErrors({ general: err.message });
    }
  };

  return (
    <div>
      <Eyebrow>สมัครสมาชิก</Eyebrow>
      <h1 className="font-[Kanit] font-bold text-[24px] text-[#1A1A1A] mb-1">
        สมัครสมาชิก <span className="text-[#E8631C]">RmutiMarket</span>
      </h1>
      <p className="text-[13.5px] text-[#6B6B6B] mb-6">สร้างบัญชีเพื่อใช้งานตลาดซื้อขายภายในมหาวิทยาลัย</p>

      <Stepper current={1} />

      <form onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ชื่อ" error={errors.firstName}>
            <TextInput icon={User} value={form.firstName} onChange={set("firstName")} placeholder="ระบุชื่อ" error={!!errors.firstName} />
          </Field>
          <Field label="นามสกุล" error={errors.lastName}>
            <TextInput icon={User} value={form.lastName} onChange={set("lastName")} placeholder="ระบุนามสกุล" error={!!errors.lastName} />
          </Field>
        </div>

        <Field label="ชื่อผู้ใช้ (Username)" error={errors.username}>
          <TextInput
            icon={AtSign}
            value={form.username}
            onChange={set("username")}
            placeholder="เช่น somchai_rmuti (สำหรับโปรไฟล์และเข้าสู่ระบบ)"
            maxLength={30}
            error={!!errors.username}
          />
          <p className="text-[11.5px] text-[#8C8C8C] mt-1">
            ความยาว 3-30 ตัวอักษร (ภาษาอังกฤษ ตัวเลข หรือขีดล่าง _) สามารถใช้เข้าสู่ระบบได้
          </p>
        </Field>

        <Field label="รหัสนักศึกษา (11 หลัก - 1 หลัก)" error={errors.studentId}>
          <TextInput
            icon={CreditCard}
            value={form.studentId}
            onChange={handleStudentIdChange}
            placeholder="เช่น 116410400011-1"
            maxLength={13}
            error={!!errors.studentId}
          />
          <p className="text-[11.5px] text-[#8C8C8C] mt-1">
            พิมพ์เลข 11 หลัก ระบบจะใส่ขีด (-) ให้โดยอัตโนมัติก่อนใส่เลขตัวสุดท้าย
          </p>
        </Field>

        <Field label="อีเมลมหาวิทยาลัย" error={errors.email}>
          <TextInput icon={Mail} type="email" value={form.email} onChange={set("email")} placeholder="เช่น name@rmuti.ac.th" error={!!errors.email} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="คณะ" error={errors.faculty}>
            <Select
              icon={Building2}
              value={form.facultyId || ""}
              onChange={handleFacultyChange}
              error={!!errors.faculty}
              disabled={loadingFaculties}
            >
              <option value="">{loadingFaculties ? "กำลังโหลด..." : "เลือกคณะ"}</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="สาขา" error={errors.major}>
            <Select
              icon={BookOpen}
              value={form.majorId || ""}
              onChange={handleMajorChange}
              error={!!errors.major}
              disabled={!form.facultyId}
            >
              <option value="">
                {!form.facultyId ? "กรุณาเลือกคณะก่อน" : availableMajors.length === 0 ? "ไม่มีสาขาในคณะนี้" : "เลือกสาขา"}
              </option>
              {availableMajors.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="เบอร์โทรศัพท์" error={errors.phone}>
          <TextInput icon={Phone} value={form.phone} onChange={set("phone")} placeholder="เช่น 0812345678" error={!!errors.phone} />
        </Field>

        <Field label="รหัสผ่าน" error={errors.password}>
          <PasswordInput value={form.password} onChange={set("password")} placeholder="อย่างน้อย 8 ตัวอักษร" />
          <PasswordMeter value={form.password} />
        </Field>

        <Field label="ยืนยันรหัสผ่าน" error={errors.confirm}>
          <PasswordInput value={form.confirm} onChange={set("confirm")} placeholder="กรอกรหัสผ่านอีกครั้ง" />
        </Field>

        <div className="flex items-start gap-2 mb-1 mt-1 text-[13px] text-[#4D4D4D]">
          <input
            type="checkbox"
            id="terms-checkbox"
            checked={form.terms}
            onChange={(e) => {
              if (!form.terms) {
                // หากยังไม่ได้ยอมรับ ให้เปิด Modal กฎการใช้งานให้อ่านก่อน
                setShowTermsModal(true);
              } else {
                setForm((f) => ({ ...f, terms: false }));
              }
            }}
            className="mt-0.5 rounded border-[#D9D9D9] accent-[#E8631C] cursor-pointer"
          />
          <div className="select-none leading-snug">
            <span>ฉันยอมรับ </span>
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-[#E8631C] font-semibold hover:underline"
            >
              ข้อกำหนดการใช้งาน
            </button>{" "}
            และ{" "}
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="text-[#E8631C] font-semibold hover:underline"
            >
              นโยบายความเป็นส่วนตัว
            </button>
          </div>
        </div>
        {errors.terms && <p className="text-[12px] text-[#C0392B] mb-3">{errors.terms}</p>}
        {errors.general && (
          <div className="p-3 mb-3 text-[13px] text-[#C0392B] bg-[#FDEDEC] border border-[#F5B7B1] rounded-lg">
            {errors.general}
          </div>
        )}

        <PrimaryButton type="submit" loading={loading} className="mt-4">
          ถัดไป <ChevronRight size={16} />
        </PrimaryButton>
      </form>

      <p className="text-center text-[13.5px] text-[#6B6B6B] mt-6">
        มีบัญชีอยู่แล้ว?{" "}
        <button onClick={() => goTo("login")} className="text-[#E8631C] font-semibold hover:underline">
          เข้าสู่ระบบ
        </button>
      </p>

      {/* Popup กฎการใช้งานเว็บไซต์ RMUTI Market */}
      <TermsModal
        open={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        onAccept={() => {
          setForm((f) => ({ ...f, terms: true }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next.terms;
            return next;
          });
        }}
      />
    </div>
  );
}