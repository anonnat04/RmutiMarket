const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../backend/.env") });

const BASE_URL = "http://localhost:4000";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "rmuti-campus-admin-secret-change-in-prod-2026";

// Admin token (ID: 1, role: super_admin)
const tokenAdmin = jwt.sign(
  { sub: 1, email: "admin@rmuti.ac.th", role: "super_admin" },
  ADMIN_JWT_SECRET,
  { expiresIn: "8h", issuer: "campus-market-admin" }
);

async function req(endpoint, { method = "GET", body, token = tokenAdmin } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
}

const results = [];

function record(suite, testName, ok, details = "") {
  results.push({ suite, testName, status: ok ? "PASS" : "FAIL", details });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${suite} -> ${testName} ${details ? `(${details})` : ""}`);
}

async function runAdminTests() {
  console.log("=== STARTING ADMIN SYSTEM TESTS ===");

  // 1. Dashboard
  try {
    const dash = await req("/api/admin/dashboard");
    record("Admin: Dashboard", "GET /api/admin/dashboard", dash.ok && dash.data?.kpis !== undefined, 
      dash.ok ? `Users: ${dash.data?.kpis?.totalUsers?.value}, Products: ${dash.data?.kpis?.totalProducts?.value}` : JSON.stringify(dash.data));

    const stats = await req("/api/admin/stats");
    record("Admin: Stats", "GET /api/admin/stats", stats.ok && stats.data?.stats !== undefined);

    const sellers = await req("/api/admin/seller-stats");
    record("Admin: Stats", "GET /api/admin/seller-stats", sellers.ok && Array.isArray(sellers.data?.topSellers));
  } catch (e) {
    record("Admin: Dashboard", "Dashboard Exception", false, e.message);
  }

  // 2. Users Management
  try {
    const users = await req("/api/admin/users?page=1&limit=10");
    record("Admin: Users", "GET /api/admin/users", users.ok && (Array.isArray(users.data?.users) || Array.isArray(users.data)));

    const targetUserId = users.data?.users?.[0]?.id || 2;
    const uDetail = await req(`/api/admin/users/${targetUserId}`);
    record("Admin: Users", `GET /api/admin/users/${targetUserId} (Detail)`, uDetail.ok, uDetail.ok ? (uDetail.data?.user?.full_name || uDetail.data?.user?.username) : JSON.stringify(uDetail.data));

    // Test ban / unban on target user
    const banRes = await req(`/api/admin/users/${targetUserId}/ban`, {
      method: "POST",
      body: { reason: "ทดสอบการระงับบัญชีโดยผู้ดูแลระบบ" }
    });
    record("Admin: Users", `POST /api/admin/users/${targetUserId}/ban`, banRes.ok, JSON.stringify(banRes.data));

    const unbanRes = await req(`/api/admin/users/${targetUserId}/unban`, {
      method: "POST"
    });
    record("Admin: Users", `POST /api/admin/users/${targetUserId}/unban`, unbanRes.ok, JSON.stringify(unbanRes.data));
  } catch (e) {
    record("Admin: Users", "Users Exception", false, e.message);
  }

  // 3. Listings Management
  try {
    const listings = await req("/api/admin/listings?page=1&limit=10");
    record("Admin: Listings", "GET /api/admin/listings", listings.ok && (Array.isArray(listings.data?.listings) || Array.isArray(listings.data?.products)), 
      listings.ok ? `Total: ${listings.data?.total}` : JSON.stringify(listings.data));
  } catch (e) {
    record("Admin: Listings", "Listings Exception", false, e.message);
  }

  // 4. Reviews Management
  try {
    const reviews = await req("/api/admin/reviews?page=1&limit=10");
    record("Admin: Reviews", "GET /api/admin/reviews", reviews.ok && Array.isArray(reviews.data?.reviews),
      reviews.ok ? `Total: ${reviews.data?.total}` : JSON.stringify(reviews.data));
  } catch (e) {
    record("Admin: Reviews", "Reviews Exception", false, e.message);
  }

  // 5. Reports & Disputes
  try {
    const reports = await req("/api/admin/reports");
    record("Admin: Reports", "GET /api/admin/reports", reports.ok && Array.isArray(reports.data?.reports),
      reports.ok ? `Total: ${reports.data?.reports?.length}` : JSON.stringify(reports.data));
  } catch (e) {
    record("Admin: Reports", "Reports Exception", false, e.message);
  }

  // 6. Audit Log
  try {
    const audit = await req("/api/admin/audit-log");
    record("Admin: Audit", "GET /api/admin/audit-log", audit.ok,
      audit.ok ? `Logs: ${audit.data?.logs?.length || 0}` : JSON.stringify(audit.data));
  } catch (e) {
    record("Admin: Audit", "Audit Exception", false, e.message);
  }

  console.log("\n=== ADMIN TEST SUMMARY ===");
  const total = results.length;
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`);
  if (failed > 0) {
    console.log("FAILED TESTS:");
    results.filter(r => r.status === "FAIL").forEach(r => {
      console.log(`- [${r.suite}] ${r.testName}: ${r.details}`);
    });
  }
}

runAdminTests();
