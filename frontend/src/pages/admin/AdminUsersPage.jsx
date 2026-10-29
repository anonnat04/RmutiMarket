import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, ShieldCheck, Search, Ban, CheckCircle, Loader2, ChevronLeft, ChevronRight,
  Phone, Star, RefreshCw, Trash2, CheckCircle2, X, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAdminStore } from '@/store/adminStore';
import { useAuthStore } from '@/store/authStore';

const PAGE_SIZE = 20;

function Avatar({ src, name, size = 40 }) {
  const style = { width: size, height: size };
  if (src)
    return (
      <img
        src={src}
        alt={name}
        style={style}
        className="rounded-full object-cover bg-gray-100 shrink-0"
      />
    );
  return (
    <div
      style={style}
      className="rounded-full bg-orange-100 text-orange-600 font-bold text-sm flex items-center justify-center shrink-0"
    >
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

const trustCls = (n) => (n >= 80 ? 'text-emerald-600' : n >= 50 ? 'text-orange-500' : 'text-red-500');
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';

export function AdminUsersPage() {
  const token = useAdminStore((s) => s.token) || useAuthStore((s) => s.token) || localStorage.getItem('cm_admin_token') || localStorage.getItem('cm_token');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Delete User Modal state
  const [toDeleteUser, setToDeleteUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteUserReason, setDeleteUserReason] = useState('');


  // หน่วงการค้นหา 350ms ไม่ให้ยิง API ทุกตัวอักษร
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const d = await api.adminGetUsers(token, {
        q: debounced,
        status: statusFilter === 'all' ? '' : statusFilter,
        page,
        limit: PAGE_SIZE,
      });
      setUsers(d.users || []);
      setTotal(d.total || 0);
      setSummary(d.summary || null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token, debounced, statusFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (id, fn) => {
    setBusyId(id);
    setErr('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleBan = (u) => {
    const reason = window.prompt('ระบุเหตุผลในการระงับบัญชี:');
    if (reason === null) return;
    run(u.id, () =>
      api.adminBanUser(token, u.id, reason.trim() || 'มีพฤติกรรมผิดระเบียบ')
    );
  };
  const handleUnban = (u) => run(u.id, () => api.adminUnbanUser(token, u.id));

  const confirmDeleteUser = async () => {
    if (!toDeleteUser) return;
    setDeletingUser(true);
    setErr('');
    try {
      const res = await api.adminDeleteUser(token, toDeleteUser.id, deleteUserReason.trim());
      setNotice(res.message || 'ลบบัญชีผู้ใช้เรียบร้อยแล้ว');
      setToDeleteUser(null);
      setDeleteUserReason('');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeletingUser(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-blue-500" />
            จัดการบัญชีผู้ใช้งาน
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            ตรวจสอบข้อมูลนักศึกษา ระงับบัญชีผู้มีพฤติกรรมเสี่ยง ลบบัญชี และตรวจสอบรีวิว
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

      {notice && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={14} /> {notice}
          </span>
          <button onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}


      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ['ผู้ใช้ทั้งหมด', summary.total, 'text-gray-900'],
            ['ใช้งานปกติ', summary.active, 'text-emerald-600'],
            ['ถูกระงับ', summary.banned, 'text-red-500'],
          ].map(([label, n, cls]) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
              <p className="text-[11px] text-gray-500">{label}</p>
              <p className={`text-2xl font-black ${cls}`}>{(n || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, username, รหัสนักศึกษา, อีเมล, เบอร์โทร..."
            className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2 text-xs text-gray-900 outline-none focus:border-orange-400 focus:bg-white transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 outline-none"
        >
          <option value="all">ทุกสถานะบัญชี</option>
          <option value="active">ปกติ (Active)</option>
          <option value="banned">ถูกระงับการใช้งาน</option>
        </select>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">{err}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
            <tr>
              <th className="p-4 font-bold">ข้อมูลนักศึกษา / ผู้ใช้</th>
              <th className="p-4 font-bold">คณะ / สาขา / ติดต่อ</th>
              <th className="p-4 font-bold text-center">Trust Score</th>
              <th className="p-4 font-bold text-center">กิจกรรม</th>
              <th className="p-4 font-bold text-center">สมัครเมื่อ</th>
              <th className="p-4 font-bold text-center">สถานะ</th>
              <th className="p-4 font-bold text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 text-gray-800">
            {loading && !users.length && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-400">
                  <Loader2 size={16} className="inline animate-spin mr-2" />
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && !users.length && !err && (
              <tr>
                <td colSpan={7} className="p-10 text-center text-gray-400">
                  ไม่พบผู้ใช้
                </td>
              </tr>
            )}

            {users.map((u) => {
              const banned = u.status === 'banned';
              const verified = u.verification_level === 'student_id_verified';
              const name = u.display_name || u.full_name || u.username;
              return (
                <tr
                  key={u.id}
                  className={`hover:bg-gray-50 transition-colors ${busyId === u.id ? 'opacity-50' : ''}`}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar src={u.avatar_url} name={name} />
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          <span className="truncate">{name}</span>
                          {verified && (
                            <ShieldCheck
                              size={13}
                              className="text-emerald-500 shrink-0"
                              title="ยืนยันตัวตนแล้ว"
                            />
                          )}
                        </div>
                        {u.full_name && u.full_name !== name && (
                          <div className="text-[11px] text-gray-500">{u.full_name}</div>
                        )}
                        {u.username && (
                          <div className="text-[11px] text-gray-400">@{u.username}</div>
                        )}
                        <div className="text-[11px] text-gray-500">
                          {u.university_email || u.email}
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono">
                          รหัส นศ: {u.student_id || '-'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-4 text-gray-600">
                    <div>{u.faculty || '-'}</div>
                    {u.major && <div className="text-[11px] text-gray-400">{u.major}</div>}
                    {u.phone && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                        <Phone size={10} /> {u.phone}
                      </div>
                    )}
                  </td>

                  <td className={`p-4 text-center font-bold ${trustCls(u.trust_score)}`}>
                    {u.trust_score}/100
                  </td>

                  <td className="p-4 text-center text-gray-600">
                    <div>ลงขาย {u.listings_count} รายการ</div>
                    <div className="text-[10px] text-gray-400">ซื้อขายสำเร็จ {u.trades_count} ครั้ง</div>
                    <Link
                      to={`/admin/reviews?userId=${u.id}`}
                      className="mt-1 inline-flex items-center justify-center gap-1 rounded-md bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 px-2 py-0.5 text-[10px] font-semibold text-yellow-800 transition-colors"
                      title="คลิกเพื่อดูและจัดการรีวิวของผู้ใช้นี้"
                    >
                      <Star
                        size={11}
                        className={u.avg_rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}
                      />
                      <span>
                        {u.avg_rating
                          ? `${u.avg_rating} (${u.review_count} รีวิว)`
                          : u.review_count > 0
                          ? `${u.review_count} รีวิว`
                          : 'ดูรีวิว'}
                      </span>
                    </Link>
                  </td>

                  <td className="p-4 text-center text-gray-600">{fmtDate(u.created_at)}</td>

                  <td className="p-4 text-center">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                        banned
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {banned ? 'ถูกระงับบัญชี' : 'ใช้งานปกติ'}
                    </span>
                    {banned && u.ban_reason && (
                      <p
                        className="text-[10px] text-red-500 mt-1 max-w-[160px] mx-auto truncate"
                        title={u.ban_reason}
                      >
                        {u.ban_reason}
                      </p>
                    )}
                  </td>

                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {banned ? (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleUnban(u)}
                          className="flex items-center gap-1 rounded-xl bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold text-emerald-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all disabled:opacity-50"
                          title="ปลดการระงับบัญชี"
                        >
                          <CheckCircle size={12} /> ปลดระงับ
                        </button>
                      ) : (
                        <button
                          disabled={busyId === u.id}
                          onClick={() => handleBan(u)}
                          className="flex items-center gap-1 rounded-xl bg-red-50 border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-500 hover:text-white hover:border-red-500 transition-all disabled:opacity-50"
                          title="ระงับการใช้งานบัญชี"
                        >
                          <Ban size={12} /> ระงับบัญชี
                        </button>
                      )}

                      <button
                        disabled={busyId === u.id}
                        onClick={() => {
                          setToDeleteUser(u);
                          setDeleteUserReason('');
                        }}
                        className="flex items-center gap-1 rounded-xl bg-gray-50 border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all disabled:opacity-50"
                        title="ลบบัญชีนี้ออกจากระบบ"
                      >
                        <Trash2 size={12} /> ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          แสดง {users.length} จาก {total.toLocaleString()} คน
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-200 bg-white p-1.5 disabled:opacity-40 hover:border-orange-300"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            หน้า {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-200 bg-white p-1.5 disabled:opacity-40 hover:border-orange-300"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Delete User Modal */}
      {toDeleteUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deletingUser && setToDeleteUser(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">ลบบัญชีผู้ใช้งาน</h3>
                <p className="text-xs text-gray-500">
                  {toDeleteUser.display_name || toDeleteUser.full_name || toDeleteUser.username} ({toDeleteUser.email})
                </p>
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-600 leading-relaxed">
              การลบบัญชีจะเพิกถอนสิทธิ์การเข้าสู่ระบบทั้งหมด หากผู้ใช้นี้มีประวัติการซื้อขายที่เกี่ยวข้อง ระบบจะเก็บบันทึกธุรกรรมไว้เพื่อความโปร่งใส
            </p>

            <label className="mt-4 block text-xs font-semibold text-gray-700">เหตุผลในการลบ</label>
            <textarea
              value={deleteUserReason}
              onChange={(e) => setDeleteUserReason(e.target.value)}
              rows={3}
              placeholder="เช่น มีพฤติกรรมหลอกลวง, สร้างบัญชีปลอม, ผู้ใช้ขอลบบัญชี"
              className="mt-1 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs outline-none focus:border-orange-400 focus:bg-white"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                disabled={deletingUser}
                onClick={() => setToDeleteUser(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                disabled={deletingUser}
                onClick={confirmDeleteUser}
                className="flex items-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-60"
              >
                {deletingUser ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} ยืนยันลบบัญชี
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;

