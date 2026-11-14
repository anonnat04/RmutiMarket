import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

// api.* อาจคืน response เต็มของ axios หรือคืน body เลย — รองรับทั้งสองแบบ
const unwrap = (res) => (res && typeof res.status === "number" && "data" in res ? res.data : res);

function callApi(name, ...args) {
  if (typeof api?.[name] !== "function") {
    throw new Error(`ยังไม่ได้เพิ่ม api.${name} ใน @/lib/api`);
  }
  return api[name](...args);
}

const FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "penalty", label: "ถูกหัก" },
  { key: "recovery", label: "ได้เพิ่ม" },
  { key: "admin", label: "แอดมินปรับ" },
];

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : `${dateFormatter.format(d)} น.`;
}

function getTone(score) {
  if (score >= 80) {
    return { label: "ดีเยี่ยม", bar: "bg-emerald-500", text: "text-emerald-600" };
  }
  if (score >= 50) {
    return { label: "ปกติ", bar: "bg-amber-500", text: "text-amber-600" };
  }
  return { label: "ต่ำกว่าเกณฑ์", bar: "bg-red-500", text: "text-red-600" };
}

function HistoryRow({ item }) {
  const n = Number(item.changeAmount) || 0;
  const positive = n > 0;
  const icon = item.sourceType === "ADMIN_ADJUST" ? "🛠️" : positive ? "🌟" : "⚠️";
  const amountColor = positive ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-gray-500";

  return (
    <li className="flex items-start gap-3 py-3">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${
          positive ? "bg-emerald-50" : "bg-red-50"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900">{item.title}</p>
        {item.detail && <p className="mt-0.5 break-words text-xs text-gray-500">{item.detail}</p>}
        <p className="mt-1 text-xs text-gray-400">{formatDateTime(item.createdAt)}</p>
      </div>
      <div className="text-right">
        <p className={`text-base font-extrabold ${amountColor}`}>{positive ? `+${n}` : n}</p>
        <p className="text-xs text-gray-400">เหลือ {item.scoreAfter}</p>
      </div>
    </li>
  );
}

export function MyScorePage() {
  const [filter, setFilter] = useState("all");
  const [meta, setMeta] = useState(null);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPage, typeFilter, append) => {
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError("");

      const d = unwrap(
        await callApi("getMyScore", { page: nextPage, limit: PAGE_SIZE, type: typeFilter })
      );

      setMeta({
        trustScore: d.trustScore,
        status: d.status,
        banReason: d.banReason,
        minToTransact: d.minToTransact,
        canTransact: d.canTransact,
        summary: d.summary,
        rules: d.rules,
      });
      setItems((prev) => (append ? [...prev, ...d.history] : d.history));
      setHasMore(!!d.pagination?.hasMore);
      setPage(nextPage);
    } catch (e) {
      const apiMsg = e?.response?.data?.error || e?.response?.data?.message;
      setError(
        apiMsg ||
          (e?.message?.startsWith("ยังไม่ได้เพิ่ม") ? e.message : "โหลดข้อมูลคะแนนไม่สำเร็จ กรุณาลองใหม่")
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(1, filter, false);
  }, [filter, load]);

  const score = meta?.trustScore ?? 0;
  const tone = getTone(score);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">คะแนนความน่าเชื่อถือ</h1>
        <p className="text-sm text-gray-500">ดูคะแนนของคุณ และดูว่าถูกหักหรือได้เพิ่มเพราะอะไร</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}{" "}
          <button type="button" className="font-bold underline" onClick={() => load(1, filter, false)}>
            ลองใหม่
          </button>
        </div>
      )}

      {meta && (
        <>
          {/* การ์ดคะแนน */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-500">คะแนนปัจจุบัน</p>
                <p className={`text-5xl font-extrabold ${tone.text}`}>
                  {score}
                  <span className="text-lg font-bold text-gray-400"> / 100</span>
                </p>
              </div>
              <span className={`rounded-full bg-gray-50 px-3 py-1 text-sm font-bold ${tone.text}`}>
                {tone.label}
              </span>
            </div>

            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              ต้องมีคะแนนอย่างน้อย {meta.minToTransact} จึงจะลงขาย ซื้อ นัดรับ และยื่นข้อเสนอได้
            </p>
          </div>

          {meta.status !== "active" && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-bold">บัญชีของคุณถูก{meta.status === "banned" ? "แบน" : "ระงับ"}</p>
              {meta.banReason && <p className="mt-1 break-words">เหตุผล: {meta.banReason}</p>}
            </div>
          )}

          {meta.status === "active" && !meta.canTransact && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              คะแนนของคุณต่ำกว่า {meta.minToTransact} ตอนนี้จึงยังลงขาย ซื้อ นัดรับ และยื่นข้อเสนอไม่ได้
              ดูวิธีได้คะแนนคืนที่ส่วน "กฎการได้/เสียคะแนน" ด้านล่าง
            </div>
          )}

          {/* สรุป */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
              <p className="text-xl font-extrabold text-emerald-600">+{meta.summary.totalGained}</p>
              <p className="text-xs text-gray-500">คะแนนที่ได้รวม</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
              <p className="text-xl font-extrabold text-red-600">-{meta.summary.totalLost}</p>
              <p className="text-xs text-gray-500">คะแนนที่เสียรวม</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
              <p className="text-xl font-extrabold text-gray-800">{meta.summary.penaltyCount}</p>
              <p className="text-xs text-gray-500">ครั้งที่ถูกหัก</p>
            </div>
          </div>
        </>
      )}

      {/* ประวัติ */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                filter === f.key
                  ? "bg-orange-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">ยังไม่มีรายการในหมวดนี้</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <HistoryRow key={item.id} item={item} />
            ))}
          </ul>
        )}

        {hasMore && !loading && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => load(page + 1, filter, true)}
            className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {loadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
          </button>
        )}
      </div>

      {/* กฎ */}
      {meta && (
        <details className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-bold text-gray-800">กฎการได้/เสียคะแนน</summary>
          <div className="mt-3 space-y-3 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-red-600">ถูกหักคะแนน</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {meta.rules.penalties.length === 0 && <li>ยังไม่มีกฎที่เปิดใช้งาน</li>}
                {meta.rules.penalties.map((r) => (
                  <li key={r.id}>
                    {r.label}: -{r.pointsDeducted} คะแนน
                    {r.description ? ` (${r.description})` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-emerald-600">ได้คะแนน</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>ปิดดีลขายสำเร็จ: +{meta.rules.dealRewardPoints} คะแนน (ไม่เกิน 100)</li>
                {meta.rules.recoveries.map((r) => (
                  <li key={r.id}>
                    {r.name}: +{r.pointsRecovered} คะแนน
                    {r.description ? ` (${r.description})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}