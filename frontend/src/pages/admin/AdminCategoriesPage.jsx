import { useCallback, useEffect, useState } from 'react';
import { Package, RefreshCw, Loader2, TrendingUp, ShoppingBag, BarChart3 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';

const FALLBACK_COLORS = [
  '#F97316', '#FACC15', '#22C55E', '#3B82F6', '#0EA5E9',
  '#A855F7', '#EC4899', '#14B8A6', '#F43F5E', '#CBD5E1',
];

// ─── กราฟโดนัท SVG ───
function DonutChart({ items, total }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 200 200" className="h-52 w-52 shrink-0">
      <g transform="rotate(-90 100 100)">
        <circle cx="100" cy="100" r={R} fill="none" stroke="#F3F4F6" strokeWidth="34" />
        {items.map((it) => {
          const len = total ? (it.count / total) * C : 0;
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
        {total.toLocaleString()}
      </text>
      <text x="100" y="130" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 11 }}>รายการ</text>
    </svg>
  );
}

// ─── Bar แนวนอน ───
function HBar({ value, max, color }) {
  const pct = max ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div className="h-2 w-full rounded-full bg-gray-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function AdminCategoriesPage() {
  const token = useAdminStore((s) => s.token) || useAuthStore((s) => s.token) || localStorage.getItem('cm_admin_token') || localStorage.getItem('cm_token');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await api.adminDashboard(token);
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const cats = Array.isArray(data?.topCategories) ? data.topCategories : (data?.topCategories?.items || []);
  const total = data?.topCategories?.total || cats.reduce((s, c) => s + (c.count || 0), 0);
  const top = data?.topCategories?.top || cats[0] || null;
  const maxCount = cats.length ? Math.max(...cats.map((c) => c.count)) : 1;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Package size={22} className="text-orange-500" />
            สถิติหมวดหมู่สินค้า
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            สัดส่วนและจำนวนธุรกรรมสำเร็จจำแนกตามหมวดหมู่
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-500 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>
      </div>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{err}</div>}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
          <Loader2 size={18} className="animate-spin" /> กำลังโหลดข้อมูล...
        </div>
      )}

      {data && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                  <BarChart3 size={18} className="text-orange-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">ธุรกรรมสำเร็จทั้งหมด</p>
                  <p className="text-2xl font-black text-gray-900">{total.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <Package size={18} className="text-blue-500" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500">จำนวนหมวดหมู่</p>
                  <p className="text-2xl font-black text-gray-900">{cats.length}</p>
                </div>
              </div>
            </div>
            {top && (
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                    <TrendingUp size={18} className="text-yellow-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-500">หมวดยอดนิยม</p>
                    <p className="truncate text-base font-black" style={{ color: top.color }}>{top.name}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Panel */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="mb-6 flex items-center gap-2.5 text-sm font-bold text-gray-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50">
                <Package size={18} className="text-orange-500" />
              </span>
              หมวดสินค้าที่มีการซื้อขายมากที่สุด
            </h2>

            {!cats.length ? (
              <p className="py-12 text-center text-sm text-gray-400">ยังไม่มีธุรกรรมที่เสร็จสมบูรณ์</p>
            ) : (
              <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-start">
                {/* Donut */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <DonutChart items={cats} total={total} />
                  {top && (
                    <div className="mt-2 rounded-2xl bg-orange-50 px-5 py-4 text-center w-52">
                      <ShoppingBag size={28} className="mx-auto text-orange-400" />
                      <p className="mt-2 text-sm font-bold text-gray-900">
                        หมวด<span style={{ color: top.color }}>{top.name}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">ขายมากที่สุด</p>
                      <p className="mt-1 text-lg font-black text-orange-500">{top.percent}%</p>
                    </div>
                  )}
                </div>

                {/* Table */}
                <div className="w-full flex-1">
                  <div className="overflow-hidden rounded-2xl border border-gray-100">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-4 py-3 font-bold">อันดับ</th>
                          <th className="px-4 py-3 font-bold">หมวดหมู่</th>
                          <th className="px-4 py-3 font-bold">สัดส่วน</th>
                          <th className="px-4 py-3 text-right font-bold">ธุรกรรม</th>
                          <th className="px-4 py-3 text-right font-bold">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {cats.map((c, i) => (
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 text-gray-500 font-semibold">{i + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{ background: c.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length] }}
                                />
                                <span className="font-semibold text-gray-800">{c.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 w-40">
                              <HBar value={c.count} max={maxCount} color={c.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-gray-800">
                              {c.count.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-500">
                              {c.percent}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AdminCategoriesPage;
