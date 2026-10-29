import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Search, Filter, Calendar, MapPin, CheckCircle2, XCircle, RotateCcw, Clock, ArrowLeft, ArrowUpRight, Star } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useMeetupStore } from '@/store/meetupStore';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/common/Button';
import { formatCurrency } from '@/utils/formatCurrency';
import { api } from '@/lib/api';

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const statusMap = {
  completed: { label: 'ส่งมอบสำเร็จ', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'ยกเลิก/ปฏิเสธ', color: 'bg-gray-100 text-gray-700 border-gray-200' },
  return_requested: { label: 'ยื่นขอคืนสินค้า', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  return_accepted: { label: 'คืนสินค้าสำเร็จ', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  return_rejected: { label: 'ปฏิเสธการคืน', color: 'bg-red-50 text-red-700 border-red-200' },
  confirmed: { label: 'นัดหมายแล้ว', color: 'bg-brand-50 text-brand-700 border-brand-200' },
  pending: { label: 'รอดำเนินการ', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  reschedule_requested: { label: 'ขอเลื่อนวัน/เวลา', color: 'bg-purple-50 text-purple-700 border-purple-200' },
};

export function TransactionHistoryPage() {
  const user = useAuthStore((s) => s.user);
  const myId = user?.id ?? 'me';
  const meetups = useMeetupStore((s) => s.meetups);

  const [dbTxns, setDbTxns] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.id === 'me') return;
    setLoading(true);
    api.getMyTransactions()
      .then((res) => {
        if (res?.transactions) {
          const mapped = res.transactions.map((t) => {
            const isBuyer = t.buyer_id === myId;
            const otherUser = isBuyer ? t.users_seller_id || t.users : t.users_buyer_id || t.users;
            const meetup = t.meetups?.[0];
            return {
              id: t.id,
              productTitle: t.listings?.title || 'สินค้า',
              productPrice: t.agreed_price,
              buyerId: t.buyer_id,
              buyerName: t.users_buyer_id?.display_name || (isBuyer ? user.name : 'ผู้ซื้อ'),
              sellerId: t.seller_id,
              sellerName: t.users_seller_id?.display_name || (!isBuyer ? user.name : 'ผู้ขาย'),
              status: t.status === 'completed' ? 'completed' : (meetup?.status || t.status),
              date: t.completed_at || t.created_at,
              locationName: meetup?.meetup_points?.name || 'จุดนัดรับ มทร.อีสาน',
              isDb: true,
            };
          });
          setDbTxns(mapped);
        }
      })
      .catch((err) => console.warn("Could not fetch transactions:", err))
      .finally(() => setLoading(false));
  }, [user, myId]);

  const allItems = [...dbTxns];
  for (const m of meetups) {
    if ((m.buyerId === myId || m.sellerId === myId) && !allItems.some((item) => item.id === m.id)) {
      allItems.push(m);
    }
  }

  const [filterType, setFilterType] = useState('all'); // all | buy | sell
  const [filterStatus, setFilterStatus] = useState('all'); // all | completed | return | other
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = allItems.filter((item) => {
    const isBuyer = item.buyerId === myId;
    if (filterType === 'buy' && !isBuyer) return false;
    if (filterType === 'sell' && isBuyer) return false;

    if (filterStatus === 'completed' && item.status !== 'completed') return false;
    if (filterStatus === 'return' && !['return_requested', 'return_accepted', 'return_rejected'].includes(item.status)) return false;
    if (filterStatus === 'cancelled' && item.status !== 'rejected') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.productTitle?.toLowerCase().includes(q);
      const matchSeller = item.sellerName?.toLowerCase().includes(q);
      const matchBuyer = item.buyerName?.toLowerCase().includes(q);
      const matchLoc = item.locationName?.toLowerCase().includes(q);
      if (!matchTitle && !matchSeller && !matchBuyer && !matchLoc) return false;
    }

    return true;
  });

  const totalSuccess = allItems.filter((m) => m.status === 'completed' || m.status === 'return_accepted').length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            to="/profile"
            className="rounded-xl border border-surface-border p-2 text-ink-700 hover:bg-surface-muted transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-extrabold text-ink-900 flex items-center gap-2">
              <Receipt className="text-brand-500" size={24} />
              ประวัติการซื้อขายและธุรกรรม
            </h1>
            <p className="text-xs text-ink-500">
              บันทึกรายการนัดรับสินค้า การส่งมอบ และประวัติการขอคืนสินค้าทั้งหมด
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200">
          <CheckCircle2 size={16} />
          สำเร็จ {totalSuccess} รายการ
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="cm-card p-4 space-y-3 shadow-sm border border-surface-border">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center justify-between">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า, คู่ค้า, หรือจุดนัดพบ..."
              className="w-full rounded-xl border border-surface-border bg-surface-muted/60 pl-9 pr-4 py-2 text-xs text-ink-900 outline-none focus:border-brand-500 focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <div className="flex rounded-xl bg-surface-muted p-1 border border-surface-border">
              <button
                onClick={() => setFilterType('all')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${filterType === 'all' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setFilterType('buy')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${filterType === 'buy' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
              >
                รายการซื้อ
              </button>
              <button
                onClick={() => setFilterType('sell')}
                className={`rounded-lg px-2.5 py-1 font-semibold transition-colors ${filterType === 'sell' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-900'}`}
              >
                รายการขาย
              </button>
            </div>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-surface-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 outline-none"
            >
              <option value="all">ทุกสถานะ</option>
              <option value="completed">ส่งมอบสำเร็จ</option>
              <option value="return">การขอคืนสินค้า</option>
              <option value="cancelled">ยกเลิก/ปฏิเสธ</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transaction Records List */}
      {filtered.length === 0 ? (
        <EmptyState
          title="ไม่พบประวัติการทำรายการ"
          description="เมื่อคุณทำการนัดรับสินค้าและส่งมอบสำเร็จ ประวัติการซื้อขายจะปรากฏที่นี่"
          icon={Receipt}
          action={
            <Link to="/products">
              <Button size="sm">เลือกซื้อสินค้า</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isBuyer = item.buyerId === myId;
            const otherName = isBuyer ? item.sellerName : item.buyerName;
            const statusConfig = statusMap[item.status] || { label: item.status, color: 'bg-surface-muted text-ink-700' };

            return (
              <div
                key={item.id}
                className="cm-card p-4 shadow-sm border border-surface-border flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:shadow-md transition-shadow"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${isBuyer ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {isBuyer ? '🛒 ซื้อสินค้า' : '🏷️ ขายสินค้า'}
                    </span>
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold border ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-ink-900 truncate">{item.productTitle}</h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
                    <span>{isBuyer ? 'ผู้ขาย' : 'ผู้ซื้อ'}: <strong className="text-ink-700">{otherName}</strong></span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {formatDate(item.completedAt || item.date)}
                    </span>
                    {item.locationName && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 truncate max-w-[200px]">
                          <MapPin size={12} /> {item.locationName}
                        </span>
                      </>
                    )}
                  </div>

                  {item.returnReason && (
                    <p className="text-xs text-orange-600 bg-orange-50/70 p-2 rounded-lg border border-orange-100">
                      เหตุผลขอคืน: {item.returnReason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-surface-border sm:border-t-0 sm:pt-0 shrink-0">
                  <Link to="/meetups">
                    <Button variant="outline" size="sm" className="text-xs">
                      ดูนัดหมาย
                    </Button>
                  </Link>
                  {item.productId && (
                    <Link to={`/products/${item.productId}`}>
                      <Button variant="ghost" size="sm" className="text-xs text-brand-600">
                        ดูสินค้า <ArrowUpRight size={14} className="ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
