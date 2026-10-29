import { useAuthStore } from "@/store/authStore";

// จุดเดียวที่คุยกับ backend จริง — ตั้งค่า URL ผ่าน VITE_API_BASE_URL ใน .env ของ frontend
// (ค่า default คือ backend dev server ในเครื่อง)
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// ── ดึง token จากแหล่งเดียว: useAuthStore (zustand) ──
// เดิมโค้ดนี้อ่านจาก localStorage.getItem("cm_token") ซึ่งไม่มีทางเจอค่า
// เพราะ authStore เก็บ token ไว้ใน localStorage key "rmuti-auth" ผ่าน zustand persist
// (เป็น JSON ซ้อนชั้น ไม่ใช่ string ตรงๆ) ทำให้ token ไม่เคยถูกแนบไปกับ request จริง
function getActiveToken() {
  const store = useAuthStore.getState();
  if (store.token) return store.token;

  // ถ้าผู้ใช้ไม่ได้ล็อกอิน (เช่น ออกจากระบบแล้ว) ไม่ต้องดึง token เก่าใน localStorage มาฟื้น session
  if (!store.isAuthenticated) return null;

  const adminToken = localStorage.getItem("cm_admin_token");
  if (adminToken) return adminToken;

  const localToken = localStorage.getItem("cm_token") || localStorage.getItem("token") || null;
  if (localToken) {
    // ซิงค์กลับเข้า store ทันทีเพื่อความสม่ำเสมอ
    useAuthStore.setState({ token: localToken, isAuthenticated: true });
    return localToken;
  }

  return null;
}

async function request(path, { method = "GET", body, token } = {}) {
  const activeToken = token || getActiveToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `คำขอไม่สำเร็จ (${res.status})`);
  return data;
}

export const api = {
  // ─── Student User Auth APIs ───
  getFacultiesAndMajors: () => request("/api/auth/faculties-and-majors"),

  register: (form) =>
    request("/api/auth/register", {
      method: "POST",
      body: {
        username: form.username,
        firstName: form.firstName,
        lastName: form.lastName,
        studentId: form.studentId,
        email: form.email,
        phone: form.phone,
        password: form.password,
        faculty: form.faculty,
        major: form.major,
        termsAccepted: form.terms !== false,
      },
    }),

  verifyOtp: ({ email, code, purpose = "register_verify" }) =>
    request("/api/auth/otp/verify", {
      method: "POST",
      body: { email, code, purpose },
    }),

  resendOtp: ({ email, purpose = "register_verify" }) =>
    request("/api/auth/otp/resend", {
      method: "POST",
      body: { email, purpose },
    }),

  login: ({ identifier, password }) =>
    request("/api/auth/login", {
      method: "POST",
      body: { identifier, password },
    }),

  forgotPassword: ({ email }) =>
    request("/api/auth/forgot-password", {
      method: "POST",
      body: { email },
    }),

  resetPassword: ({ resetToken, newPassword }) =>
    request("/api/auth/reset-password", {
      method: "POST",
      body: { resetToken, newPassword },
    }),

  updateInterests: (categoryIds, token) =>
    request("/api/profile/interests", {
      method: "PUT",
      token,
      body: { categoryIds },
    }),

  // ─── Upload APIs ───
  uploadImages: async (files, token) => {
    const activeToken = token || getActiveToken();
    const formData = new FormData();
    for (const file of files) {
      formData.append("images", file);
    }
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: {
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `อัปโหลดรูปภาพไม่สำเร็จ (${res.status})`);
    return data.urls || [];
  },

  // ─── Listings APIs ───
  getListings: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    const cat = params.category || params.categoryId;
    if (cat && cat !== "all" && cat !== "cat-1") {
      qs.set("category", cat);
    }
    if (params.campus) qs.set("campus", params.campus);
    if (params.condition) qs.set("condition", params.condition);
    if (params.min_price) qs.set("min_price", params.min_price);
    if (params.max_price) qs.set("max_price", params.max_price);
    if (params.sort) qs.set("sort", params.sort);
    if (params.page) qs.set("page", params.page);
    if (params.limit) qs.set("limit", params.limit);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request(`/api/listings${query}`);
  },

  getListingDetail: (id) => request(`/api/listings/${id}`),

  getCategories: () => request("/api/listings/categories"),
  getConditions: () => request("/api/listings/conditions"),

  createListing: (data) => request("/api/listings", { method: "POST", body: data }),

  updateListing: (id, data) => request(`/api/listings/${id}`, { method: "PUT", body: data }),

  deleteListing: (id) => request(`/api/listings/${id}`, { method: "DELETE" }),

  getMyListings: (status) => {
    const q = status ? `?status=${status}` : "";
    return request(`/api/listings/user/my${q}`);
  },

  // ─── Profile APIs ───
  getMyProfile: () => request("/api/profile/me"),
  updateProfile: (data) => request("/api/profile/me", { method: "PUT", body: data }),
  getPublicProfile: (userId) => request(`/api/profile/${userId}`),
  changePassword: (currentPassword, newPassword) =>
    request("/api/profile/password", { method: "PUT", body: { currentPassword, newPassword } }),

  // ─── Wishlist APIs ───
  getWishlist: () => request("/api/profile/me/wishlist"),
  addToWishlist: (listingId) => request(`/api/profile/wishlist/${listingId}`, { method: "POST" }),
  removeFromWishlist: (listingId) => request(`/api/profile/wishlist/${listingId}`, { method: "DELETE" }),

  // ─── Meetup APIs ───
  getMeetupPoints: (campus) => request(`/api/meetups/points${campus ? `?campus=${campus}` : ""}`),
  getMyMeetups: (status) => request(`/api/meetups${status ? `?status=${status}` : ""}`),
  createMeetup: (data) => request("/api/meetups", { method: "POST", body: data }),
  acceptMeetup: (id) => request(`/api/meetups/${id}/accept`, { method: "POST" }),
  completeMeetup: (id) => request(`/api/meetups/${id}/complete`, { method: "POST" }),
  rescheduleMeetup: (id, data) => request(`/api/meetups/${id}/reschedule`, { method: "POST", body: data }),
  cancelMeetup: (id, reason) => request(`/api/meetups/${id}/cancel`, { method: "POST", body: { reason } }),
  checkInMeetup: (id) => request(`/api/meetups/${id}/checkin`, { method: "POST" }),

  // ─── Chat APIs ───
  getConversations: () => request("/api/chat/conversations"),
  createOrGetConversation: (param, partnerId) => {
    const body = typeof param === "object" ? param : { listingId: param, partnerId };
    return request("/api/chat/conversations", { method: "POST", body });
  },
  getMessages: (id, params = {}) =>
    request(`/api/chat/conversations/${id}/messages${params.page ? `?page=${params.page}` : ""}`),
  sendMessage: (id, data) => request(`/api/chat/conversations/${id}/messages`, { method: "POST", body: data }),
  deleteConversation: (id) => request(`/api/chat/conversations/${id}`, { method: "DELETE" }),

  // ─── Notification APIs ───
  getNotifications: () => request("/api/notifications"),
  markAllNotificationsRead: () => request("/api/notifications/read-all", { method: "POST" }),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: "PATCH" }),

  // ─── Review APIs ───
  getUserReviews: (userId) => request(`/api/reviews/user/${userId}`),
  createReview: (data) => request("/api/reviews", { method: "POST", body: data }),

  // ─── Transaction APIs ───
  getMyTransactions: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/api/transactions${qs.toString() ? `?${qs.toString()}` : ""}`);
  },
  getTransactionById: (id) => request(`/api/transactions/${id}`),
  createTransaction: (data) => request("/api/transactions", { method: "POST", body: data }),

  // ─── Want To Buy APIs ───
  getWantToBuyPosts: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/api/want-to-buy${qs.toString() ? `?${qs.toString()}` : ""}`);
  },
  createWantToBuyPost: (data) => request("/api/want-to-buy", { method: "POST", body: data }),
  deleteWantToBuyPost: (id) => request(`/api/want-to-buy/${id}`, { method: "DELETE" }),

  // ─── Report & Moderation APIs ───
  createReport: (data) => request("/api/reports", { method: "POST", body: data }),
  getReports: (params = {}) => {
    const qs = new URLSearchParams(params);
    return request(`/api/reports${qs.toString() ? `?${qs.toString()}` : ""}`);
  },
  resolveReport: (id, data) => request(`/api/reports/${id}/resolve`, { method: "PATCH", body: data }),
  takeDownReportedItem: (id, data = {}) => request(`/api/reports/${id}/take-down`, { method: "POST", body: data }),

  // ─── Admin APIs ───
  adminLogin: (email, password) => request("/api/admin/login", { method: "POST", body: { email, password } }),
  adminChangePassword: (token, currentPassword, newPassword) =>
    request("/api/admin/change-password", { method: "POST", token, body: { currentPassword, newPassword } }),
  adminPendingVerifications: (token) => request("/api/admin/verifications/pending", { token }),
  adminApproveVerification: (token, id) =>
    request(`/api/admin/verifications/${id}/approve`, { method: "POST", token }),
  adminRejectVerification: (token, id, reason) =>
    request(`/api/admin/verifications/${id}/reject`, { method: "POST", token, body: { reason } }),

  // legacy — ยังคงไว้ให้ code เก่าไม่พัง
  adminListUsers: (token, q = "") => request(`/api/admin/users?q=${encodeURIComponent(q)}`, { token }),

  // ── Users (paginated + full stats) ──
  adminGetUsers: (token, { q = "", status = "", page = 1, limit = 20 } = {}) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    qs.set("page", page);
    qs.set("limit", limit);
    return request(`/api/admin/users?${qs.toString()}`, { token });
  },
  adminBanUser: (token, id, reason) =>
    request(`/api/admin/users/${id}/ban`, { method: "POST", token, body: { reason } }),
  adminUnbanUser: (token, id) => request(`/api/admin/users/${id}/unban`, { method: "POST", token }),
  adminDeleteUser: (token, id, reason = "") =>
    request(`/api/admin/users/${id}`, { method: "DELETE", token, body: { reason } }),

  // ── Listings (paginated, with images & seller info) ──
  adminGetListings: (token, { q = "", status = "", page = 1, limit = 20 } = {}) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    qs.set("page", page);
    qs.set("limit", limit);
    return request(`/api/admin/listings?${qs.toString()}`, { token });
  },
  adminDeleteListing: (token, id, reason = "") =>
    request(`/api/admin/listings/${id}`, { method: "DELETE", token, body: { reason } }),

  // ── Reviews (paginated, with reviewer/reviewee info) ──
  adminGetReviews: (token, { q = "", userId = "", rating = "", page = 1, limit = 20 } = {}) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (userId) qs.set("userId", userId);
    if (rating) qs.set("rating", rating);
    qs.set("page", page);
    qs.set("limit", limit);
    return request(`/api/admin/reviews?${qs.toString()}`, { token });
  },
  adminDeleteReview: (token, id, reason = "") =>
    request(`/api/admin/reviews/${id}`, { method: "DELETE", token, body: { reason } }),

  adminDashboard: (token) => request("/api/admin/dashboard", { token }),
};