const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { loginLimiter, otpVerifyLimiter, forgotPasswordLimiter } = require("../middleware/rateLimiter");
const { requireUserAuth } = require("../middleware/userAuth");

// Public endpoints
router.get("/faculties-and-majors", authController.getFacultiesAndMajors);
router.post("/register", authController.register);
router.post("/otp/resend", authController.resendOtp);
router.post("/otp/verify", otpVerifyLimiter, authController.verifyOtp);
router.post("/login", loginLimiter, authController.login);
router.post("/forgot-password", forgotPasswordLimiter, authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/logout", authController.logout);

// Protected endpoints
router.get("/me", requireUserAuth, authController.getMe);

module.exports = router;
