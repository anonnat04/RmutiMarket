const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { requireUserAuth } = require("../middleware/userAuth");

// Public
router.get("/user/:userId", reviewController.getUserReviews);

// Protected
router.post("/", requireUserAuth, reviewController.createReview);

module.exports = router;
