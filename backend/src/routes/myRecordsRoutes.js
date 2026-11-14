const express = require("express");
const router = express.Router();
const { requireUserAuth } = require("../middleware/userAuth");
const myRecordsController = require("../controllers/myRecordsController");

// ข้อมูลของตัวเองเท่านั้น (ดึงจาก req.user.id)
router.get("/score", requireUserAuth, myRecordsController.getMyScore);
router.get("/reports", requireUserAuth, myRecordsController.getMyReports);

module.exports = router;