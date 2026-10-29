import { api } from "@/lib/api";
import { mockProducts, getProductById } from "@/data/mockProducts";
import { useMyListingsStore } from "@/store/myListingsStore";

const DB_TO_UI_CONDITION = {
  good: "used_normal",
  used_good: "used_normal",
  used: "used_normal",
  used_normal: "used_normal",
  fair: "used_normal",
  for_parts: "used_normal",
  new: "new",
  like_new: "new",
  "มือหนึ่ง": "new",
  "มือสอง": "used_normal",
  "สินค้ามือ 1": "new",
  "สินค้ามือ 2": "used_normal",
  1: "new",
  2: "used_normal",
  "1": "new",
  "2": "used_normal",
};

// ID ของสินค้าจริงจาก Supabase เป็นตัวเลขล้วน (BIGSERIAL) เช่น "1", "2", "3"
// ส่วน ID ของ mock data จะขึ้นต้นด้วย "p-" เช่น "p-hoodie" — ใช้เช็คแยกกันไม่ให้ยิง API ผิดๆ
function isMockId(id) {
  return typeof id === "string" && id.startsWith("p-");
}

export function formatListing(item) {
  if (!item) return null;

  // If already full UI model and contains username or displayName
  if (item.images && item.seller && typeof item.seller === "object" && item.seller.displayName && item.seller.username) {
    const condName = item.product_conditions?.name || item.condition_name || item.conditionName || (item.condition === 'new' ? 'มือหนึ่ง' : 'มือสอง');
    return {
      ...item,
      conditionName: condName,
      condition_name: condName,
      product_conditions: item.product_conditions || { id: item.condition_id, name: condName },
    };
  }

  const images = (item.listing_images || []).map((img, i) => ({
    id: img.id || `img-${i}`,
    imageUrl: img.url,
    isCover: img.is_cover ?? (i === 0),
    sortOrder: img.sort_order ?? i,
  }));

  if (images.length === 0) {
    images.push({
      id: "placeholder",
      imageUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80",
      isCover: true,
      sortOrder: 0,
    });
  }

  const sellerObj = item.seller || item.users || {};
  const rawCond = item.condition || item.condition_id || "used_normal";
  const uiCondition = DB_TO_UI_CONDITION[rawCond] || (String(rawCond).includes("หนึ่ง") ? "new" : "used_normal");
  const conditionName = item.product_conditions?.name || item.condition_name || item.conditionName || (uiCondition === "new" ? "มือหนึ่ง" : "มือสอง");
  const cleanUsername = (sellerObj.username || item.users?.username || item.seller?.username || "").replace(/^@+/, "").trim();
  const fullName = sellerObj.full_name || sellerObj.fullName || item.users?.full_name || "";
  const displayName = cleanUsername || sellerObj.display_name || sellerObj.displayName || fullName || "นักศึกษา มทร.อีสาน";

  return {
    ...item,
    id: String(item.id),
    title: item.title,
    description: item.description || "",
    price: Number(item.price) || 0,
    originalPrice: item.original_price ? Number(item.original_price) : undefined,
    condition: uiCondition,
    condition_id: item.condition_id,
    conditionName,
    condition_name: conditionName,
    product_conditions: item.product_conditions || { id: item.condition_id, name: conditionName },
    listingType: item.listing_type || "sell",
    productType: uiCondition === "new" ? "new" : "used",
    categoryId: item.categories?.slug ? `cat-${item.categories.slug}` : (item.category_id ? `cat-${item.category_id}` : "cat-others"),
    categoryName: item.categories?.name || "",
    location: item.campuses?.name || "มทร.อีสาน นครราชสีมา",
    images,
    status: item.status || "active",
    viewCount: item.view_count || 0,
    interestedCount: item.wishlist_count || 0,
    seller: {
      id: sellerObj.id || item.seller_id || "seller-unknown",
      username: cleanUsername,
      fullName,
      displayName,
      avatarUrl: sellerObj.avatar_url || sellerObj.avatarUrl || null,
      trustScore: sellerObj.average_rating ? Number(sellerObj.average_rating) : (sellerObj.trustScore || 5),
      reviewCount: sellerObj.review_count || sellerObj.reviewCount || 0,
      verificationLevel: sellerObj.verification_level || sellerObj.verificationLevel || "student_verified",
      location: item.campuses?.name || "มทร.อีสาน นครราชสีมา",
    },
    createdAt: item.created_at || new Date().toISOString(),
  };
}

export async function fetchProducts(params) {
  try {
    const res = await api.getListings(params);
    let results = (res?.listings || []).map(formatListing).filter((p) => p.status === "active");

    // หมายเหตุ: เอา mock data ออกจากผลลัพธ์จริงแล้ว เพื่อไม่ให้ปนกับสินค้าจริงจาก DB
    // ถ้าฐานข้อมูลว่างเปล่าจริงๆ ให้ไป seed ข้อมูลผ่านหน้า CreateProductPage หรือ insert เข้า Supabase ตรงๆ
    // ไม่ใช่พึ่ง mock data เพราะ mock ไม่มี id จริงใน DB ทำให้หน้า detail ยิง API พลาด (404)

    if (params?.categoryId && params.categoryId !== "cat-1" && params.categoryId !== "all") {
      const cleanTarget = params.categoryId.replace(/^cat-/, "");
      results = results.filter((p) => {
        const cat = (p.categoryId || "").replace(/^cat-/, "");
        return cat === cleanTarget;
      });
    }

    if (params?.q) {
      const q = params.q.toLowerCase().trim();
      const numQ = parseFloat(q);
      results = results.filter((p) => {
        const titleMatch = (p.title || "").toLowerCase().includes(q);
        const descMatch = (p.description || "").toLowerCase().includes(q);
        const priceMatch = !isNaN(numQ) && (p.price === numQ || String(p.price).includes(q));
        return titleMatch || descMatch || priceMatch;
      });
    }
    if (params?.min_price) {
      const min = parseFloat(params.min_price);
      if (!isNaN(min)) results = results.filter((p) => p.price >= min);
    }
    if (params?.max_price) {
      const max = parseFloat(params.max_price);
      if (!isNaN(max)) results = results.filter((p) => p.price <= max);
    }

    if (params?.sort === "price_desc") {
      results.sort((a, b) => b.price - a.price);
    } else if (params?.sort === "price_asc") {
      results.sort((a, b) => a.price - b.price);
    } else if (params?.sort === "popular") {
      results.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    } else if (params?.sort === "newest") {
      results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    return results;
  } catch (err) {
    // Backend ล่มจริงๆ เท่านั้นถึงจะ fallback ไปใช้ mock/local เพื่อให้หน้าเว็บยังพอใช้งานได้
    console.warn("fetchProducts backend error, falling back to local/mock:", err);
    let results = [...(useMyListingsStore.getState().listings || []), ...mockProducts].filter((p) => p.status === "active");
    if (params?.categoryId && params.categoryId !== "cat-1" && params.categoryId !== "all") {
      const cleanTarget = params.categoryId.replace(/^cat-/, "");
      results = results.filter((p) => (p.categoryId || "").replace(/^cat-/, "") === cleanTarget);
    }
    if (params?.q) {
      const q = params.q.toLowerCase().trim();
      const numQ = parseFloat(q);
      results = results.filter((p) => {
        const titleMatch = (p.title || "").toLowerCase().includes(q);
        const descMatch = (p.description || "").toLowerCase().includes(q);
        const priceMatch = !isNaN(numQ) && (p.price === numQ || String(p.price).includes(q));
        return titleMatch || descMatch || priceMatch;
      });
    }
    if (params?.min_price) {
      const min = parseFloat(params.min_price);
      if (!isNaN(min)) results = results.filter((p) => p.price >= min);
    }
    if (params?.max_price) {
      const max = parseFloat(params.max_price);
      if (!isNaN(max)) results = results.filter((p) => p.price <= max);
    }
    if (params?.sort === "price_desc") {
      results.sort((a, b) => b.price - a.price);
    } else if (params?.sort === "price_asc") {
      results.sort((a, b) => a.price - b.price);
    } else if (params?.sort === "popular") {
      results.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    } else if (params?.sort === "newest") {
      results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    return results;
  }
}

export async function fetchProductDetail(id) {
  // ถ้าเป็น mock id (ขึ้นต้นด้วย "p-") ไม่ต้องยิง API เลย เพราะรู้อยู่แล้วว่า backend หาไม่เจอแน่ๆ (404)
  if (isMockId(id)) {
    const localListings = useMyListingsStore.getState().listings || [];
    return localListings.find((p) => String(p.id) === String(id)) ?? getProductById(id);
  }

  try {
    const res = await api.getListingDetail(id);
    if (res?.listing) {
      return formatListing(res.listing);
    }
  } catch (err) {
    console.warn("fetchProductDetail backend error, trying fallback:", err);
  }

  const localListings = useMyListingsStore.getState().listings || [];
  return localListings.find((p) => String(p.id) === String(id)) ?? getProductById(id);
}