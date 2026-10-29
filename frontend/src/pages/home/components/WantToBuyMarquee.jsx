import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clock,
  PlusCircle,
  Banknote,
  Flame,
  ChevronRight
} from 'lucide-react';
import { api } from '@/lib/api';
import { useWantToBuyStore } from '@/store/wantToBuyStore';
import { formatCurrency } from '@/utils/formatCurrency';

function timeAgo(dateStr) {
  if (!dateStr) return 'เมื่อสักครู่';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'เมื่อสักครู่';
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

export function WantToBuyMarquee() {
  const navigate = useNavigate();
  const localRequests = useWantToBuyStore((s) => s.requests || []);
  const [dbPosts, setDbPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    api.getWantToBuyPosts()
      .then((res) => {
        if (!isMounted) return;
        if (res?.posts && res.posts.length > 0) {
          const mapped = res.posts
            .filter((p) => p.wanted_post_status?.code !== 'CANCELLED')
            .map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              budget: p.budget_max || p.budget_min || 0,
              categoryName: p.categories?.name || 'ทั่วไป',
              author: {
                id: p.users?.id,
                name: p.users?.display_name || p.users?.username || 'สมาชิก RMUTI',
                avatarUrl: p.users?.avatar_url || null,
              },
              createdAt: p.created_at,
              isDb: true,
            }));
          setDbPosts(mapped);
        }
      })
      .catch((err) => {
        console.warn('Could not load WTB posts from database:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ดึงเฉพาะโพสต์จริงจาก Database (และโพสต์จริงที่ผู้ใช้เพิ่งสร้าง) ไม่ใช้ mock data
  const realPosts = useMemo(() => {
    const list = [...dbPosts];

    for (const r of localRequests) {
      if (r.status === 'cancelled') continue;
      if (!list.some((p) => String(p.id) === String(r.id))) {
        list.push({
          id: r.id,
          title: r.title,
          description: r.description,
          budget: r.budget || 0,
          categoryName: r.categoryName || 'ทั่วไป',
          author: {
            id: r.author?.id,
            name: r.author?.name || 'สมาชิก RMUTI',
            avatarUrl: r.author?.avatarUrl || null,
          },
          createdAt: r.createdAt || new Date().toISOString(),
        });
      }
    }

    return list;
  }, [dbPosts, localRequests]);

  // สร้าง list ที่ยาวพอสำหรับ loop marquee ให้เลื่อนเนียนสนิทไร้รอยต่อ (Seamless Loop)
  // โดยวนซ้ำเฉพาะโพสต์จริงที่มีอยู่ใน Database
  const marqueeItems = useMemo(() => {
    if (realPosts.length === 0) return [];
    let base = [...realPosts];
    // วนซ้ำโพสต์จริงเพื่อให้แถบการ์ดยาวพอสำหรับการเลื่อนแบบ marquee (อย่างน้อย 8 ชิ้น)
    while (base.length < 8) {
      base = [...base, ...realPosts];
    }
    // เบิ้ล 2 เท่า สำหรับ -50% translateX loop
    return [...base, ...base];
  }, [realPosts]);

  // ถ้าโหลดเสร็จแล้วไม่มีโพสต์จริงใน DB เลย ไม่ต้องแสดงแถบ
  if (!loading && realPosts.length === 0) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-r from-orange-50/80 via-white to-amber-50/80 shadow-xs p-3.5 sm:p-4">
      {/* ─── Header Row ─── */}
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Live pulsing indicator */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#f95721] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#f95721]"></span>
          </span>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-sm font-black text-ink-900">
              <Flame size={16} className="text-[#f95721] fill-[#f95721]" />
              ตามหาสินค้าด่วน
            </span>
            <span className="hidden sm:inline-block text-[11px] font-semibold text-gray-500">
              · มีของไม่ได้ใช้ ลองดูว่าเพื่อนกำลังตามหาอะไรอยู่
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/want-to-buy/create"
            className="hidden xs:inline-flex items-center gap-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1 text-xs font-bold transition-colors shadow-2xs"
          >
            <PlusCircle size={13} />
            <span>โพสต์ตามหา</span>
          </Link>

          <Link
            to="/want-to-buy"
            className="shrink-0 inline-flex items-center gap-0.5 text-xs font-bold text-[#f95721] hover:text-orange-700 transition-colors whitespace-nowrap"
          >
            <span className="whitespace-nowrap">ดูทั้งหมด</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* ─── Marquee Scroller with Gradient Shadow Edges ─── */}
      <div className="relative w-full overflow-hidden py-1">
        {/* Left fade gradient */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />

        {/* Right fade gradient */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 sm:w-16 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />

        {/* Moving Track */}
        <div className="animate-marquee gap-3 sm:gap-4 select-none">
          {marqueeItems.map((item, index) => {
            const authorInitial = (item.author?.name || 'น').charAt(0);

            return (
              <div
                key={`${item.id}-${index}`}
                onClick={() => navigate('/want-to-buy')}
                className="group w-[250px] sm:w-[280px] shrink-0 cursor-pointer rounded-xl border border-gray-100 bg-white p-3 shadow-2xs hover:shadow-md hover:border-orange-200 hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  {/* Category & Time */}
                  <div className="mb-1.5 flex items-center justify-between gap-1 text-[10px]">
                    <span className="inline-flex items-center rounded-md bg-orange-50 px-2 py-0.5 font-bold text-[#f95721] border border-orange-100/60 truncate max-w-[150px]">
                      {item.categoryName}
                    </span>
                    <span className="flex items-center gap-0.5 text-gray-400 shrink-0">
                      <Clock size={10} />
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>

                  {/* Title */}
                  <h4 className="text-xs sm:text-[13px] font-bold text-ink-900 line-clamp-1 group-hover:text-[#f95721] transition-colors leading-snug">
                    {item.title}
                  </h4>

                  {/* Description */}
                  {item.description && (
                    <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1 leading-normal">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Footer: Author & Budget */}
                <div className="mt-2.5 pt-2 border-t border-gray-50 flex items-center justify-between gap-2">
                  <div
                    onClick={(e) => {
                      if (item.author?.id) {
                        e.stopPropagation();
                        navigate(`/profile/${item.author.id}`);
                      }
                    }}
                    className="flex items-center gap-1.5 min-w-0 hover:opacity-80 transition-opacity"
                    title={item.author?.name ? `ดูโปรไฟล์ ${item.author.name}` : ''}
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-[#f95721] text-[10px] font-bold text-white overflow-hidden shadow-2xs">
                      {item.author?.avatarUrl ? (
                        <img src={item.author.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        authorInitial
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-gray-600 truncate max-w-[90px]">
                      {item.author?.name || 'สมาชิก RMUTI'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="rounded-lg bg-orange-50 px-2 py-0.5 text-[11px] font-black text-[#f95721] border border-orange-100 flex items-center gap-0.5 shadow-2xs">
                      <Banknote size={11} className="text-[#f95721]" />
                      {formatCurrency(item.budget)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
