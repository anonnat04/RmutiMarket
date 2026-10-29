import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, LogOut, CheckCircle2, XCircle, Search, Ban, RotateCcw,
  Package, BarChart3, TrendingUp, TrendingDown,
} from "lucide-react";
import { api } from "../../lib/api";

function TopBar({ session, onLogout }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E2E2] bg-white">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-md bg-[#1A1A1A] flex items-center justify-center">
          <ShieldCheck size={16} className="text-[#E8631C]" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-[#1A1A1A] leading-tight">Admin Console</p>
          <p className="text-[11px] text-[#8A8A8A] leading-tight">{session.fullName} · {session.role}</p>
        </div>
      </div>
      <button
        onClick={onLogout}
        className="flex items-center gap-1.5 text-[13px] text-[#6B6B6B] hover:text-[#C0392B]"
      >
        <LogOut size={15} /> ออกจากระบบ
      </button>
    </div>
  );
}

function VerificationsTab({ session }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await api.adminPendingVerifications(session.accessToken);
      setItems(data.items || data.verifications || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [session.accessToken]);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    try {
      await api.adminApproveVerification(session.accessToken, id);
      setItems((list) => list.filter((i) => i.id !== id));
    } catch (e) {
      setErr(e.message);
    }
  };

  const reject = async (id) => {
    const reason = window.prompt("เหตุผลที่ปฏิเสธ (จะแสดงให้ผู้ใช้เห็น):") || "";
    try {
      await api.adminRejectVerification(session.accessToken, id, reason);
      setItems((list) => list.filter((i) => i.id !== id));
    } catch (e) {
      setErr(e.message);
    }
  };

  if (loading) return <p className="text-[13px] text-[#8A8A8A] p-6">กำลังโหลด...</p>;
  if (err) return <p className="text-[13px] text-[#C0392B] p-6">{err}</p>;
  if (!items.length) return <p className="text-[13px] text-[#8A8A8A] p-6">ไม่มีคำขอยืนยันตัวตนที่รอตรวจสอบ</p>;

  return (
    <div className="p-6 grid gap-3">
      {items.map((v) => (
        <div key={v.id} className="border border-[#E2E2E2] rounded-xl p-4 bg-white flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-semibold text-[#1A1A1A]">{v.users?.full_name} <span className="text-[#8A8A8A] font-normal">({v.users?.display_name})</span></p>
            <p className="text-[12.5px] text-[#6B6B6B]">รหัสนักศึกษา {v.users?.student_id} · {v.users?.faculty}</p>
            <p className="text-[12px] text-[#A6A6A6] mt-0.5">{v.users?.email}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => approve(v.id)}
              className="flex items-center gap-1 rounded-lg bg-[#1A1A1A] text-white text-[13px] px-3 py-2 hover:bg-[#E8631C] transition"
            >
              <CheckCircle2 size={14} /> อนุมัติ
            </button>
            <button
              onClick={() => reject(v.id)}
              className="flex items-center gap-1 rounded-lg border border-[#E2E2E2] text-[#C0392B] text-[13px] px-3 py-2 hover:bg-[#FBEEDF] transition"
            >
              <XCircle size={14} /> ปฏิเสธ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab({ session }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (query) => {
    setLoading(true);
    setErr("");
    try {
      const data = await api.adminListUsers(session.accessToken, query);
      setItems(data.items || data.users || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [session.accessToken]);

  useEffect(() => { load(""); }, [load]);

  const toggleBan = async (u) => {
    try {
      if (u.status === "banned") {
        await api.adminUnbanUser(session.accessToken, u.id);
      } else {
        const reason = window.prompt("เหตุผลที่ระงับบัญชี:") || "";
        await api.adminBanUser(session.accessToken, u.id, reason);
      }
      load(q);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="p-6">
      <form onSubmit={(e) => { e.preventDefault(); load(q); }} className="flex gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A6A6A6]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ, ชื่อร้าน, อีเมล, รหัสนักศึกษา"
            className="w-full rounded-lg border border-[#E2E2E2] bg-white pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#E8631C]/20 focus:border-[#E8631C]"
          />
        </div>
        <button type="submit" className="rounded-lg bg-[#1A1A1A] text-white text-[13px] px-4 py-2 hover:bg-[#E8631C] transition">
          ค้นหา
        </button>
      </form>

      {loading && <p className="text-[13px] text-[#8A8A8A]">กำลังโหลด...</p>}
      {err && <p className="text-[13px] text-[#C0392B]">{err}</p>}

      {!loading && !err && (
        <div className="grid gap-2">
          {items.map((u) => (
            <div key={u.id} className="border border-[#E2E2E2] rounded-xl p-3.5 bg-white flex items-center justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-semibold text-[#1A1A1A]">
                  {u.display_name} <span className="text-[#8A8A8A] font-normal">· {u.full_name}</span>
                </p>
                <p className="text-[12px] text-[#6B6B6B]">
                  {u.email || u.university_email} · {u.verification_level} · Trust {u.trust_score}
                  {" · "}
                  <span className={u.status === "banned" ? "text-[#C0392B]" : "text-[#4D4D4D]"}>{u.status}</span>
                </p>
              </div>
              <button
                onClick={() => toggleBan(u)}
                className={
                  u.status === "banned"
                    ? "flex items-center gap-1 rounded-lg border border-[#E2E2E2] text-[13px] px-3 py-1.5 text-[#4D4D4D] hover:bg-[#FBEEDF]"
                    : "flex items-center gap-1 rounded-lg border border-[#E2E2E2] text-[13px] px-3 py-1.5 text-[#C0392B] hover:bg-[#FBEEDF]"
                }
              >
                {u.status === "banned" ? <><RotateCcw size={13} /> ยกเลิกระงับ</> : <><Ban size={13} /> ระงับบัญชี</>}
              </button>
            </div>
          ))}
          {!items.length && <p className="text-[13px] text-[#8A8A8A]">ไม่พบผู้ใช้</p>}
        </div>
      )}
    </div>
  );
}

const LISTING_STATUS_LABEL = {
  active: { label: "ลงขายอยู่", cls: "text-[#1F8A45] bg-[#EAFBF0]" },
  reserved: { label: "ติดจอง", cls: "text-[#B8860B] bg-[#FFF7E0]" },
  sold: { label: "ขายแล้ว", cls: "text-[#6B6B6B] bg-[#F0F0F0]" },
  banned: { label: "ถูกระงับ", cls: "text-[#C0392B] bg-[#FBEEDF]" },
};

function ListingsTab({ session }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async (query, statusFilter) => {
    setLoading(true);
    setErr("");
    try {
      const data = await api.adminListListings(session.accessToken, { q: query, status: statusFilter });
      setItems(data.items || data.listings || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [session.accessToken]);

  useEffect(() => { load("", ""); }, [load]);

  const doRemove = async (l) => {
    const reason = window.prompt(`ระงับประกาศ "${l.title}" เหตุผล:`) || "";
    try {
      await api.adminRemoveListing(session.accessToken, l.id, reason);
      load(q, status);
    } catch (e) {
      setErr(e.message);
    }
  };

  const doRestore = async (l) => {
    try {
      await api.adminRestoreListing(session.accessToken, l.id);
      load(q, status);
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="p-6">
      <form
        onSubmit={(e) => { e.preventDefault(); load(q, status); }}
        className="flex flex-wrap gap-2 mb-4"
      >
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A6A6A6]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า"
            className="w-full rounded-lg border border-[#E2E2E2] bg-white pl-9 pr-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#E8631C]/20 focus:border-[#E8631C]"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); load(q, e.target.value); }}
          className="rounded-lg border border-[#E2E2E2] bg-white px-3 py-2 text-[13px] outline-none"
        >
          <option value="">ทุกสถานะ</option>
          <option value="active">ลงขายอยู่</option>
          <option value="reserved">ติดจอง</option>
          <option value="sold">ขายแล้ว</option>
          <option value="banned">ถูกระงับ</option>
        </select>
        <button type="submit" className="rounded-lg bg-[#1A1A1A] text-white text-[13px] px-4 py-2 hover:bg-[#E8631C] transition">
          ค้นหา
        </button>
      </form>

      {loading && <p className="text-[13px] text-[#8A8A8A]">กำลังโหลด...</p>}
      {err && <p className="text-[13px] text-[#C0392B]">{err}</p>}

      {!loading && !err && (
        <div className="grid gap-2">
          {items.map((l) => {
            const meta = LISTING_STATUS_LABEL[l.status] || { label: l.status, cls: "text-[#6B6B6B] bg-[#F0F0F0]" };
            return (
              <div key={l.id} className="border border-[#E2E2E2] rounded-xl p-3.5 bg-white flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-[#1A1A1A] truncate">{l.title}</p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${meta.cls}`}>{meta.label}</span>
                  </div>
                  <p className="text-[12px] text-[#6B6B6B]">
                    ฿{Number(l.price).toLocaleString()} · ผู้ขาย {l.seller_name} · {l.view_count ?? 0} views
                  </p>
                  {l.removed_reason && (
                    <p className="text-[11.5px] text-[#C0392B] mt-0.5">เหตุผลระงับ: {l.removed_reason}</p>
                  )}
                </div>
                <button
                  onClick={() => (l.status === "banned" ? doRestore(l) : doRemove(l))}
                  className={
                    l.status === "banned"
                      ? "flex items-center gap-1 rounded-lg border border-[#E2E2E2] text-[13px] px-3 py-1.5 text-[#4D4D4D] hover:bg-[#FBEEDF] shrink-0"
                      : "flex items-center gap-1 rounded-lg border border-[#E2E2E2] text-[13px] px-3 py-1.5 text-[#C0392B] hover:bg-[#FBEEDF] shrink-0"
                  }
                >
                  {l.status === "banned" ? <><RotateCcw size={13} /> คืนสถานะ</> : <><Ban size={13} /> ระงับ</>}
                </button>
              </div>
            );
          })}
          {!items.length && <p className="text-[13px] text-[#8A8A8A]">ไม่พบประกาศสินค้า</p>}
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, max, suffix = "" }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div className="flex items-center gap-3">
      <p className="text-[12.5px] text-[#4D4D4D] w-32 truncate shrink-0">{label}</p>
      <div className="flex-1 h-5 bg-[#F0F0F0] rounded-md overflow-hidden">
        <div
          className="h-full bg-[#E8631C] rounded-md flex items-center justify-end px-2"
          style={{ width: `${pct}%` }}
        >
          <span className="text-[10.5px] text-white font-medium whitespace-nowrap">
            {value.toLocaleString()}{suffix}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="border border-[#E2E2E2] rounded-xl p-4 bg-white flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[#FBEEDF] flex items-center justify-center text-[#E8631C] shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-[18px] font-bold text-[#1A1A1A] leading-tight">{value}</p>
        <p className="text-[11.5px] text-[#8A8A8A]">{label}</p>
      </div>
    </div>
  );
}

function StatsTab({ session }) {
  const [stats, setStats] = useState(null);
  const [topSellers, setTopSellers] = useState([]);
  const [lowestTrust, setLowestTrust] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [statsData, leaderboard] = await Promise.all([
          api.adminStats(session.accessToken),
          api.adminSellerStats(session.accessToken),
        ]);
        setStats(statsData.stats);
        setTopSellers(leaderboard.topSellers || []);
        setLowestTrust(leaderboard.lowestTrustScore || []);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [session.accessToken]);

  if (loading) return <p className="text-[13px] text-[#8A8A8A] p-6">กำลังโหลด...</p>;
  if (err) return <p className="text-[13px] text-[#C0392B] p-6">{err}</p>;

  const maxDeals = Math.max(1, ...topSellers.map((s) => s.dealCount));

  return (
    <div className="p-6 grid gap-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="ผู้ใช้งานทั้งหมด" value={stats.totalUsers} icon={<Package size={16} />} />
          <StatCard label="ประกาศลงขายอยู่" value={stats.activeListings} icon={<Package size={16} />} />
          <StatCard label="ขายสำเร็จแล้ว" value={stats.soldListings} icon={<TrendingUp size={16} />} />
          <StatCard label="ธุรกรรมทั้งหมด" value={stats.totalTransactions} icon={<BarChart3 size={16} />} />
        </div>
      )}

      <div className="border border-[#E2E2E2] rounded-xl p-5 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-[#E8631C]" />
          <p className="text-[13.5px] font-semibold text-[#1A1A1A]">ผู้ขายที่ปิดการขายได้มากที่สุด</p>
        </div>
        <div className="grid gap-2.5">
          {topSellers.slice(0, 10).map((s) => (
            <Bar key={s.id} label={s.name} value={s.dealCount} max={maxDeals} suffix=" ดีล" />
          ))}
          {!topSellers.length && <p className="text-[13px] text-[#8A8A8A]">ยังไม่มีธุรกรรมที่เสร็จสมบูรณ์</p>}
        </div>
      </div>

      <div className="border border-[#E2E2E2] rounded-xl p-5 bg-white">
        <div className="flex items-center gap-2 mb-4">
          <TrendingDown size={16} className="text-[#C0392B]" />
          <p className="text-[13.5px] font-semibold text-[#1A1A1A]">Trust Score ต่ำที่สุด (เฝ้าระวัง)</p>
        </div>
        <div className="grid gap-2.5">
          {lowestTrust.slice(0, 10).map((u) => (
            <Bar key={u.id} label={u.name} value={u.trustScore} max={100} />
          ))}
          {!lowestTrust.length && <p className="text-[13px] text-[#8A8A8A]">ไม่มีข้อมูล</p>}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboardView({ session, onLogout }) {
  const [tab, setTab] = useState("stats");

  const tabs = [
    ["stats", "ภาพรวม/กราฟ"],
    ["listings", "ประกาศสินค้า"],
    ["verifications", "คำขอยืนยันตัวตน"],
    ["users", "ผู้ใช้งาน"],
  ];

  return (
    <div className="min-h-screen w-full bg-[#FAF6EC]">
      <TopBar session={session} onLogout={onLogout} />
      <div className="flex gap-1 px-6 pt-4 flex-wrap">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "px-4 py-2 text-[13px] font-medium rounded-t-lg " +
              (tab === key ? "bg-white text-[#1A1A1A] border border-b-0 border-[#E2E2E2]" : "text-[#8A8A8A] hover:text-[#1A1A1A]")
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="border-t border-[#E2E2E2] bg-white min-h-[60vh]">
        {tab === "stats" && <StatsTab session={session} />}
        {tab === "listings" && <ListingsTab session={session} />}
        {tab === "verifications" && <VerificationsTab session={session} />}
        {tab === "users" && <UsersTab session={session} />}
      </div>
    </div>
  );
}