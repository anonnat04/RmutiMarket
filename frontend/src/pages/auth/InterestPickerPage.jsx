import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Check,
  Shirt,
  Laptop,
  BookOpen,
  Home,
  Gamepad2,
  Sparkles,
  Dumbbell,
  PenLine,
  LayoutGrid,
  Lightbulb,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useFeedStore } from "@/store/feedStore";
import { interestCategoryPresentation } from "@/constants/categories";
import { api } from "@/lib/api";

// แปลง string ชื่อไอคอนเป็น component จริงจาก lucide-react
const ICONS = { Shirt, Laptop, BookOpen, Home, Gamepad2, Sparkles, Dumbbell, PenLine, LayoutGrid };

const MIN_SELECT = 1;

export function InterestPickerPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const setInterests = useAuthStore((s) => s.setInterests);
  const seedInterests = useFeedStore((s) => s.seedInterests);

  const [dbCategories, setDbCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    api
      .getCategories()
      .then((res) => {
        const cats = res?.categories || [];
        setDbCategories(cats);
        if (cats.length > 0) setSelected([cats[0].id]);
      })
      .catch((err) => console.warn("โหลดหมวดหมู่ไม่สำเร็จ:", err))
      .finally(() => setLoadingCategories(false));
  }, []);

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleConfirm() {
    if (selected.length < MIN_SELECT) return;
    setSaving(true);
    setSyncError("");

    setInterests(selected);
    seedInterests(selected);

    // ดึง token เพื่อส่งไป backend (เช็คทั้ง zustand store และ localStorage)
    const token =
      useAuthStore.getState().token ||
      localStorage.getItem("cm_token") ||
      localStorage.getItem("token") ||
      null;

    if (token && !useAuthStore.getState().token) {
      useAuthStore.setState({ token, isAuthenticated: true });
    }

    let synced = false;
    try {
      if (token) {
        const res = await api.updateInterests(selected, token);
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          useAuthStore.setState({
            user: { ...currentUser, interests: res.interests || selected },
          });
        }
        synced = true;
      } else {
        console.warn("⚠️ ไม่พบ Token สำหรับบันทึกความสนใจไปที่ backend บันทึกไว้เฉพาะในเครื่อง");
      }
    } catch (err) {
      console.error("❌ บันทึกความสนใจไปที่ backend ไม่สำเร็จ:", err.message);
      setSyncError(
        "บันทึกความสนใจไปที่เซิร์ฟเวอร์ไม่สำเร็จ (" +
          err.message +
          ") กำลังนำท่านเข้าสู่ระบบ..."
      );
    }

    await new Promise((r) => setTimeout(r, 400));
    setSaving(false);

    // นำทางไปยังหน้าหลักหรือหน้าที่ระบุเสมอ เพื่อไม่ให้ผู้ใช้ติดค้างในหน้านี้
    const redirectTo = location.state?.from || "/";
    navigate(redirectTo, { replace: true });
  }

  const canConfirm = selected.length >= MIN_SELECT;

  const displayCategories = dbCategories.map((cat) => {
    const presentation = interestCategoryPresentation[cat.slug] || {
      icon: "LayoutGrid",
      image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80",
      color: "#94A3B8",
    };
    return {
      id: cat.id,
      name: cat.name,
      description: cat.description || "",
      icon: ICONS[presentation.icon] || LayoutGrid,
      iconColor: presentation.color,
      iconBg: `${presentation.color}15`,
      image: presentation.image,
    };
  });

  return (
    <div className="min-h-screen bg-[#FAF7F2] flex flex-col font-['Noto_Sans_Thai',sans-serif] selection:bg-orange-500 selection:text-white">
      {/* ─── Main Content ─── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-8 sm:mb-10">
          <div className="max-w-xl">
            {/* Step Indicator Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold text-xs mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </span>
              ขั้นตอนที่ 2 จาก 2 • เลือกความสนใจ
            </div>

            <h1 className="font-['Kanit'] font-black text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight">
              คุณสนใจสินค้า<span className="bg-gradient-to-r from-[#E8631C] to-[#FF7A30] bg-clip-text text-transparent">ประเภทไหน?</span>
            </h1>
            <p className="mt-2.5 text-sm sm:text-base text-slate-500 leading-relaxed">
              เลือกหมวดหมู่ที่คุณสนใจตั้งแต่ 1 รายการขึ้นไป เพื่อให้เราจัดสรรสินค้าและสิทธิพิเศษที่ตรงใจคุณมากที่สุด ✨
            </p>
          </div>

          {/* 3D Mascot Banner Container */}
          <div className="hidden md:flex items-center justify-end shrink-0">
            <div className="relative flex items-center bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-orange-100/80 shadow-xl shadow-orange-950/5">
              {/* Speech bubble */}
              <div className="absolute -top-3 -left-12 bg-slate-900 text-white rounded-2xl px-3.5 py-1.5 text-[11px] font-bold shadow-md z-10 whitespace-nowrap animate-bounce">
                เลือกอันที่ใช่ได้เลย! 🛍️
                <div className="absolute -bottom-1 right-5 w-2.5 h-2.5 bg-slate-900 rotate-45" />
              </div>

              {/* Mascot graphics */}
              <div className="flex items-center gap-2">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center text-3xl shadow-inner border border-white">
                  🧑‍🎓
                </div>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#E8631C] to-[#FF7A30] flex items-center justify-center text-2xl shadow-md text-white border-2 border-white rotate-6">
                  ✨
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Sync Error Banner ─── */}
        {syncError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {syncError}
          </div>
        )}

        {/* ─── Category Grid ─── */}
        {loadingCategories ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-28">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-slate-200/60 p-3.5 space-y-3 shadow-xs animate-pulse">
                <div className="h-36 w-full bg-slate-100 rounded-xl" />
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-2/3 bg-slate-100 rounded" />
                    <div className="h-3 w-1/2 bg-slate-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 mb-28">
            {displayCategories.map((cat) => {
              const isSelected = selected.includes(cat.id);
              const IconComponent = cat.icon;

              return (
                <div
                  key={cat.id}
                  onClick={() => toggle(cat.id)}
                  className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white border-2 cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "border-[#E8631C] ring-4 ring-[#E8631C]/15 shadow-xl shadow-orange-950/5 scale-[1.02] -translate-y-0.5"
                      : "border-slate-200/80 hover:border-orange-300 hover:shadow-md hover:-translate-y-0.5"
                  }`}
                >
                  {/* Image Header */}
                  <div className="relative h-36 sm:h-40 w-full overflow-hidden bg-slate-100">
                    <img
                      src={cat.image}
                      alt={cat.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-108"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/5 to-transparent opacity-80 transition-opacity group-hover:opacity-60" />

                    {/* Circular Checkbox */}
                    <div className="absolute top-3 right-3 z-10">
                      {isSelected ? (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-[#FF7A30] to-[#E8631C] text-white shadow-md transition-transform duration-200 scale-100">
                          <Check size={16} className="stroke-[3]" />
                        </div>
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 backdrop-blur-xs border border-slate-300/80 shadow-xs group-hover:border-[#E8631C] transition-colors" />
                      )}
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="flex items-center gap-3.5 p-4">
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                      style={{ backgroundColor: cat.iconBg, color: cat.iconColor }}
                    >
                      <IconComponent size={22} className="stroke-[2.2]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-['Kanit'] font-bold text-base text-slate-800 leading-snug group-hover:text-[#E8631C] transition-colors">
                        {cat.name}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug line-clamp-1">
                        {cat.description || "เลือกเพื่อดูสินค้ายอดนิยม"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ─── Sticky Bottom Bar ─── */}
      <footer className="fixed bottom-0 inset-x-0 z-40 bg-white/85 backdrop-blur-xl border-t border-slate-200/60 py-3.5 px-4 sm:px-8 shadow-2xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          
          {/* Info Notice */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-[#E8631C] shrink-0">
              <Lightbulb size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm font-bold text-slate-800">
                  เลือกอย่างน้อย {MIN_SELECT} หมวดหมู่
                </p>
                {selected.length > 0 && (
                  <span className="text-[11px] font-semibold text-[#E8631C] bg-orange-50 border border-orange-200/60 px-2.5 py-0.5 rounded-full">
                    เลือกแล้ว {selected.length} รายการ
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                คุณสามารถเปลี่ยนหมวดหมู่ที่สนใจได้ตลอดเวลาในโปรไฟล์ของคุณ 🧡
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                const redirectTo = location.state?.from || "/";
                navigate(redirectTo, { replace: true });
              }}
              className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100/80 px-3.5 py-2.5 rounded-xl transition-all"
            >
              <span>ข้ามขั้นตอนนี้</span>
            </button>

            <button
              onClick={handleConfirm}
              disabled={!canConfirm || saving}
              className={`flex items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-['Kanit'] font-bold text-sm text-white transition-all duration-200 ${
                canConfirm && !saving
                  ? "bg-gradient-to-r from-[#FF7A30] to-[#E8631C] hover:from-[#FF6B2B] hover:to-[#D45514] shadow-lg shadow-orange-500/25 hover:shadow-orange-500/35 active:scale-95"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
              }`}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>กำลังบันทึก...</span>
                </>
              ) : (
                <>
                  <span>เสร็จสิ้น</span>
                  <ArrowRight size={16} className="stroke-[2.5]" />
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}