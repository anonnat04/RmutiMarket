const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { getDashboard } = require("../controllers/adminDashboardController");
const { requireAdmin, blockUntilPasswordChanged } = require("../middleware/adminAuth");

// All admin routes require admin auth + password changed
router.use(requireAdmin, blockUntilPasswordChanged);

// Dashboard
router.get("/dashboard", getDashboard);
router.get("/stats", adminController.getStats);
router.get("/seller-stats", adminController.getSellerLeaderboard);

// Users
router.get("/users", adminController.getUsers);
router.get("/users/:userId", adminController.getUserDetail);
router.post("/users/:userId/ban", adminController.banUser);
router.post("/users/:userId/unban", adminController.unbanUser);
router.delete("/users/:userId", adminController.deleteUser);

// Student card verifications
router.get("/verifications/pending", adminController.getPendingVerifications);
router.post("/verifications/:id/approve", adminController.approveVerification);
router.post("/verifications/:id/reject", adminController.rejectVerification);

// Listings
router.get("/listings", adminController.getAdminListings);
router.delete("/listings/:id", adminController.deleteListing);
router.post("/listings/:id/remove", adminController.removeListing);
router.post("/listings/:id/restore", adminController.restoreListing);

// Reviews
router.get("/reviews", adminController.getAdminReviews);
router.delete("/reviews/:id", adminController.deleteReview);

// Reports
router.get("/reports", adminController.getReports);
router.post("/reports/:id/resolve", adminController.resolveReport);
router.patch("/reports/:id/resolve", adminController.resolveReport);


// Audit log
router.get("/audit-log", adminController.getAuditLog);

module.exports = router;