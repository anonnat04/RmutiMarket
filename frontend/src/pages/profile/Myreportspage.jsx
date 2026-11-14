import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

// api.* อาจคืน response เต็มของ axios หรือคืน body เลย — รองรับทั้งสองแบบ
const unwrap = (res) => (res && typeof res.status === "number" && "data" in res ? res.data : res);

function callApi(name, ...args) {
  if (typeof api?.[name] !== "function") {
    throw new Error(`ยังไม่ได้เพิ่ม api.${name} ใน @/lib/api`);
  }
  return api[name](...args);
}

const KIND_FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "support", label: "ศูนย์ช่วยเหลือ" },
  { key: "report", label: "รายงานประกาศ" },
];

const STATUS_FILTERS = [
  { key: "all", label: "ทุกสถานะ" },
  { key: "pending", label: "รอดำเนินการ" },
  { key: "in_progress", label: "กำลังดำเนินการ" },
  { key: "resolved", label: "เสร็จสิ้น" },
  { key: "dismissed", label: "เพิกเฉย" },
];

const STATUS_STYLE = {
  pending: { label: "รอดำเนินการ", icon: "⏳", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  in_progress: { label: "กำลังดำเนินการ", icon: "🔧", cls: "border-orange-200 bg-orange-50 text-orange-700" },
  resolved: { label: "แก้ไขแล้ว", icon: "✅", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  dismissed: { label: "เพิกเฉย", icon: "🚫", cls: "border-gray-200 bg-gray-50 text-gray-600" },
};

const CIRCLE = {
  done: "bg-emerald-500 text-white",
  active: "bg-orange-500 text-white ring-4 ring-orange-100",
  dismissed: "bg-gray-500 text-white",
  todo: "bg-gray-200 text-gray-400",
};

const LINE = {
  done: "bg-emerald-400",
  active: "bg-orange-300",
  dismissed: "bg-gray-400",
  todo: "bg-gray-200",
};

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

// แถบขั้นตอน: ส่งเรื่องแล้ว -> แอดมินรับเรื่อง/กำลังดำเนินการ -> ปิดเรื่อง (แก้ไขแล้ว/เพิกเฉย)
function Stepper({ item }) {
  const closed = item.status === "resolved" || item.status === "dismissed";
  const midLabel = closed
    ? "แอดมินตรวจสอบแล้ว"
    : item.status === "in_progress"
      ? "แอดมินกำลังดำเนินการ"
      : "รอแอดมินรับเรื่อง";
  const lastLabel =
    item.status === "dismissed"
      ? "เพิกเฉย"
      : item.status === "resolved"
        ? item.statusLabel || "แก้ไขแล้ว"
        : "ปิดเรื่อง";

  const steps = [
    { label: "ส่งเรื่องแล้ว", time: item.createdAt, state: "done" },
    { label: midLabel, time: null, state: closed ? "done" : "active" },
    {
      label: lastLabel,
      time: closed ? item.resolvedAt : null,
      state: item.status === "dismissed" ? "dismissed" : item.status === "resolved" ? "done" : "todo",
    },
  ];

  return (
    <ol className="mt-4 flex">
      {steps.map((s, i) => (
        <li key={i} className="relative flex flex-1 flex-col items-center text-center">
          {i > 0 && <span className={`absolute right-1/2 top-4 h-0.5 w-full ${LINE[s.state]}`} />}
          <span
            className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${CIRCLE[s.state]}`}
          >
            {s.state === "done" ? "✓" : s.state === "dismissed" ? "–" : i + 1}
          </span>
          <span className="mt-1 px-1 text-xs font-semibold text-gray-700">{s.label}</span>
          {s.time && <span className="px-1 text-xs text-gray-400">{formatDateTime(s.time)}</span>}
        </li>
      ))}
    </ol>
  );
}

function ReportCard({ item }) {
  const st = STATUS_STYLE[item.status] || STATUS_STYLE.pending;
  const isSupport = item.kind === "support";
  const showUpdated =
    item.updatedAt &&
    Math.abs(new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime()) > 60000;

  return (
    <li className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
              isSupport
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-red-200 bg-red-50 text-red-600"
            }`}
          >
            {isSupport ? "🎧 ศูนย์ช่วยเหลือ" : "🚩 รายงานประกาศ"}
          </span>
          {item.category && (
            <span className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-600">
              {item.category}
            </span>
          )}
          <span className="text-xs text-gray-400">
            #{item.id} · {formatDateTime(item.createdAt)}
          </span>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${st.cls}`}>
          {st.icon} {item.statusLabel || st.label}
        </span>
      </div>

      <h3 className="mt-2 break-words text-sm font-bold text-gray-900">
        {!isSupport && item.targetLabel ? `${item.targetLabel}: ` : ""}
        {item.title}
      </h3>

      <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50 p-3">
        <p className="text-xs font-semibold text-orange-600">ข้อความที่คุณแจ้ง</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{item.message}</p>
      </div>

      <Stepper item={item} />

      {item.adminNote && (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-700">หมายเหตุจากแอดมิน</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{item.adminNote}</p>
        </div>
      )}

      {showUpdated && (
        <p className="mt-2 text-xs text-gray-400">อัปเดตล่าสุด {formatDateTime(item.updatedAt)}</p>
      )}
    </li>
  );
}

export function MyReportsPage() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, in_progress: 0, resolved: 0, dismissed: 0 });
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const d = unwrap(await callApi("getMyReports"));
      setItems(d.items || []);
      setCounts(d.counts || { total: 0, pending: 0, in_progress: 0, resolved: 0, dismissed: 0 });
    } catch (e) {
      const apiMsg = e?.response?.data?.error || e?.response?.data?.message;
      setError(
        apiMsg ||
          (e?.message?.startsWith("ยังไม่ได้เพิ่ม") ? e.message : "โหลดประวัติการแจ้งไม่สำเร็จ กรุณาลองใหม่")
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter(
        (it) => (kind === "all" || it.kind === kind) && (status === "all" || it.status === status)
      ),
    [items, kind, status]
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">ประวัติการแจ้งแอดมิน</h1>
        <p className="text-sm text-gray-500">
          เรื่องที่คุณเคยแจ้งแอดมินทั้งหมด เก็บไว้ให้ดูได้เสมอ แม้แอดมินจัดการแล้ว
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
          <p className="text-xl font-extrabold text-amber-600">{counts.pending}</p>
          <p className="text-xs text-gray-500">รอดำเนินการ</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
          <p className="text-xl font-extrabold text-orange-600">{counts.in_progress}</p>
          <p className="text-xs text-gray-500">กำลังดำเนินการ</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
          <p className="text-xl font-extrabold text-emerald-600">{counts.resolved}</p>
          <p className="text-xs text-gray-500">เสร็จสิ้น</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm">
          <p className="text-xl font-extrabold text-gray-700">{counts.dismissed}</p>
          <p className="text-xs text-gray-500">เพิกเฉย</p>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setKind(f.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                kind === f.key ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                status === f.key ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}{" "}
          <button type="button" className="font-bold underline" onClick={load}>
            ลองใหม่
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">กำลังโหลด...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          {items.length === 0
            ? "คุณยังไม่เคยแจ้งแอดมิน หากพบปัญหา กดปุ่มช่วยเหลือสีส้มมุมขวาล่างเพื่อแจ้งได้เลย"
            : "ไม่มีรายการที่ตรงกับตัวกรอง"}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((it) => (
            <ReportCard key={it.key} item={it} />
          ))}
        </ul>
      )}
    </div>
  );
}