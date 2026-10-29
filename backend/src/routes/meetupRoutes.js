const express = require("express");
const router = express.Router();
const meetupController = require("../controllers/meetupController");
const { requireUserAuth } = require("../middleware/userAuth");

// Public
router.get("/points", meetupController.getMeetupPoints);

// Protected
router.get("/", requireUserAuth, meetupController.getMyMeetups);
router.post("/", requireUserAuth, meetupController.createMeetup);
router.post("/:id/accept", requireUserAuth, meetupController.acceptMeetup);
router.post("/:id/complete", requireUserAuth, meetupController.completeMeetup);
router.post("/:id/reschedule", requireUserAuth, meetupController.rescheduleMeetup);
router.post("/:id/cancel", requireUserAuth, meetupController.cancelMeetup);
router.post("/:id/checkin", requireUserAuth, meetupController.checkInMeetup);

module.exports = router;

