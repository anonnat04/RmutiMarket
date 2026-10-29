const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { supabase } = require("../config/db");

const BASE_URL = "http://localhost:4000";
const JWT_SECRET = process.env.JWT_SECRET || "rmuti-campus-market-user-secret-change-in-prod-2026";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "rmuti-campus-admin-secret-change-in-prod-2026";

const tokenAdmin = jwt.sign(
  { sub: 1, email: "admin@rmuti.ac.th", role: "super_admin" },
  ADMIN_JWT_SECRET,
  { expiresIn: "8h", issuer: "campus-market-admin" }
);

async function req(endpoint, { method = "GET", body, token } = {}) {
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
function record(testName, ok, details = "") {
  results.push({ testName, status: ok ? "PASS" : "FAIL", details });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${testName} ${details ? `(${details})` : ""}`);
}

async function main() {
  console.log("=====================================================");
  console.log("🎯 TESTING SCORE DEDUCTION & RECOVERY SYSTEM 🎯");
  console.log("=====================================================\n");

  // 1. Get test seller (User ID: 3 or any verified user)
  const { data: testUser } = await supabase
    .from("users")
    .select("id, username, full_name, trust_score, successful_deal_count")
    .eq("id", 3)
    .single();

  if (!testUser) {
    console.error("Test user ID 3 not found!");
    process.exit(1);
  }

  const originalScore = testUser.trust_score ?? 100;
  const originalDeals = testUser.successful_deal_count || 0;
  console.log(`Initial User 3: Trust Score = ${originalScore}, Successful Deals = ${originalDeals}\n`);

  const tokenUser3 = jwt.sign(
    { sub: testUser.id, role: "user" },
    JWT_SECRET,
    { expiresIn: "8h", issuer: "campus-market-user" }
  );

  // ── TEST 1: Direct penalty rule lookup ──
  const { data: noShowRule } = await supabase
    .from("penalty_rules")
    .select("id, action_type, points_deducted, description")
    .eq("action_type", "NO_SHOW")
    .maybeSingle();

  record(
    "1. Penalty Rule Exists",
    !!noShowRule && noShowRule.points_deducted > 0,
    noShowRule ? `Points: -${noShowRule.points_deducted}` : "Not found"
  );

  // ── TEST 2: Score Deduction via Meetup Cancellation (NO_SHOW / ไม่มาตามนัด) ──
  // Reset user score to 100 before deduction test
  await supabase.from("users").update({ trust_score: 100 }).eq("id", testUser.id);

  // Create temporary appointment to cancel
  const { data: tempProd } = await supabase
    .from("products")
    .insert({
      seller_id: testUser.id,
      title: "Score Test Product",
      price: 150,
      category_id: 1,
      condition_id: 1,
      status_id: 1,
    })
    .select("id")
    .single();

  const { data: tempTxn, error: txn1Err } = await supabase
    .from("transactions")
    .insert({
      product_id: tempProd.id,
      seller_id: testUser.id,
      buyer_id: 2,
      status_id: 1, // PENDING
    })
    .select("id")
    .single();

  if (txn1Err) throw new Error(`Failed to insert tempTxn: ${txn1Err.message}`);

  // Fetch meetup point location ID
  const { data: loc } = await supabase.from("locations").select("id").limit(1).single();
  const locationId = loc?.id || 1;

  const testDate = `2026-11-${Math.floor(10 + Math.random() * 15)}`;

  const { data: tempAppt, error: apptErr } = await supabase
    .from("appointments")
    .insert({
      transaction_id: tempTxn.id,
      location_id: locationId,
      appointment_date: testDate,
      appointment_time: "09:00",
      status_id: 2, // CONFIRMED
    })
    .select("id")
    .single();

  if (apptErr) throw new Error(`Failed to insert tempAppt: ${apptErr.message}`);

  // Cancel via API with reason containing "ไม่มา"
  const cancelRes = await req(`/api/meetups/${tempAppt.id}/cancel`, {
    method: "POST",
    token: tokenUser3,
    body: { reason: "ผู้ซื้อไม่มาตามนัด (no-show)" },
  });

  record("2. Cancel Meetup with No-Show Reason", cancelRes.ok, JSON.stringify(cancelRes.data));

  // Verify trust_score was deducted
  const { data: userAfterDeduct } = await supabase
    .from("users")
    .select("trust_score")
    .eq("id", testUser.id)
    .single();

  const deductedPoints = 100 - userAfterDeduct.trust_score;
  record(
    "3. Trust Score Deducted (-30 pts for NO_SHOW)",
    userAfterDeduct.trust_score < 100 && deductedPoints >= 30,
    `Score: 100 -> ${userAfterDeduct.trust_score} (Deducted: -${deductedPoints})`
  );

  // Verify user_score_history has penalty entry
  const { data: scoreHistory } = await supabase
    .from("user_score_history")
    .select("id, change_amount, score_after, source_type, reason, created_at")
    .eq("user_id", testUser.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const penaltyEntry = scoreHistory?.find(
    (h) => h.source_type === "PENALTY" && h.change_amount < 0
  );

  record(
    "4. Score History Recorded Penalty Entry",
    !!penaltyEntry,
    penaltyEntry ? `Change: ${penaltyEntry.change_amount}, Reason: ${penaltyEntry.reason}` : "No entry"
  );

  // Verify Admin User Detail reflects the penalty & history
  const adminUserRes = await req(`/api/admin/users/${testUser.id}`, { token: tokenAdmin });
  const adminScore = adminUserRes.data?.user?.trust_score ?? adminUserRes.data?.user?.trustScore;
  const adminHistory = adminUserRes.data?.scoreHistory || adminUserRes.data?.penalties || [];

  record(
    "5. Admin Console Reflects Deducted Score & History",
    adminUserRes.ok && adminScore === userAfterDeduct.trust_score,
    `Admin sees Score: ${adminScore}, History count: ${adminHistory.length}`
  );

  // ── TEST 3: Score Recovery (+20 pts on successful deal completion) ──
  const scoreBeforeDeal = userAfterDeduct.trust_score; // e.g. 70

  // Create new product for deal
  const { data: dealProd } = await supabase
    .from("products")
    .insert({
      seller_id: testUser.id,
      title: "Score Recovery Deal Product",
      price: 200,
      category_id: 1,
      condition_id: 1,
      status_id: 1,
    })
    .select("id")
    .single();

  // Create completed deal for this seller
  const { data: dealTxn, error: txn2Err } = await supabase
    .from("transactions")
    .insert({
      product_id: dealProd.id,
      seller_id: testUser.id,
      buyer_id: 2,
      status_id: 1, // Initially PENDING
    })
    .select("id")
    .single();

  if (txn2Err) throw new Error(`Failed to insert dealTxn: ${txn2Err.message}`);

  const { data: dealAppt, error: dealErr } = await supabase
    .from("appointments")
    .insert({
      transaction_id: dealTxn.id,
      location_id: locationId,
      appointment_date: testDate,
      appointment_time: "18:00",
      status_id: 2, // CONFIRMED
    })
    .select("id")
    .single();

  if (dealErr) throw new Error(`Failed to insert dealAppt: ${dealErr.message}`);

  // Complete meetup via API
  const completeRes = await req(`/api/meetups/${dealAppt.id}/complete`, {
    method: "POST",
    token: tokenUser3,
  });

  record("6. Complete Deal via /api/meetups/:id/complete", completeRes.ok, JSON.stringify(completeRes.data));

  // Verify trust_score recovered
  const { data: userAfterRecovery } = await supabase
    .from("users")
    .select("trust_score, successful_deal_count")
    .eq("id", testUser.id)
    .single();

  const recoveredPoints = userAfterRecovery.trust_score - scoreBeforeDeal;

  record(
    "7. Trust Score Recovered (+20 pts for Successful Deal)",
    userAfterRecovery.trust_score > scoreBeforeDeal,
    `Score: ${scoreBeforeDeal} -> ${userAfterRecovery.trust_score} (+${recoveredPoints} pts)`
  );

  // Verify user_score_history has RECOVERY entry
  const { data: recoveryHistory } = await supabase
    .from("user_score_history")
    .select("id, change_amount, score_after, source_type, reason, created_at")
    .eq("user_id", testUser.id)
    .order("created_at", { ascending: false })
    .limit(3);

  const recEntry = recoveryHistory?.find(
    (h) => h.source_type === "RECOVERY" || h.reason === "SUCCESSFUL_DEAL"
  );

  record(
    "8. Score History Recorded Recovery Entry",
    !!recEntry && recEntry.change_amount > 0,
    recEntry ? `Change: +${recEntry.change_amount}, Reason: ${recEntry.reason}, Type: ${recEntry.source_type}` : "No entry"
  );

  // ── TEST 4: Boundary Limits (Max 100) ──
  // If score is 95 and +20 is recovered, it should cap at 100
  await supabase.from("users").update({ trust_score: 95 }).eq("id", testUser.id);
  
  // Create product for cap test
  const { data: capProd } = await supabase
    .from("products")
    .insert({
      seller_id: testUser.id,
      title: "Score Cap Product",
      price: 300,
      category_id: 1,
      condition_id: 1,
      status_id: 1,
    })
    .select("id")
    .single();

  // Trigger deal completion
  const { data: capTxn, error: txn3Err } = await supabase
    .from("transactions")
    .insert({
      product_id: capProd.id,
      seller_id: testUser.id,
      buyer_id: 2,
      status_id: 1,
    })
    .select("id")
    .single();

  if (txn3Err) throw new Error(`Failed to insert capTxn: ${txn3Err.message}`);

  // Trigger deal completion via API
  const { data: capAppt } = await supabase
    .from("appointments")
    .insert({
      transaction_id: capTxn.id,
      location_id: locationId,
      appointment_date: testDate,
      appointment_time: "20:00",
      status_id: 2, // CONFIRMED
    })
    .select("id")
    .single();

  await req(`/api/meetups/${capAppt.id}/complete`, {
    method: "POST",
    token: tokenUser3,
  });

  const { data: userCapped } = await supabase
    .from("users")
    .select("trust_score")
    .eq("id", testUser.id)
    .single();

  record(
    "9. Boundary Check: Score Capped at 100",
    userCapped.trust_score === 100,
    `Score capped at: ${userCapped.trust_score}`
  );

  // ── CLEANUP ──
  console.log("\nCleaning up test artifacts...");
  await supabase.from("appointments").delete().in("id", [tempAppt.id, dealAppt.id, capAppt?.id].filter(Boolean));
  await supabase.from("transactions").delete().in("id", [tempTxn.id, dealTxn.id, capTxn.id]);
  await supabase.from("products").delete().in("id", [tempProd.id, dealProd?.id, capProd?.id].filter(Boolean));

  // Restore test user's original values
  await supabase
    .from("users")
    .update({ trust_score: originalScore, successful_deal_count: originalDeals })
    .eq("id", testUser.id);

  console.log(`Restored user 3 to trust_score = ${originalScore}\n`);

  // Summary
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log("=====================================================");
  console.log(`📊 SCORE SYSTEM TEST SUMMARY: ${passed}/${results.length} PASSED (Failed: ${failed})`);
  console.log("=====================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
