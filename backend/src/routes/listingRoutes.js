const express = require("express");
const router = express.Router();
const listingController = require("../controllers/listingController");
const { requireUserAuth, optionalAuth } = require("../middleware/userAuth");

// Public
router.get("/", optionalAuth, listingController.getListings);
router.get("/categories", listingController.getCategories);
router.get("/conditions", listingController.getConditions);

// Protected: เส้นทางที่เป็นข้อความตายตัว (/my, /user/my) ต้องประกาศก่อน /:id
// ไม่งั้น Express จะจับ "my" เป็นค่า :id แล้วไปเรียก getListingById
router.get("/my", requireUserAuth, listingController.getMyListings);
router.get("/user/my", requireUserAuth, listingController.getMyListings);

// Public (ต้องอยู่หลัง /my)
router.get("/:id", optionalAuth, listingController.getListingById);

// Protected
router.post("/", requireUserAuth, listingController.createListing);
router.put("/:id", requireUserAuth, listingController.updateListing);
router.delete("/:id", requireUserAuth, listingController.deleteListing);
router.post("/:id/report", requireUserAuth, listingController.reportListing);

module.exports = router;