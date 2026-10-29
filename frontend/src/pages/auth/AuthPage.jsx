import { useState, useMemo, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AuthShell } from "@/components/ui";
import {
  LoginView,
  RegisterView,
  OtpView,
  ForgotView,
  ResetView,
  DoneView,
} from "@/components/views";
import { useAuthStore } from "@/store/authStore";

export function AuthPage({ defaultView = "login" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const loginToStore = useAuthStore((s) => s.login);

  const [view, setView] = useState(defaultView);
  const [ctx, setCtx] = useState({});

  useEffect(() => {
    setView(defaultView);
  }, [defaultView]);

  const goTo = (next, payload) => {
    const updatedCtx = payload ? { ...ctx, ...payload } : ctx;
    if (payload) setCtx(updatedCtx);

    // ─── Transition ไปหน้าเลือกประเภทสินค้าที่สนใจ (ขั้นตอนในกระบวนการสมัครสมาชิก) ───
    if (next === "interests") {
      const token = updatedCtx.token || localStorage.getItem("cm_token") || null;
      const email = updatedCtx.user?.email || updatedCtx.email || "student@rmuti.ac.th";
      const name = updatedCtx.user?.displayName || updatedCtx.user?.fullName || (updatedCtx.form
        ? `${updatedCtx.form.firstName || ''} ${updatedCtx.form.lastName || ''}`.trim()
        : (updatedCtx.username || updatedCtx.name || email.split("@")[0]));

      loginToStore({
        id: updatedCtx.user?.id || "me",
        name: name || "นักศึกษา มทร.อีสาน",
        username: updatedCtx.user?.username || updatedCtx.username || updatedCtx.form?.username,
        email,
        role: "user",
        faculty: updatedCtx.user?.faculty || updatedCtx.form?.faculty,
        major: updatedCtx.user?.major || updatedCtx.form?.major,
        ...updatedCtx.user,
      }, token);

      navigate("/register/interests", {
        replace: true,
        state: { from: location.state?.from || "/" },
      });
      return;
    }

    // ─── Login สำเร็จ -> แยกเส้นทางระหว่าง Admin และ นักศึกษา ───
    if (next === "home" || next === "loggedin") {
      const loggedUser = updatedCtx.user;
      const isAdmin = updatedCtx.isAdmin || loggedUser?.role === "admin";
      const token = updatedCtx.token;

      if (isAdmin) {
        loginToStore({
          id: loggedUser?.id || "admin",
          name: loggedUser?.name || "ผู้ดูแลระบบ RMUTI",
          email: loggedUser?.email || "admin@rmuti.ac.th",
          role: "admin",
        }, token);
        navigate("/admin", { replace: true });
        return;
      }

      const email = loggedUser?.email || updatedCtx.email || "student@rmuti.ac.th";
      const name = loggedUser?.displayName || loggedUser?.fullName || loggedUser?.name || updatedCtx.name || email.split("@")[0];
      const userInterests = loggedUser?.interests || [];

      loginToStore({
        id: loggedUser?.id || "me",
        name,
        username: loggedUser?.username,
        email,
        role: "user",
        interests: userInterests,
        ...loggedUser,
      }, token);

      // ซิงค์เข้า feedStore เพื่อให้ฟีดจัดเรียงสินค้าตามความชอบทันที (ถ้ามี)
      if (userInterests && userInterests.length > 0) {
        import("@/store/feedStore").then(({ useFeedStore }) => {
          useFeedStore.getState().seedInterests(userInterests);
        });
      }

      const redirectTo = location.state?.from || "/";
      navigate(redirectTo, { replace: true });
      return;
    }

    setView(next);
  };

  const content = useMemo(() => {
    switch (view) {
      case "login":
        return <LoginView goTo={goTo} />;
      case "register":
        return <RegisterView goTo={goTo} />;
      case "otp":
        return <OtpView ctx={ctx} goTo={goTo} />;
      case "forgot":
        return <ForgotView goTo={goTo} />;
      case "reset":
        return <ResetView ctx={ctx} goTo={goTo} />;
      case "done":
        return (
          <DoneView
            title="ยืนยันตัวตนสำเร็จ"
            subtitle="ยินดีต้อนรับสู่ RMUTI Campus Market! ขั้นต่อไปกรุณาเลือกประเภทสินค้าที่คุณสนใจ เพื่อให้ระบบปรับแต่งฟีดแนะนำสินค้าตรงใจคุณมากยิ่งขึ้น ✨"
            goTo={() => goTo("interests")}
            ctaLabel="ถัดไป: เลือกประเภทสินค้าที่สนใจ →"
          />
        );
      default:
        return <LoginView goTo={goTo} />;
    }
  }, [view, ctx]);

  return <AuthShell view={view}>{content}</AuthShell>;
}
