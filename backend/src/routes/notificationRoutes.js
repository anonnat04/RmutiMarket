const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { requireUserAuth } = require("../middleware/userAuth");

router.use(requireUserAuth);

router.get("/", notificationController.getNotifications);
router.post("/read-all", notificationController.markAllRead);
router.patch("/:id/read", notificationController.markRead);

module.exports = router;
