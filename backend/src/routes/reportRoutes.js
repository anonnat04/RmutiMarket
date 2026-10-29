const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { requireUserAuth } = require("../middleware/userAuth");

// ผู้ใช้รายงานสินค้าหรือโพสต์
router.post("/", requireUserAuth, reportController.createReport);

// แอดมินดึงรายการรายงาน
router.get("/", reportController.getReports);

// แอดมินอัปเดตสถานะรายงาน (แก้ไขแล้ว / เพิกเฉย) รองรับทั้ง PATCH และ POST
router.patch("/:id/resolve", reportController.resolveReport);
router.post("/:id/resolve", reportController.resolveReport);

// แอดมินสั่งปลดและลบสินค้า/โพสต์
router.post("/:id/take-down", reportController.takeDownReportedItem);

module.exports = router;
