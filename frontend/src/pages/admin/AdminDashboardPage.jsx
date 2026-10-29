import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, ShoppingBag, RefreshCw, AlertTriangle, Star, Trophy, Crown,
  Package, ArrowUp, ArrowDown, CalendarDays, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';

// ───────────────────────── ตัวช่วยเล็กๆ ─────────────────────────

function Avatar({ src, name, size = 36 }) {
  const style = { width: size, height: size };
  if (src) {
    return <img src={src} alt={name} style={style} className="rounded-full object-cover shrink-0 bg-gray-100" />;
  }
  return (
    <div
      style={style}
      className="rounded-full bg-orange-100 text-orange-600 font-bold text-xs flex items-center justify-center shrink-0"
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

const RISK_BADGE = {
  high: { label: 'เสี่ยงสูง', cls: 'bg-red-100 text-red-600' },
  warning: { label: 'ควรระวัง', cls: 'bg-orange-100 text-orange-600' },
  medium: { label: 'ปานกลาง', cls: 'bg-yellow-100 text-yellow-700' },
  good: { label: 'ปกติ', cls: 'bg-emerald-100 text-emerald-700' },
};

// คำนวณระดับความเสี่ยงจาก trustScore (ถ้า backend ไม่ส่ง risk มาด้วย)
function getRisk(u) {
  if (u.risk && RISK_BADGE[u.risk]) return u.risk;
  const score = u.trustScore ?? u.trust_score ?? 100;
  if (score < 30) return 'high';
  if (score < 50) return 'warning';
  if (score < 80) return 'medium';
  return 'good';
}


const RANK_CROWN = ['text-yellow-400', 'text-gray-400', 'text-amber-700'];

// ───────────────────────── KPI Card ─────────────────────────

// invert = true → "ลดลง" คือดี (เช่น รายงานที่รอตรวจสอบ)
function KpiCard({ label, value, change, icon, iconCls, invert = false }) {
  const up = change > 0;
  const flat = !change;
  const good = invert ? change < 0 : change > 0;
  const trendCls = flat ? 'text-gray-400' : good ? 'text-emerald-600' : 'text-red-500';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className={`h-12 w-12 rounded-full flex items-center justify-center ${iconCls}`}>{icon}</div>
      <p className="mt-3 text-[13px] font-semibold text-gray-800">{label}</p>
      <p className="mt-1 text-3xl font-black text-gray-900">{value}</p>
      <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${trendCls}`}>
        {!flat && (up ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
        {flat ? '0%' : `${Math.abs(change)}%`}
        <span className="font-normal text-gray-400">จากเดือนที่แล้ว</span>
      </p>
    </div>
  );
}

// ───────────────────────── Panels ─────────────────────────

function Panel({ icon, iconCls, title, to, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-sm font-bold text-gray-900">
          <span className={`h-9 w-9 rounded-full flex items-center justify-center ${iconCls}`}>{icon}</span>
          {title}
        </h2>
        {to && (
          <Link to={to} className="text-xs font-semibold text-orange-500 hover:underline">
            ดูทั้งหมด →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function TopSellers({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return <p className="py-8 text-center text-xs text-gray-400">ยังไม่มีธุรกรรมที่เสร็จสมบูรณ์</p>;
  }
  const max = Math.max(1, ...list.map((s) => s.salesCount || 0));
  return (
    <div className="space-y-4">
      {list.map((s, i) => (
        <div key={s.id} className="flex items-center gap-3">
          <div className="w-6 flex justify-center shrink-0">
            {i < 3 ? (
              <Crown size={18} className={RANK_CROWN[i]} fill="currentColor" />
            ) : (
              <span className="text-xs font-semibold text-gray-500">{i + 1}</span>
            )}
          </div>
          <Avatar src={s.avatar} name={s.name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[13px] font-semibold text-gray-800">{s.name}</p>
              <p className="shrink-0 text-xs text-gray-500">{(s.salesCount || 0).toLocaleString()} รายการ</p>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-orange-500"
                style={{ width: `${Math.max(4, ((s.salesCount || 0) / max) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LowTrustTable({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return <p className="py-8 text-center text-xs text-gray-400">ไม่มีข้อมูลผู้ใช้</p>;
  }
  return (
    <table className="w-full text-left text-xs">
      <thead className="bg-gray-50 text-gray-500">
        <tr>
          <th className="rounded-l-lg px-3 py-2 font-semibold">อันดับ</th>
          <th className="px-3 py-2 font-semibold">ชื่อผู้ใช้</th>
          <th className="px-3 py-2 text-center font-semibold">Trust Score</th>
          <th className="rounded-r-lg px-3 py-2 text-center font-semibold">สถานะ</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {list.map((u, i) => {
          const badge = RISK_BADGE[getRisk(u)];
          return (
            <tr key={u.id}>
              <td className="px-3 py-3 text-gray-600">{i + 1}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2.5">
                  <Avatar src={u.avatar} name={u.name} size={32} />
                  <span className="truncate font-medium text-gray-800">{u.name}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-center font-bold text-red-500">{u.trustScore}</td>
              <td className="px-3 py-3 text-center">
                <span className={`inline-block rounded-full px-3 py-1 text-[11px] font-semibold ${badge.cls}`}>
                  {badge.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// กราฟโดนัทวาดด้วย SVG ล้วน ไม่ต้องติดตั้งไลบรารีเพิ่ม
function DonutChart({ items, total }) {
  const list = Array.isArray(items) ? items : [];
  const validTotal = total || 0;
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" className="h-52 w-52 shrink-0">
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" r={R} fill="none" stroke="#F3F4F6" strokeWidth="34" />
        {list.map((it) => {
          const len = validTotal ? (it.count / validTotal) * C : 0;
          const el = (
            <circle
              key={it.id}
              cx="100" cy="100" r={R}
              fill="none"
              stroke={it.color}
              strokeWidth="34"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </g>
      <text x="100" y="92" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>ทั้งหมด</text>
      <text x="100" y="114" textAnchor="middle" className="fill-gray-900" style={{ fontSize: 24, fontWeight: 800 }}>
        {validTotal.toLocaleString()}
      </text>
      <text x="100" y="130" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>รายการ</text>
    </svg>
  );
}

function CategoryPanel({ data }) {
  const items = Array.isArray(data) ? data : (data?.items || []);
  const total = (data && typeof data === 'object' && !Array.isArray(data) && data.total != null)
    ? data.total
    : items.reduce((s, it) => s + (it.count || 0), 0);
  const top = (data && typeof data === 'object' && !Array.isArray(data) && data.top)
    ? data.top
    : (items[0] || null);

  return (
    <Panel
      icon={<Package size={18} className="text-orange-500" />}
      iconCls="bg-orange-50"
      title="หมวดสินค้าที่มีการซื้อขายมากที่สุด"
      to="/admin/categories"
    >
      {!items.length ? (
        <p className="py-10 text-center text-xs text-gray-400">ยังไม่มีธุรกรรมที่เสร็จสมบูรณ์</p>
      ) : (
        <div className="flex flex-col items-center gap-6 lg:flex-row">
          <DonutChart items={items} total={total} />

          <div className="w-full flex-1 divide-y divide-gray-100 text-[13px]">
            {items.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="flex-1 truncate font-medium text-gray-800">{c.name}</span>
                <span className="w-14 text-right font-semibold text-gray-800">{(c.count || 0).toLocaleString()}</span>
                <span className="w-14 text-right text-xs text-gray-400">{c.percent ?? 0}%</span>
              </div>
            ))}
          </div>

          {top && (
            <div className="w-full rounded-2xl bg-orange-50 p-6 text-center lg:w-64 lg:shrink-0">
              <ShoppingBag size={36} className="mx-auto text-orange-400" />
              <p className="mt-3 text-sm font-bold text-gray-900">
                หมวด<span style={{ color: top.color }}>{top.name}</span>
              </p>
              <p className="mt-1 text-xs text-gray-600">เป็นหมวดที่มีการซื้อขายมากที่สุด</p>
              <p className="mt-1 text-xs text-gray-600">
                คิดเป็น <span className="font-bold text-orange-500">{top.percent ?? 0}%</span> ของทั้งหมด
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ───────────────────────── Page ─────────────────────────

export function AdminDashboardPage() {
  const authStoreToken = useAuthStore((s) => s.token);
  const adminStoreToken = useAdminStore((s) => s.token);
  const adminToken = adminStoreToken || authStoreToken || localStorage.getItem('cm_admin_token') || localStorage.getItem('cm_token');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setData(await api.adminDashboard(adminToken));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const updatedAt = data?.generatedAt ? new Date(data.generatedAt) : new Date();
  const k = data?.kpis;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">แดชบอร์ดผู้ดูแลระบบ</h1>
          <p className="mt-1 text-sm text-gray-500">ยินดีต้อนรับ Admin เข้าสู่ระบบ RmutiMarket</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <CalendarDays size={20} className="text-gray-700" />
            <div className="leading-tight">
              <p>{updatedAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p>เวลา {updatedAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-500 disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          โหลดข้อมูลแดชบอร์ดไม่สำเร็จ: {err}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
          <Loader2 size={18} className="animate-spin" /> กำลังโหลดข้อมูล...
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard
              label="ผู้ใช้ทั้งหมด"
              value={k?.totalUsers?.value != null ? k.totalUsers.value.toLocaleString() : '0'}
              change={k?.totalUsers?.change}
              icon={<Users size={22} className="text-orange-500" />}
              iconCls="bg-orange-100"
            />
            <KpiCard
              label="สินค้าทั้งหมด"
              value={k?.totalProducts?.value != null ? k.totalProducts.value.toLocaleString() : '0'}
              change={k?.totalProducts?.change}
              icon={<ShoppingBag size={22} className="text-blue-500" />}
              iconCls="bg-blue-100"
            />
            <KpiCard
              label="จำนวนธุรกรรมสำเร็จ"
              value={(k?.completedTransactions?.value ?? k?.completedDeals?.value ?? 0).toLocaleString()}
              change={k?.completedTransactions?.change ?? k?.completedDeals?.change}
              icon={<RefreshCw size={22} className="text-emerald-500" />}
              iconCls="bg-emerald-100"
            />
            <KpiCard
              label="รายงานที่รอตรวจสอบ"
              value={k?.pendingReports?.value != null ? k.pendingReports.value.toLocaleString() : '0'}
              change={k?.pendingReports?.change}
              invert
              icon={<AlertTriangle size={22} className="text-red-500" />}
              iconCls="bg-red-100"
            />
            <KpiCard
              label="คะแนนเฉลี่ยของผู้ใช้"
              value={k?.averageRating?.value ?? '-'}
              change={k?.averageRating?.change}
              icon={<Star size={22} className="text-violet-500" />}
              iconCls="bg-violet-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel
              icon={<Trophy size={18} className="text-yellow-500" />}
              iconCls="bg-yellow-50"
              title="ผู้ขายที่มีจำนวนการขายสูงสุด"
              to="/admin/users"
            >
              <TopSellers items={data?.topSellers} />
            </Panel>

            <Panel
              icon={<AlertTriangle size={18} className="text-red-500" />}
              iconCls="bg-red-50"
              title="ผู้ใช้ที่มี Trust Score ต่ำ"
              to="/admin/users"
            >
              <LowTrustTable items={data?.lowTrustUsers} />
            </Panel>
          </div>

          <CategoryPanel data={data?.categories || data?.topCategories} />
        </>
      )}
    </div>
  );
}