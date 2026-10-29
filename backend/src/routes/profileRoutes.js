const express = require("express");
const router = express.Router();
const profileController = require("../controllers/profileController");
const { requireUserAuth } = require("../middleware/userAuth");

// Protected (specific routes before wildcard /:userId)
router.get("/me", requireUserAuth, profileController.getMyProfile);
router.put("/me", requireUserAuth, profileController.updateProfile);
router.put("/", requireUserAuth, profileController.updateProfile);
router.put("/password", requireUserAuth, profileController.changePassword);
router.get("/me/wishlist", requireUserAuth, profileController.getWishlist);
router.get("/wishlist", requireUserAuth, profileController.getWishlist);
router.post("/wishlist/:listingId", requireUserAuth, profileController.addToWishlist);
router.delete("/wishlist/:listingId", requireUserAuth, profileController.removeFromWishlist);
router.post("/verify-student-card", requireUserAuth, profileController.submitStudentCard);
router.put("/interests", requireUserAuth, profileController.updateInterests);

// Public (wildcard route)
router.get("/:userId", profileController.getPublicProfile);

module.exports = router;
