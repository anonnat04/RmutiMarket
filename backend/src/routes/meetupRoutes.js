const express = require("express");
const router = express.Router();
const meetupController = require("../controllers/meetupController");
const { requireUserAuth } = require("../middleware/userAuth");
const { requireTrustScore } = require("../middleware/trustGuard");

// Public
router.get("/points", meetupController.getMeetupPoints);

// Protected
router.get("/", requireUserAuth, meetupController.getMyMeetups);
router.post("/", requireUserAuth, requireTrustScore, meetupController.createMeetup);
router.post("/:id/accept", requireUserAuth, meetupController.acceptMeetup);
router.post("/:id/complete", requireUserAuth, meetupController.completeMeetup);
router.post("/:id/cancel", requireUserAuth, meetupController.cancelMeetup);
router.post("/:id/checkin", requireUserAuth, meetupController.checkInMeetup);

module.exports = router;