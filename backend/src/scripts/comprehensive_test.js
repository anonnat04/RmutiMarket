const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const { supabase } = require("../config/db");

const BASE_URL = "http://localhost:4000";
const JWT_SECRET = process.env.JWT_SECRET || "rmuti-campus-market-user-secret-change-in-prod-2026";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "rmuti-campus-admin-secret-change-in-prod-2026";

// Admin token (ID: 1, super_admin)
const tokenAdmin = jwt.sign(
  { sub: 1, email: "admin@rmuti.ac.th", role: "super_admin" },
  ADMIN_JWT_SECRET,
  { expiresIn: "8h", issuer: "campus-market-admin" }
);

let tokenBuyer = null;
let tokenSeller = null;
let buyerUser = null;
let sellerUser = null;

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

function record(suite, testName, ok, details = "") {
  results.push({ suite, testName, status: ok ? "PASS" : "FAIL", details });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${suite} -> ${testName} ${details ? `(${details})` : ""}`);
}

async function ensureUser(email, username, fullName, studentId) {
  // Check if user already exists in DB
  const { data: existing } = await supabase
    .from("users")
    .select("id, username, full_name, university_email, email_verified_at")
    .eq("university_email", email)
    .maybeSingle();

  if (existing) {
    if (!existing.email_verified_at) {
      await supabase
        .from("users")
        .update({ email_verified_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return existing;
  }

  // Register via API
  const regRes = await req("/api/auth/register", {
    method: "POST",
    body: {
      fullName,
      username,
      phone: "0812345678",
      email,
      password: "Password123!",
      studentId,
      termsAccepted: true,
      turnstileToken: "bypass-local-dev-token",
      facultyId: 1,
      majorId: 1,
    },
  });

  if (regRes.ok) {
    // Mark verified in DB
    await supabase
      .from("users")
      .update({ email_verified_at: new Date().toISOString() })
      .eq("university_email", email);

    const { data: newUser } = await supabase
      .from("users")
      .select("id, username, full_name, university_email")
      .eq("university_email", email)
      .single();

    return newUser;
  } else {
    throw new Error(`Failed to register ${email}: ${JSON.stringify(regRes.data)}`);
  }
}

async function runAllTests() {
  console.log("=================================================================");
  console.log("🚀 STARTING FULL END-TO-END SCHEMA & BUSINESS FLOW TEST SUITE 🚀");
  console.log("=================================================================\n");

  // -------------------------------------------------------------
  // 1. SETUP & AUTH FLOW (REGISTER, VERIFY, LOGIN)
  // -------------------------------------------------------------
  try {
    const health = await req("/api/health");
    record("1. Auth & System", "Health Check /api/health", health.ok && health.data?.ok === true);

    const facs = await req("/api/auth/faculties-and-majors");
    record("1. Auth & System", "Get Faculties & Majors", facs.ok && Array.isArray(facs.data?.faculties) && facs.data.faculties.length > 0);

    // Setup Buyer
    buyerUser = await ensureUser("test_buyer@rmuti.ac.th", "test_buyer", "นายทดสอบ ผู้ซื้อ", "11641040001-1");
    // Setup Seller
    sellerUser = await ensureUser("test_seller@rmuti.ac.th", "test_seller", "นายทดสอบ ผู้ขาย", "11641040002-2");

    // Login Buyer
    const buyerLogin = await req("/api/auth/login", {
      method: "POST",
      body: { identifier: "test_buyer@rmuti.ac.th", password: "Password123!" },
    });
    tokenBuyer = buyerLogin.data?.accessToken || buyerLogin.data?.token;
    record("1. Auth & System", "Buyer Login (/api/auth/login)", buyerLogin.ok && !!tokenBuyer, `User ID: ${buyerUser.id}`);

    // Login Seller
    const sellerLogin = await req("/api/auth/login", {
      method: "POST",
      body: { identifier: "test_seller@rmuti.ac.th", password: "Password123!" },
    });
    tokenSeller = sellerLogin.data?.accessToken || sellerLogin.data?.token;
    record("1. Auth & System", "Seller Login (/api/auth/login)", sellerLogin.ok && !!tokenSeller, `User ID: ${sellerUser.id}`);

    // Buyer Profile /me
    const profBuyer = await req("/api/profile/me", { token: tokenBuyer });
    record("1. Auth & System", "Get Buyer Profile (/api/profile/me)", profBuyer.ok && profBuyer.data?.user?.id === buyerUser.id);

    // Update Buyer Interests
    const intRes = await req("/api/profile/interests", {
      method: "PUT",
      token: tokenBuyer,
      body: { categoryIds: [1, 2, 3] },
    });
    record("1. Auth & System", "Update Buyer Interests (/api/profile/interests)", intRes.ok);

    // Verify Student Card Endpoint
    const cardRes = await req("/api/profile/verify-student-card", {
      method: "POST",
      token: tokenBuyer,
      body: { studentId: "11641040001-1" },
    });
    record("1. Auth & System", "Submit Student Card (/api/profile/verify-student-card)", cardRes.ok);
  } catch (e) {
    record("1. Auth & System", "Auth Setup Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 2. SELLER FLOW: CREATE & UPDATE LISTING
  // -------------------------------------------------------------
  let createdListingId = null;
  try {
    const myListingsBefore = await req("/api/listings/user/my", { token: tokenSeller });
    record("2. Seller: Listings", "Get Seller My Listings (Before)", myListingsBefore.ok && Array.isArray(myListingsBefore.data?.listings));

    const createRes = await req("/api/listings", {
      method: "POST",
      token: tokenSeller,
      body: {
        title: "หนังสือแบบฝึกหัด แคลคูลัส 1 สำหรับวิศวกรรม",
        price: 180,
        originalPrice: 350,
        description: "หนังสือสภาพ 95% ไม่มีรอยปากกา ส่งต่อราคาประหยัด สำหรับน้องๆ วิศวะ",
        categoryId: 1,
        condition: "used_good",
        images: ["https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c"],
      },
    });

    const newId = createRes.data?.listingId || createRes.data?.id || createRes.data?.listing?.id;
    if (createRes.ok && newId) {
      createdListingId = newId;
      record("2. Seller: Listings", `Create New Listing (ID: ${createdListingId})`, true);

      // Edit Listing
      const editRes = await req(`/api/listings/${createdListingId}`, {
        method: "PUT",
        token: tokenSeller,
        body: {
          title: "หนังสือแบบฝึกหัด แคลคูลัส 1 สำหรับวิศวกรรม (ลดราคาพิเศษ)",
          price: 150,
          description: "ปรับลดราคาเหลือ 150 บาท สภาพดีพร้อมเฉลยข้อสอบท้ายบท",
        },
      });
      record("2. Seller: Listings", "Update Listing Details", editRes.ok && editRes.data?.listing?.price == 150);
    } else {
      record("2. Seller: Listings", "Create New Listing", false, JSON.stringify(createRes.data));
    }
  } catch (e) {
    record("2. Seller: Listings", "Listing Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 3. BUYER FLOW: BROWSE, SEARCH, FILTER & WISHLIST
  // -------------------------------------------------------------
  try {
    const cats = await req("/api/listings/categories");
    record("3. Buyer: Browse & Wishlist", "Get Categories", cats.ok && Array.isArray(cats.data?.categories) && cats.data.categories.length > 0);

    const allListings = await req("/api/listings?limit=10");
    record("3. Buyer: Browse & Wishlist", "Get Listings List", allListings.ok && Array.isArray(allListings.data?.listings) && allListings.data.listings.length > 0);

    const searchRes = await req("/api/listings?q=แคลคูลัส");
    record("3. Buyer: Browse & Wishlist", "Search Listings by Keyword", searchRes.ok && searchRes.data?.listings?.length > 0);

    const filterRes = await req("/api/listings?min_price=100&max_price=200");
    record("3. Buyer: Browse & Wishlist", "Filter Listings by Price Range", filterRes.ok && filterRes.data?.listings?.length > 0);

    if (createdListingId) {
      const detail = await req(`/api/listings/${createdListingId}`);
      record("3. Buyer: Browse & Wishlist", `Get Listing Detail (${createdListingId})`, detail.ok && detail.data?.listing?.id == createdListingId);

      // Add to Wishlist
      const addWish = await req(`/api/profile/wishlist/${createdListingId}`, { method: "POST", token: tokenBuyer });
      record("3. Buyer: Browse & Wishlist", "Add to Wishlist", addWish.ok);

      // Get Wishlist
      const getWish = await req("/api/profile/me/wishlist", { token: tokenBuyer });
      const foundInWish = Array.isArray(getWish.data?.wishlist) && getWish.data.wishlist.some((w) => String(w.id || w.listing_id || w.product_id) === String(createdListingId));
      record("3. Buyer: Browse & Wishlist", "Verify Item in Wishlist", getWish.ok && foundInWish);

      // Remove from Wishlist
      const remWish = await req(`/api/profile/wishlist/${createdListingId}`, { method: "DELETE", token: tokenBuyer });
      record("3. Buyer: Browse & Wishlist", "Remove from Wishlist", remWish.ok);
    }
  } catch (e) {
    record("3. Buyer: Browse & Wishlist", "Browse Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 4. CHAT FLOW: CONVERSATION & MESSAGING
  // -------------------------------------------------------------
  let convId = null;
  try {
    if (createdListingId) {
      // Buyer opens chat with Seller
      const openConv = await req("/api/chat/conversations", {
        method: "POST",
        token: tokenBuyer,
        body: { productId: createdListingId, partnerId: sellerUser.id },
      });

      const cid = openConv.data?.conversationId || openConv.data?.conversation?.id;
      if (openConv.ok && cid) {
        convId = cid;
        record("4. Chat Flow", `Create / Open Conversation (ID: ${convId})`, true);

        // Buyer sends text message
        const sendMsg1 = await req(`/api/chat/conversations/${convId}/messages`, {
          method: "POST",
          token: tokenBuyer,
          body: { content: "สวัสดีครับ สนใจหนังสือแคลคูลัสเล่มนี้ครับ สะดวกนัดรับไหมครับ?" },
        });
        record("4. Chat Flow", "Buyer Send Message", sendMsg1.ok);

        // Seller replies
        const sendMsg2 = await req(`/api/chat/conversations/${convId}/messages`, {
          method: "POST",
          token: tokenSeller,
          body: { content: "สะดวกครับ นัดรับที่โรงอาหารกลางหรือหน้าตึกคณะวิศวะได้เลยครับ" },
        });
        record("4. Chat Flow", "Seller Reply Message", sendMsg2.ok);

        // Seller views conversation messages (marks as read)
        const getMsgs = await req(`/api/chat/conversations/${convId}/messages`, { token: tokenSeller });
        record("4. Chat Flow", "Seller Get & Read Messages", getMsgs.ok && Array.isArray(getMsgs.data?.messages) && getMsgs.data.messages.length >= 2);

        // Buyer checks conversations list
        const buyerConvs = await req("/api/chat/conversations", { token: tokenBuyer });
        record("4. Chat Flow", "Buyer Get Conversations List", buyerConvs.ok && Array.isArray(buyerConvs.data?.conversations));
      } else {
        record("4. Chat Flow", "Create / Open Conversation", false, JSON.stringify(openConv.data));
      }
    }
  } catch (e) {
    record("4. Chat Flow", "Chat Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 5. MEETUP & TRANSACTION FLOW
  // -------------------------------------------------------------
  let meetupId = null;
  let txnId = null;
  try {
    const pts = await req("/api/meetups/points");
    record("5. Meetup & Transaction", "Get Campus Meetup Points", pts.ok && Array.isArray(pts.data?.meetupPoints) && pts.data.meetupPoints.length > 0);

    if (createdListingId && pts.data?.meetupPoints?.length > 0) {
      const locationId = pts.data.meetupPoints[0].id;

      // Buyer schedules meetup
      const scheduleRes = await req("/api/meetups", {
        method: "POST",
        token: tokenBuyer,
        body: {
          productId: createdListingId,
          sellerId: sellerUser.id,
          appointmentDate: "2026-10-25",
          appointmentTime: "12:30",
          locationId: locationId,
          locationDetail: "โต๊ะม้าหินอ่อน หน้าตึกคณะวิศวกรรมศาสตร์",
          agreedPrice: 150,
        },
      });

      const mid = scheduleRes.data?.meetupId || scheduleRes.data?.appointment?.id;
      txnId = scheduleRes.data?.transactionId || scheduleRes.data?.transaction?.id;
      if (scheduleRes.ok && mid) {
        meetupId = mid;
        record("5. Meetup & Transaction", `Buyer Schedule Meetup (Meetup ID: ${meetupId}, Txn ID: ${txnId || "linked"})`, true);

        // Seller views meetups
        const sellerMeetups = await req("/api/meetups", { token: tokenSeller });
        record("5. Meetup & Transaction", "Seller View Meetups List", sellerMeetups.ok && Array.isArray(sellerMeetups.data?.meetups));

        // Seller accepts meetup
        const acceptRes = await req(`/api/meetups/${meetupId}/accept`, { method: "POST", token: tokenSeller });
        record("5. Meetup & Transaction", "Seller Accept Meetup (Status -> CONFIRMED)", acceptRes.ok);

        // Buyer checks in
        const checkinBuyer = await req(`/api/meetups/${meetupId}/checkin`, { method: "POST", token: tokenBuyer });
        record("5. Meetup & Transaction", "Buyer Check-in", checkinBuyer.ok);

        // Seller checks in
        const checkinSeller = await req(`/api/meetups/${meetupId}/checkin`, { method: "POST", token: tokenSeller });
        record("5. Meetup & Transaction", "Seller Check-in", checkinSeller.ok);

        // Complete meetup (Deal confirmation)
        const completeRes = await req(`/api/meetups/${meetupId}/complete`, { method: "POST", token: tokenSeller });
        record("5. Meetup & Transaction", "Complete Meetup / Handover (Status -> COMPLETED)", completeRes.ok);

        if (completeRes.data?.transactionId) {
          txnId = completeRes.data.transactionId;
        }

        // Check Buyer Transactions List
        const buyerTxns = await req("/api/transactions", { token: tokenBuyer });
        const completedTxnObj = Array.isArray(buyerTxns.data?.transactions) ? buyerTxns.data.transactions.find((t) => t.status_id === 3 || t.statusCode === "COMPLETED" || t.status === "completed") : null;
        const hasCompletedTxn = !!completedTxnObj;
        record("5. Meetup & Transaction", "Buyer View Completed Transactions", buyerTxns.ok && hasCompletedTxn);
        if (completedTxnObj) {
          txnId = completedTxnObj.id;
        } else if (!txnId && buyerTxns.data?.transactions?.[0]) {
          txnId = buyerTxns.data.transactions[0].id;
        }
      } else {
        record("5. Meetup & Transaction", "Schedule Meetup", false, JSON.stringify(scheduleRes.data));
      }
    }
  } catch (e) {
    record("5. Meetup & Transaction", "Meetup Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 6. REVIEW & RATING FLOW
  // -------------------------------------------------------------
  try {
    if (txnId && sellerUser) {
      // Buyer reviews Seller
      const revRes = await req("/api/reviews", {
        method: "POST",
        token: tokenBuyer,
        body: {
          transactionId: txnId,
          revieweeId: sellerUser.id,
          rating: 5,
          comment: "ผู้ขายตรงต่อเวลา หนังสือสภาพดีมากเหมือนใหม่ อัธยาศัยดี แนะนำเลยครับ 5 ดาวเต็ม!",
        },
      });

      const revOk = revRes.ok || revRes.status === 409;
      record("6. Review & Rating", `Buyer Review Seller for Txn ${txnId}`, revOk, JSON.stringify(revRes.data));

      // Get Seller Reviews List
      const sellerRevs = await req(`/api/reviews/user/${sellerUser.id}`);
      record("6. Review & Rating", "Get Seller Public Reviews List", sellerRevs.ok && Array.isArray(sellerRevs.data?.reviews) && sellerRevs.data.reviews.length > 0);

      // Check Seller Public Profile Stats
      const sellerProf = await req(`/api/profile/${sellerUser.id}`);
      record("6. Review & Rating", "Verify Seller Profile Stats Updated", 
        sellerProf.ok &&
        sellerProf.data?.user?.average_rating >= 4.0 &&
        sellerProf.data?.user?.review_count >= 1 &&
        sellerProf.data?.user?.successful_deal_count >= 1,
        `Rating: ${sellerProf.data?.user?.average_rating}, Deals: ${sellerProf.data?.user?.successful_deal_count}`
      );
    }
  } catch (e) {
    record("6. Review & Rating", "Review Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 7. WANT-TO-BUY (WTB) FLOW
  // -------------------------------------------------------------
  let wtbPostId = null;
  try {
    const wtbListBefore = await req("/api/want-to-buy");
    record("7. Want-To-Buy", "Get WTB Posts List", wtbListBefore.ok && Array.isArray(wtbListBefore.data?.posts));

    // Buyer creates WTB post
    const createWtb = await req("/api/want-to-buy", {
      method: "POST",
      token: tokenBuyer,
      body: {
        title: "ตามหากล้องฟิล์มสำหรับเรียนถ่ายภาพเบื้องต้น",
        description: "ขอสภาพพร้อมใช้งาน เลนส์ไม่ขึ้นรา มีแฟลชในตัว งบไม่เกิน 1,500 บาท",
        budgetMin: 800,
        budgetMax: 1500,
        categoryId: 6,
      },
    });

    const pid = createWtb.data?.postId || createWtb.data?.post?.id || createWtb.data?.id;
    if (createWtb.ok && pid) {
      wtbPostId = pid;
      record("7. Want-To-Buy", `Create WTB Post (ID: ${wtbPostId})`, true);

      // Update WTB post
      const editWtb = await req(`/api/want-to-buy/${wtbPostId}`, {
        method: "PUT",
        token: tokenBuyer,
        body: {
          title: "ตามหากล้องฟิล์มสำหรับเรียนถ่ายภาพเบื้องต้น (เพิ่มงบ)",
          budgetMax: 1800,
        },
      });
      record("7. Want-To-Buy", "Update WTB Post", editWtb.ok);

      // Delete WTB post
      const delWtb = await req(`/api/want-to-buy/${wtbPostId}`, { method: "DELETE", token: tokenBuyer });
      record("7. Want-To-Buy", "Delete WTB Post", delWtb.ok);
    } else {
      record("7. Want-To-Buy", "Create WTB Post", false, JSON.stringify(createWtb.data));
    }
  } catch (e) {
    record("7. Want-To-Buy", "WTB Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 8. NOTIFICATIONS FLOW
  // -------------------------------------------------------------
  try {
    const notifs = await req("/api/notifications", { token: tokenSeller });
    record("8. Notifications", "Get Seller Notifications", notifs.ok && Array.isArray(notifs.data?.notifications));

    const readAll = await req("/api/notifications/read-all", { method: "POST", token: tokenSeller });
    record("8. Notifications", "Mark All Notifications Read", readAll.ok);
  } catch (e) {
    record("8. Notifications", "Notifications Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 9. REPORTS & RESOLUTION FLOW
  // -------------------------------------------------------------
  let reportId = null;
  try {
    if (createdListingId) {
      // Buyer reports listing
      const repRes = await req("/api/reports", {
        method: "POST",
        token: tokenBuyer,
        body: {
          targetType: "product",
          targetId: createdListingId,
          category: "spam",
          description: "ทดสอบการรายงานสินค้าที่ไม่เหมาะสมโดยผู้ใช้",
        },
      });

      const rid = repRes.data?.report?.id || repRes.data?.reportId;
      if (repRes.ok && rid) {
        reportId = rid;
        record("9. Reports & Disputes", `Create Product Report (ID: ${reportId})`, true);

        // Admin views reports
        const adminReports = await req("/api/admin/reports", { token: tokenAdmin });
        record("9. Reports & Disputes", "Admin View Reports List", adminReports.ok && Array.isArray(adminReports.data?.reports) && adminReports.data.reports.length > 0);

        // Admin resolves report
        const resolveRes = await req(`/api/reports/${reportId}/resolve`, {
          method: "PATCH",
          token: tokenAdmin,
          body: { status: "resolved", adminNote: "ตรวจสอบแล้ว เป็นการทดสอบระบบ" },
        });
        record("9. Reports & Disputes", "Admin Resolve Report", resolveRes.ok);
      } else {
        record("9. Reports & Disputes", "Create Product Report", false, JSON.stringify(repRes.data));
      }
    }
  } catch (e) {
    record("9. Reports & Disputes", "Reports Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 10. ADMIN CONSOLE MANAGEMENT FLOW
  // -------------------------------------------------------------
  try {
    const dash = await req("/api/admin/dashboard", { token: tokenAdmin });
    record("10. Admin Console", "Dashboard KPIs (/api/admin/dashboard)", dash.ok && dash.data?.kpis !== undefined,
      dash.ok ? `Users: ${dash.data?.kpis?.totalUsers?.value}, Products: ${dash.data?.kpis?.totalProducts?.value}` : "");

    const stats = await req("/api/admin/stats", { token: tokenAdmin });
    record("10. Admin Console", "Overview Stats (/api/admin/stats)", stats.ok && stats.data?.stats !== undefined);

    const sellers = await req("/api/admin/seller-stats", { token: tokenAdmin });
    record("10. Admin Console", "Top Sellers Leaderboard (/api/admin/seller-stats)", sellers.ok && Array.isArray(sellers.data?.topSellers));

    const users = await req("/api/admin/users?page=1&limit=10", { token: tokenAdmin });
    record("10. Admin Console", "Users Management List (/api/admin/users)", users.ok && Array.isArray(users.data?.users));

    const userDetail = await req(`/api/admin/users/${buyerUser.id}`, { token: tokenAdmin });
    record("10. Admin Console", `User Detail (/api/admin/users/${buyerUser.id})`, userDetail.ok && userDetail.data?.user?.id === buyerUser.id);

    // Ban & Unban user
    const banRes = await req(`/api/admin/users/${buyerUser.id}/ban`, {
      method: "POST",
      token: tokenAdmin,
      body: { reason: "ทดสอบการระงับบัญชีโดยผู้ดูแลระบบ" },
    });
    record("10. Admin Console", "Admin Ban User", banRes.ok);

    const unbanRes = await req(`/api/admin/users/${buyerUser.id}/unban`, {
      method: "POST",
      token: tokenAdmin,
    });
    record("10. Admin Console", "Admin Unban User", unbanRes.ok);

    const adminListings = await req("/api/admin/listings?page=1&limit=10", { token: tokenAdmin });
    record("10. Admin Console", "Admin Listings List (/api/admin/listings)", adminListings.ok && Array.isArray(adminListings.data?.listings));

    const adminReviews = await req("/api/admin/reviews?page=1&limit=10", { token: tokenAdmin });
    record("10. Admin Console", "Admin Reviews List (/api/admin/reviews)", adminReviews.ok && Array.isArray(adminReviews.data?.reviews));

    const auditLogs = await req("/api/admin/audit-log", { token: tokenAdmin });
    record("10. Admin Console", "Admin Audit Log (/api/admin/audit-log)", auditLogs.ok && Array.isArray(auditLogs.data?.logs));
  } catch (e) {
    record("10. Admin Console", "Admin Exception", false, e.message);
  }

  // -------------------------------------------------------------
  // 11. CLEANUP
  // -------------------------------------------------------------
  if (createdListingId) {
    try {
      const delListing = await req(`/api/listings/${createdListingId}`, { method: "DELETE", token: tokenSeller });
      record("11. Cleanup", `Delete Test Listing (${createdListingId})`, delListing.ok);
    } catch (e) {
      record("11. Cleanup", "Cleanup Exception", false, e.message);
    }
  }

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log("\n=================================================================");
  console.log("📊 COMPREHENSIVE END-TO-END TEST RESULTS SUMMARY 📊");
  console.log("=================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`TOTAL TESTS RUN : ${total}`);
  console.log(`PASSED          : \x1b[32m${passed}\x1b[0m`);
  console.log(`FAILED          : ${failed > 0 ? `\x1b[31m${failed}\x1b[0m` : `\x1b[32m0\x1b[0m`}`);
  console.log(`SUCCESS RATE    : \x1b[32m${((passed / total) * 100).toFixed(1)}%\x1b[0m`);
  console.log("=================================================================\n");

  if (failed > 0) {
    console.log("❌ FAILED TESTS DETAILS:");
    results
      .filter((r) => r.status === "FAIL")
      .forEach((r) => {
        console.log(`- [${r.suite}] ${r.testName}: ${r.details}`);
      });
  } else {
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! The entire platform end-to-end is verified against the database schema.");
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
