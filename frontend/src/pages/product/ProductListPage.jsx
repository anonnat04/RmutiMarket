import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  SlidersHorizontal,
  X,
  Search,
  PackageSearch,
  ArrowLeft,
  Flame,
  Clock,
  Banknote,
  MessageCircle,
  Sparkles,
  ShoppingBag,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  RotateCcw,
  Check
} from "lucide-react";
import { categories } from "@/constants/categories";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/common/EmptyState";
import { fetchProducts } from "@/services/productService";
import { api } from "@/lib/api";
import { useWantToBuyStore } from "@/store/wantToBuyStore";
import { formatCurrency } from "@/utils/formatCurrency";

function timeAgo(dateStr) {
  if (!dateStr) return "เมื่อสักครู่";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

// ตัวเลือกช่วงราคายอดนิยม
const PRICE_PRESETS = [
  { label: "ทุกราคา", min: null, max: null },
  { label: "ต่ำกว่า ฿200", min: null, max: 200 },
  { label: "฿200 - ฿500", min: 200, max: 500 },
  { label: "฿500 - ฿1,000", min: 500, max: 1000 },
  { label: "มากกว่า ฿1,000", min: 1000, max: null },
];

export function ProductListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSlug = searchParams.get("category") ?? "all";
  const q = searchParams.get("q") ?? "";
  const initialType = searchParams.get("type") === "wantToBuy" ? "wantToBuy" : "products";

  // เลือกว่าจะดู "สินค้า" หรือ "โพสต์ตามหาสินค้า"
  const [activeTab, setActiveTab] = useState(initialType); // 'products' | 'wantToBuy'

  // การเรียงลำดับราคา (สูงสุดไปต่ำสุด / ต่ำสุดไปสูงสุด / ล่าสุด)
  const [sortBy, setSortBy] = useState("newest"); // 'newest' | 'price_desc' | 'price_asc'

  // ช่วงราคาที่กำหนดเอง
  const [minPriceInput, setMinPriceInput] = useState("");
  const [maxPriceInput, setMaxPriceInput] = useState("");
  const [appliedMinPrice, setAppliedMinPrice] = useState(null);
  const [appliedMaxPrice, setAppliedMaxPrice] = useState(null);

  // แผงตัวกรองเพิ่มเติม (เปิด/ปิด)
  const [showFilters, setShowFilters] = useState(false);

  const [products, setProducts] = useState([]);
  const [wantToBuyPosts, setWantToBuyPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const localRequests = useWantToBuyStore((s) => s.requests || []);

  // เมื่อ URL เปลี่ยนประเภท ให้เปลี่ยนแท็บตาม
  useEffect(() => {
    const urlType = searchParams.get("type");
    if (urlType === "wantToBuy") setActiveTab("wantToBuy");
    else if (urlType === "products") setActiveTab("products");
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    const category = categories.find((c) => c.slug === activeSlug);

    // 1. ดึงสินค้า
    const productPromise = fetchProducts({
      categoryId: category?.id,
      q,
      sort: sortBy,
      min_price: appliedMinPrice,
      max_price: appliedMaxPrice,
    });

    // 2. ดึงโพสต์ตามหาสินค้า
    const wtbParams = {};
    if (q) wtbParams.q = q;
    if (category && category.id !== "all" && category.id !== "cat-1") {
      wtbParams.category = category.slug || category.id;
    }
    const wtbPromise = api.getWantToBuyPosts(wtbParams).catch((err) => {
      console.warn("Could not load WTB posts in search:", err);
      return { posts: [] };
    });

    Promise.all([productPromise, wtbPromise]).then(([prods, wtbRes]) => {
      const fetchedProducts = prods || [];
      setProducts(fetchedProducts);

      // รวมโพสต์ตามหาจาก backend และ local store
      const dbList = (wtbRes?.posts || [])
        .filter((p) => p.wanted_post_status?.code !== "CANCELLED")
        .map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          budget: p.budget_max || p.budget_min || 0,
          categoryId: p.categories?.slug || (p.category_id ? `cat-${p.category_id}` : "others"),
          categoryName: p.categories?.name || "ทั่วไป",
          author: {
            id: p.users?.id || p.buyer_id,
            name: p.users?.display_name || p.users?.username || "สมาชิก RMUTI",
            avatarUrl: p.users?.avatar_url || null,
          },
          createdAt: p.created_at,
          status: p.wanted_post_status?.code?.toLowerCase() === "completed" ? "resolved" : "active",
        }));

      for (const r of localRequests) {
        if (r.status === "cancelled") continue;
        if (!dbList.some((item) => String(item.id) === String(r.id))) {
          let match = true;
          if (q) {
            const qLower = q.toLowerCase().trim();
            const numQ = parseFloat(qLower);
            const titleMatch = (r.title || "").toLowerCase().includes(qLower);
            const descMatch = (r.description || "").toLowerCase().includes(qLower);
            const budgetMatch = !isNaN(numQ) && (r.budget === numQ || String(r.budget).includes(qLower));
            if (!titleMatch && !descMatch && !budgetMatch) match = false;
          }
          if (category && category.id !== "all" && category.id !== "cat-1") {
            if (r.categoryId !== category.slug && r.categoryId !== category.id) match = false;
          }
          if (match) {
            dbList.push({
              id: r.id,
              title: r.title,
              description: r.description,
              budget: r.budget || 0,
              categoryId: r.categoryId || "others",
              categoryName: r.categoryName || "ทั่วไป",
              author: {
                id: r.author?.id,
                name: r.author?.name || "สมาชิก RMUTI",
                avatarUrl: r.author?.avatarUrl || null,
              },
              createdAt: r.createdAt || new Date().toISOString(),
              status: r.status || "active",
            });
          }
        }
      }

      setWantToBuyPosts(dbList);

      // ถ้าค้นหาแล้วไม่พบสินค้า แต่พบโพสต์ตามหา และไม่ได้ระบุ type มาชัดเจน ให้สลับแท็บไปที่โพสต์ตามหาอัตโนมัติ
      if (q && !searchParams.get("type") && fetchedProducts.length === 0 && dbList.length > 0) {
        setActiveTab("wantToBuy");
      }

      setLoading(false);
    });
  }, [activeSlug, q, sortBy, appliedMinPrice, appliedMaxPrice, localRequests, searchParams]);

  // กรองและเรียงลำดับโพสต์ตามหาสินค้าตามตัวเลือกราคา
  const sortedWantToBuyPosts = useMemo(() => {
    let list = [...wantToBuyPosts];

    if (appliedMinPrice !== null) {
      list = list.filter((p) => p.budget >= appliedMinPrice);
    }
    if (appliedMaxPrice !== null) {
      list = list.filter((p) => p.budget <= appliedMaxPrice);
    }

    if (sortBy === "price_desc") {
      list.sort((a, b) => b.budget - a.budget);
    } else if (sortBy === "price_asc") {
      list.sort((a, b) => a.budget - b.budget);
    } else {
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return list;
  }, [wantToBuyPosts, sortBy, appliedMinPrice, appliedMaxPrice]);

  // การกดใช้ช่วงราคา
  const handleApplyPriceFilter = (e) => {
    if (e) e.preventDefault();
    const min = minPriceInput ? parseFloat(minPriceInput) : null;
    const max = maxPriceInput ? parseFloat(maxPriceInput) : null;
    setAppliedMinPrice(min);
    setAppliedMaxPrice(max);
  };

  const handleResetPriceFilter = () => {
    setMinPriceInput("");
    setMaxPriceInput("");
    setAppliedMinPrice(null);
    setAppliedMaxPrice(null);
  };

  const hasPriceFilter = appliedMinPrice !== null || appliedMaxPrice !== null;

  return (
    <div className="flex flex-col gap-5">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#f95721] transition-colors shadow-2xs"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black text-ink-900 flex items-center gap-1.5 truncate">
              <PackageSearch size={19} className="text-brand-500 shrink-0" />
              <span className="truncate">{q ? `ค้นหา "${q}"` : "ค้นหาสินค้า & โพสต์ตามหา"}</span>
            </h1>
            {!loading && (
              <p className="text-[11px] text-ink-500 truncate mt-0.5">
                พบสินค้า {products.length} รายการ · โพสต์ตามหา {wantToBuyPosts.length} รายการ
              </p>
            )}
          </div>
        </div>

        {/* ปุ่มลัด โพสต์ตามหาของ */}
        <Link
          to="/want-to-buy/create"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-bold text-[#f95721] hover:bg-orange-100 transition-colors shadow-2xs whitespace-nowrap"
        >
          <Sparkles size={13} />
          <span className="hidden xs:inline">โพสต์</span>ตามหาของ
        </Link>
      </div>

      {/* ─── ตัวเลือกเลือกค้นหา: สินค้าที่ลงขาย vs โพสต์ตามหาสินค้า ─── */}
      <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl gap-1">
        <button
          onClick={() => {
            setActiveTab("products");
            const next = new URLSearchParams(searchParams);
            next.set("type", "products");
            setSearchParams(next);
          }}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "products"
              ? "bg-white text-[#f95721] shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <ShoppingBag size={15} className="shrink-0" />
          <span className="truncate">สินค้าที่ลงขาย ({products.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab("wantToBuy");
            const next = new URLSearchParams(searchParams);
            next.set("type", "wantToBuy");
            setSearchParams(next);
          }}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === "wantToBuy"
              ? "bg-white text-[#f95721] shadow-xs"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Flame size={15} className={activeTab === "wantToBuy" ? "text-[#f95721] shrink-0" : "text-gray-400 shrink-0"} />
          <span className="truncate">โพสต์ตามหาของ ({sortedWantToBuyPosts.length})</span>
        </button>
      </div>

      {/* ─── แถบเรียงลำดับราคาและตัวกรอง (Sort & Filter Toolbar) ─── */}
      <div className="rounded-2xl border border-gray-100 bg-white p-2.5 sm:p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
          <span className="text-xs font-bold text-gray-500 shrink-0 hidden sm:inline-flex items-center gap-1 mr-1">
            <SlidersHorizontal size={13} />
            เรียง:
          </span>

          {/* ปุ่ม ล่าสุด */}
          <button
            onClick={() => setSortBy("newest")}
            className={`shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              sortBy === "newest"
                ? "bg-[#f95721] text-white shadow-xs"
                : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-orange-50 hover:text-[#f95721]"
            }`}
          >
            <Clock size={12} />
            <span>ล่าสุด</span>
          </button>

          {/* ปุ่ม ราคาต่ำสุดไปสูงสุด */}
          <button
            onClick={() => setSortBy("price_asc")}
            className={`shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              sortBy === "price_asc"
                ? "bg-[#f95721] text-white shadow-xs"
                : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-orange-50 hover:text-[#f95721]"
            }`}
          >
            <ArrowUpNarrowWide size={12} />
            <span>ราคาต่ำ → สูง</span>
          </button>

          {/* ปุ่ม ราคาสูงสุดไปต่ำสุด */}
          <button
            onClick={() => setSortBy("price_desc")}
            className={`shrink-0 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
              sortBy === "price_desc"
                ? "bg-[#f95721] text-white shadow-xs"
                : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-orange-50 hover:text-[#f95721]"
            }`}
          >
            <ArrowDownWideNarrow size={12} />
            <span>ราคาสูง → ต่ำ</span>
          </button>

          {/* ปุ่มเปิดแผงกรองช่วงราคา */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ml-auto ${
              hasPriceFilter || showFilters
                ? "bg-orange-50 text-[#f95721] border border-orange-300"
                : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
            }`}
          >
            <Banknote size={13} />
            <span>{hasPriceFilter ? "กำลังกรองราคา" : "ช่วงราคา..."}</span>
          </button>
        </div>

        {/* ─── แผงกำหนดช่วงราคา (Min - Max Price Range) ─── */}
        {showFilters && (
          <div className="pt-3 border-t border-gray-100 space-y-2.5 animate-fade-in">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-gray-600">ช่วงราคาที่ต้องการ:</span>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">฿</span>
                  <input
                    type="number"
                    value={minPriceInput}
                    onChange={(e) => setMinPriceInput(e.target.value)}
                    placeholder="ต่ำสุด"
                    className="w-24 pl-6 pr-2 py-1.5 rounded-xl border border-gray-200 text-xs text-ink-900 outline-none focus:border-[#f95721]"
                  />
                </div>
                <span className="text-gray-400 text-xs">-</span>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">฿</span>
                  <input
                    type="number"
                    value={maxPriceInput}
                    onChange={(e) => setMaxPriceInput(e.target.value)}
                    placeholder="สูงสุด"
                    className="w-24 pl-6 pr-2 py-1.5 rounded-xl border border-gray-200 text-xs text-ink-900 outline-none focus:border-[#f95721]"
                  />
                </div>
                <button
                  onClick={handleApplyPriceFilter}
                  className="rounded-xl bg-[#f95721] text-white px-3 py-1.5 text-xs font-bold hover:bg-orange-600 transition-colors shadow-2xs"
                >
                  ใช้ตัวกรอง
                </button>
                {hasPriceFilter && (
                  <button
                    onClick={handleResetPriceFilter}
                    className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 transition-colors py-1.5 px-2"
                  >
                    <RotateCcw size={12} />
                    <span>ล้างราคา</span>
                  </button>
                )}
              </div>
            </div>

            {/* ปุ่มลัดช่วงราคา */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PRICE_PRESETS.map((preset, idx) => {
                const isSelected = appliedMinPrice === preset.min && appliedMaxPrice === preset.max;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setMinPriceInput(preset.min ? String(preset.min) : "");
                      setMaxPriceInput(preset.max ? String(preset.max) : "");
                      setAppliedMinPrice(preset.min);
                      setAppliedMaxPrice(preset.max);
                    }}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      isSelected
                        ? "bg-orange-500 text-white shadow-2xs"
                        : "bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-[#f95721]"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── หมวดหมู่สินค้า (เมื่ออยู่ในแท็บสินค้า) ─── */}
      {activeTab === "products" && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                if (cat.slug === "all") nextParams.delete("category");
                else nextParams.set("category", cat.slug);
                setSearchParams(nextParams);
              }}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold transition-all duration-150 ${
                activeSlug === cat.slug
                  ? "bg-gradient-to-r from-brand-500 to-orange-500 text-white shadow-md"
                  : "bg-white text-ink-600 border border-surface-border hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* ─── Active query chip ─── */}
      {q && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3.5 py-1 text-xs font-semibold text-brand-700">
            <Search size={12} />
            ค้นหา: "{q}"
            <button
              onClick={() => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.delete("q");
                setSearchParams(nextParams);
              }}
              className="ml-1 hover:text-red-500 transition-colors"
              title="ล้างคำค้นหา"
            >
              <X size={12} />
            </button>
          </span>
          {hasPriceFilter && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-bold text-[#f95721]">
              ช่วงราคา: {appliedMinPrice ? `฿${appliedMinPrice}` : "0"} - {appliedMaxPrice ? `฿${appliedMaxPrice}` : "ไม่จำกัด"}
              <button onClick={handleResetPriceFilter} className="hover:text-red-500">
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* ─── รายการแท็บ 1: สินค้าที่ลงขาย ─── */}
      {activeTab === "products" && (
        <div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-surface-muted" />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center space-y-3">
              <EmptyState
                title="ไม่พบสินค้าที่ตรงกับการค้นหา"
                description={
                  sortedWantToBuyPosts.length > 0
                    ? `แต่พบโพสต์ตามหาสินค้านี้อยู่ ${sortedWantToBuyPosts.length} รายการ ลองดูว่ามีของตรงกันไหม`
                    : "ลองเปลี่ยนคำค้นหา หรือปรับตัวเลือกช่วงราคาดูนะ"
                }
              />
              {sortedWantToBuyPosts.length > 0 && (
                <button
                  onClick={() => setActiveTab("wantToBuy")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-xs font-bold transition-colors shadow-xs"
                >
                  <Flame size={14} /> ดูโพสต์ตามหา ({sortedWantToBuyPosts.length} รายการ)
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── รายการแท็บ 2: โพสต์ตามหาสินค้า ─── */}
      {activeTab === "wantToBuy" && (
        <div>
          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-surface-muted" />
              ))}
            </div>
          ) : sortedWantToBuyPosts.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center space-y-3">
              <EmptyState
                title="ไม่พบโพสต์ตามหาสินค้าที่ตรงกัน"
                description="ยังไม่มีใครโพสต์ตามหาสินค้านี้ คุณสามารถเป็นคนแรกที่โพสต์ตามหาได้เลย"
              />
              <Link
                to="/want-to-buy/create"
                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 text-xs font-bold transition-colors shadow-xs"
              >
                <Sparkles size={14} /> สร้างโพสต์ตามหาสินค้า
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedWantToBuyPosts.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col justify-between rounded-2xl border border-surface-border bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div>
                    {/* Category & Time */}
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-600">
                        {item.categoryName}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-ink-400">
                        <Clock size={11} />
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-bold text-ink-900 leading-snug line-clamp-2">
                      {item.title}
                    </h3>

                    {/* Description */}
                    {item.description && (
                      <p className="mt-1.5 text-xs text-ink-600 leading-relaxed line-clamp-3">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-4 pt-3 border-t border-surface-border flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      {/* Author */}
                      <Link
                        to={item.author?.id ? `/profile/${item.author.id}` : "#"}
                        className="flex items-center gap-2 group/author hover:opacity-85 transition-opacity"
                        title="ดูโปรไฟล์ผู้โพสต์"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 text-xs font-bold text-white overflow-hidden shadow-2xs">
                          {item.author?.avatarUrl ? (
                            <img src={item.author.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (item.author?.name ? item.author.name.charAt(0) : "น")
                          )}
                        </div>
                        <span className="text-xs font-bold text-ink-900 group-hover/author:text-brand-600 transition-colors">
                          {item.author?.name || "สมาชิก RMUTI"}
                        </span>
                      </Link>

                      {/* Budget */}
                      <div className="flex items-center gap-1 text-sm font-extrabold text-brand-600">
                        <Banknote size={14} />
                        {formatCurrency(item.budget)}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/chat?partnerId=${item.author?.id}`)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                      >
                        <MessageCircle size={14} /> ทักไปเสนอขาย
                      </button>
                      {item.author?.id && (
                        <Link
                          to={`/profile/${item.author.id}`}
                          className="flex items-center justify-center rounded-xl border border-surface-border bg-white px-3 py-2 text-xs font-bold text-ink-700 hover:bg-gray-50 hover:text-brand-600 transition-colors shadow-2xs"
                        >
                          ดูโปรไฟล์
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
