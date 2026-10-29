const { supabase } = require("../config/db");
const { formatUser, getStatusId, CATEGORY_META } = require("../utils/statusHelper");

const DAY = 24 * 60 * 60 * 1000;
const FALLBACK_COLORS = ["#F97316", "#FACC15", "#22C55E", "#3B82F6", "#0EA5E9", "#CBD5E1"];

async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function countRows(table, { filter, col, from, to } = {}) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  if (col && from) q = q.gte(col, from);
  if (col && to) q = q.lt(col, to);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

async function safe(promise, fallback) {
  try {
    return await promise;
  } catch (err) {
    console.error("[adminDashboard] partial failure:", err.message || err);
    return fallback;
  }
}

async function getDashboard(req, res, next) {
  try {
    const now = Date.now();
    const d30 = new Date(now - 30 * DAY).toISOString();
    const d60 = new Date(now - 60 * DAY).toISOString();

    const completedStatusId = getStatusId("transaction_status", "COMPLETED") || 3;

    const notAdmin = (q) => q.neq("role", "admin");
    const isCompleted = (q) => q.eq("status_id", completedStatusId);

    // KPI 5 Cards
    const [
      totalUsers, usersNow, usersPrev,
      totalProducts, productsNow, productsPrev,
      totalCompleted, completedNow, completedPrev,
      pendingReports, reportsNow, reportsPrev,
    ] = await Promise.all([
      countRows("users", { filter: notAdmin }),
      countRows("users", { filter: notAdmin, col: "created_at", from: d30 }),
      countRows("users", { filter: notAdmin, col: "created_at", from: d60, to: d30 }),

      countRows("products"),
      countRows("products", { col: "created_at", from: d30 }),
      countRows("products", { col: "created_at", from: d60, to: d30 }),

      countRows("transactions", { filter: isCompleted }),
      countRows("transactions", { filter: isCompleted, col: "completed_at", from: d30 }),
      countRows("transactions", { filter: isCompleted, col: "completed_at", from: d60, to: d30 }),

      safe(countRows("reports", { filter: (q) => q.eq("status", "pending") }), 0),
      safe(countRows("reports", { col: "created_at", from: d30 }), 0),
      safe(countRows("reports", { col: "created_at", from: d60, to: d30 }), 0),
    ]);

    // Reviews average
    const reviews = await safe(
      fetchAll(() => supabase.from("reviews").select("rating, created_at").order("id")),
      []
    );
    const avg = (arr) => (arr.length ? arr.reduce((s, r) => s + r.rating, 0) / arr.length : 0);
    const avgAll = avg(reviews);
    const avgNow = avg(reviews.filter((r) => r.created_at >= d30));
    const avgPrev = avg(reviews.filter((r) => r.created_at >= d60 && r.created_at < d30));

    // Completed transactions
    const txns = await fetchAll(() =>
      supabase
        .from("transactions")
        .select("seller_id, products(category_id)")
        .eq("status_id", completedStatusId)
        .order("id")
    );

    // Top sellers
    const salesMap = {};
    txns.forEach((t) => {
      salesMap[t.seller_id] = (salesMap[t.seller_id] || 0) + 1;
    });
    const topSellerIds = Object.entries(salesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => Number(id));

    let topSellers = [];
    if (topSellerIds.length) {
      const { data: sellerRows, error: sErr } = await supabase
        .from("users")
        .select("id, username, full_name, avatar_url, profile_image_url")
        .in("id", topSellerIds);
      if (sErr) throw sErr;
      topSellers = (sellerRows || [])
        .map((u) => ({
          id: u.id,
          name: u.full_name || u.username,
          avatar: u.avatar_url || u.profile_image_url || null,
          salesCount: salesMap[u.id] || 0,
        }))
        .sort((a, b) => b.salesCount - a.salesCount);
    }

    // Low trust users
    const { data: lowRows, error: lErr } = await supabase
      .from("users")
      .select("id, username, full_name, avatar_url, profile_image_url, trust_score")
      .neq("role", "admin")
      .order("trust_score", { ascending: true })
      .limit(5);
    if (lErr) throw lErr;

    const riskOf = (score) => (score < 30 ? "high" : score < 50 ? "warning" : score < 80 ? "medium" : "good");

    const lowTrustUsers = (lowRows || []).map((u) => ({
      id: u.id,
      name: u.full_name || u.username,
      avatar: u.avatar_url || u.profile_image_url || null,
      trustScore: u.trust_score,
      risk: riskOf(u.trust_score),
    }));

    // Categories
    const { data: cats, error: cErr } = await supabase.from("categories").select("id, name");
    if (cErr) throw cErr;
    const catMap = Object.fromEntries(
      (cats || []).map((c) => [c.id, { ...c, color: CATEGORY_META[c.id]?.color || FALLBACK_COLORS[0] }])
    );

    const catCount = {};
    txns.forEach((t) => {
      const cid = t.products?.category_id;
      if (cid != null) catCount[cid] = (catCount[cid] || 0) + 1;
    });
    const catTotal = Object.values(catCount).reduce((s, n) => s + n, 0);
    const sortedCats = Object.entries(catCount)
      .map(([id, count]) => ({
        id: Number(id),
        name: catMap[id]?.name || "ไม่ระบุ",
        color: catMap[id]?.color || CATEGORY_META[id]?.color || FALLBACK_COLORS[0],
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const head = sortedCats.slice(0, 5);
    const restCount = sortedCats.slice(5).reduce((s, c) => s + c.count, 0);
    const topCategories = head.map((c, idx) => ({
      ...c,
      color: c.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
      percent: catTotal ? Math.round((c.count / catTotal) * 100) : 0,
    }));
    if (restCount > 0) {
      topCategories.push({
        id: "other",
        name: "อื่นๆ",
        color: FALLBACK_COLORS[5],
        count: restCount,
        percent: catTotal ? Math.round((restCount / catTotal) * 100) : 0,
      });
    }

    res.json({
      kpis: {
        totalUsers: {
          value: totalUsers,
          change: pctChange(usersNow, usersPrev),
          periodLabel: "เทียบกับเดือนก่อน",
        },
        totalProducts: {
          value: totalProducts,
          change: pctChange(productsNow, productsPrev),
          periodLabel: "เทียบกับเดือนก่อน",
        },
        completedDeals: {
          value: totalCompleted,
          change: pctChange(completedNow, completedPrev),
          periodLabel: "เทียบกับเดือนก่อน",
        },
        completedTransactions: {
          value: totalCompleted,
          change: pctChange(completedNow, completedPrev),
          periodLabel: "เทียบกับเดือนก่อน",
        },
        pendingReports: {
          value: pendingReports,
          change: pctChange(reportsNow, reportsPrev),
          periodLabel: "เทียบกับเดือนก่อน",
        },
        averageRating: {
          value: Number(avgAll.toFixed(2)),
          change: Number((avgNow - avgPrev).toFixed(2)),
          periodLabel: "คะแนนเฉลี่ยเดือนนี้",
        },
      },
      topSellers: topSellers || [],
      lowTrustUsers: lowTrustUsers || [],
      topCategories,
      categories: {
        total: catTotal,
        items: topCategories,
        top: topCategories[0] || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getDashboard };