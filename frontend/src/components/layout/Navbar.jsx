import { Heart, MessageCircle, Search, ShoppingBag, Tag, X, User, LogOut, LogIn, UserPlus, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { NotificationDropdown } from './NotificationDropdown';
import { useFeedStore } from '@/store/feedStore';
import { useAuthStore } from '@/store/authStore';
import { useChatStore } from '@/store/chatStore';
import logoImg from '@/assets/logo.png';

export function Navbar() {
  const [q, setQ] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const [searchType, setSearchType] = useState('all'); // 'all' | 'products' | 'wantToBuy'

  const recordSearch = useFeedStore((s) => s.recordSearch);
  const { isAuthenticated, user, logout } = useAuthStore();
  const unreadChatCount = useChatStore((s) => s.unreadCount);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (q.trim()) recordSearch(q.trim());
    const query = q.trim() ? `q=${encodeURIComponent(q.trim())}` : '';
    if (searchType === 'wantToBuy') {
      navigate(`/want-to-buy${query ? `?${query}` : ''}`);
    } else {
      const typeParam = searchType === 'products' ? 'type=products' : '';
      const params = [query, typeParam].filter(Boolean).join('&');
      navigate(`/products${params ? `?${params}` : ''}`);
    }
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 bg-brand-500 shadow-md">
      <div className="mx-auto max-w-7xl px-3 md:px-6">

        {/* ── Row 1: Logo + Search + Icons ── */}
        <div className="flex h-14 md:h-[64px] items-center gap-3">

          {/* Logo */}
          <Link to="/" className="flex shrink-0 items-center group">
            <img
              src={logoImg}
              alt="RmutiMarket"
              className="h-10 md:h-12 w-auto object-contain transition-transform group-hover:scale-105"
            />
          </Link>

          {/* Search — desktop only */}
          <form onSubmit={handleSearch} className="mx-3 hidden md:flex flex-1 max-w-2xl items-center">
            <div className={`flex w-full items-center rounded-lg overflow-hidden bg-white transition-all duration-200 ${
              searchFocused ? 'ring-2 ring-white/50 shadow-lg' : 'shadow-sm'
            }`}>
              <select
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                aria-label="เลือกประเภทที่ต้องการค้นหา"
                className="bg-orange-50/70 hover:bg-orange-100/70 text-xs font-bold text-ink-800 px-3 py-2.5 border-r border-gray-200 outline-none cursor-pointer transition-colors shrink-0"
              >
                <option value="all">ทั้งหมด</option>
                <option value="products">สินค้า</option>
                <option value="wantToBuy">โพสต์ตามหา</option>
              </select>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={
                  searchType === 'wantToBuy'
                    ? 'ค้นหาโพสต์ตามหา, งบประมาณ, รายละเอียด...'
                    : searchType === 'products'
                    ? 'ค้นหาชื่อสินค้า, ราคา, รายละเอียด...'
                    : 'ค้นหาสินค้า, ราคา, รายละเอียด หรือโพสต์ตามหา...'
                }
                className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-gray-400 px-4 py-2.5"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} className="shrink-0 px-2 text-gray-400 hover:text-gray-700">
                  <X size={15} />
                </button>
              )}
              <button
                type="submit"
                className="shrink-0 flex items-center justify-center bg-brand-600 hover:bg-brand-700 text-white px-4 h-full py-2.5 transition-colors"
              >
                <Search size={18} />
              </button>
            </div>
          </form>

          {/* Spacer on mobile so icons go right */}
          <div className="flex-1 md:hidden" />

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-1 md:gap-2">

            {/* Chat — hidden on mobile since it is prominently in bottom nav */}
            <Link to="/chat" className="relative hidden md:flex h-9 w-9 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white transition-colors" aria-label="แชท">
              <MessageCircle size={21} />
              {unreadChatCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-white text-[9px] font-extrabold text-brand-500 px-1 border-2 border-brand-500 shadow-xs animate-in zoom-in-75">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </Link>

            {/* Wishlist — hidden on xs */}
            <Link to="/wishlist" className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full text-white/90 hover:bg-white/15 hover:text-white transition-colors" aria-label="รายการโปรด">
              <Heart size={21} />
            </Link>

            {/* Notification bell */}
            <NotificationDropdown />

            {/* Sell button — hidden on mobile */}
            <Link to="/products/create" className="hidden sm:flex items-center gap-1.5 rounded-lg bg-white px-3 md:px-4 py-2 text-sm font-bold text-brand-500 hover:bg-orange-50 transition-colors shadow-sm">
              <ShoppingBag size={15} />
              <span>ลงขาย</span>
            </Link>

            {/* ตามหาสินค้า — desktop only */}
            <Link to="/want-to-buy" className="hidden lg:flex items-center gap-1.5 rounded-lg border-2 border-white/80 bg-transparent px-4 py-1.5 text-sm font-bold text-white hover:bg-white/10 transition-colors">
              <Tag size={14} />
              ตามหาสินค้า
            </Link>

            {/* ปุ่มกลับหน้าระบบแอดมิน (Admin Portal) สำหรับบัญชีผู้ดูแล */}
            {isAuthenticated && user?.role === 'admin' && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white px-2.5 sm:px-3 py-1.5 text-xs font-extrabold border border-white/30 transition-all shadow-sm"
                title="กลับไปยังหน้าระบบผู้ดูแลระบบ (Admin Portal)"
              >
                <ShieldCheck size={16} className="text-amber-300 shrink-0" />
                <span className="hidden sm:inline">กลับหน้า Admin</span>
                <span className="sm:hidden">Admin</span>
              </Link>
            )}

            {/* Auth */}
            {isAuthenticated ? (
              <div className="relative" ref={menuRef}>
                <button onClick={() => setUserMenuOpen((v) => !v)} className="flex items-center gap-1.5 p-1 rounded-full hover:bg-white/15 transition-colors">
                  <span className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-brand-500 shadow-sm overflow-hidden border border-white/20">
                    {user?.avatar_url || user?.avatarUrl || user?.profile_image_url ? (
                      <img src={user.avatar_url || user.avatarUrl || user.profile_image_url} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      user?.username?.[0]?.toUpperCase() || user?.name?.[0] || 'U'
                    )}
                  </span>
                  <span className="hidden md:inline text-sm font-semibold text-white">
                    {user?.username || user?.name?.split(' ')[0] || 'ผู้ใช้'} ▾
                  </span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white p-2 shadow-xl border border-gray-100 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-xs font-bold text-ink-900 truncate">
                        {user?.username || user?.name}
                      </p>
                      {user?.name && user?.username && (
                        <p className="text-[11px] font-medium text-ink-600 truncate">{user.name}</p>
                      )}
                      <p className="text-[10px] text-ink-400 truncate mt-0.5">{user?.email}</p>
                    </div>

                    {user?.role === 'admin' && (
                      <div className="py-1 border-b border-gray-100">
                        <Link
                          to="/admin"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors"
                        >
                          <ShieldCheck size={15} className="text-orange-500" />
                          <span>กลับหน้าแอดมิน (Admin Portal)</span>
                        </Link>
                      </div>
                    )}

                    <div className="py-1">
                      <Link to="/profile" onClick={() => setUserMenuOpen(false)} className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-orange-50 hover:text-brand-600 rounded-xl transition-colors">
                        <User size={15} />โปรไฟล์ของฉัน
                      </Link>
                    </div>
                    <div className="pt-1 border-t border-gray-100">
                      <button onClick={handleLogout} className="flex w-full items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-xl transition-colors">
                        <LogOut size={15} />ออกจากระบบ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link to="/login" className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white/90 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <LogIn size={16} />
                  <span className="hidden sm:inline">เข้าสู่ระบบ</span>
                </Link>
                <Link to="/register" className="flex items-center gap-1 px-3 md:px-4 py-1.5 text-sm font-bold text-brand-600 bg-white hover:bg-orange-50 rounded-lg transition-all shadow-sm">
                  <UserPlus size={16} />
                  <span className="hidden sm:inline">สมัครสมาชิก</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Search bar — mobile only ── */}
        <div className="pb-2.5 md:hidden">
          <form onSubmit={handleSearch} className="flex w-full items-center">
            <div className={`flex w-full items-center rounded-xl overflow-hidden bg-white shadow-xs transition-all duration-200 ${
              searchFocused ? 'ring-2 ring-white/60 shadow-md' : ''
            }`}>
              <div className="pl-3 text-gray-400 shrink-0">
                <Search size={16} />
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="ค้นหาสินค้า, ราคา, รายละเอียด..."
                className="w-full bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-gray-400 px-2.5 py-2.5"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} className="shrink-0 px-2 text-gray-400 hover:text-gray-700">
                  <X size={15} />
                </button>
              )}
              <button
                type="submit"
                className="shrink-0 flex items-center justify-center bg-brand-600 hover:bg-brand-700 active:scale-95 text-white px-3.5 py-2.5 transition-all text-xs font-bold"
              >
                ค้นหา
              </button>
            </div>
          </form>
        </div>

      </div>
    </header>
  );
}
