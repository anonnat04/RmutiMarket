const express = require("express");
const router = express.Router();
const wantToBuyController = require("../controllers/wantToBuyController");
const { requireUserAuth, optionalAuth } = require("../middleware/userAuth");

// Public
router.get("/", optionalAuth, wantToBuyController.getWantToBuyPosts);

// Protected
router.post("/", requireUserAuth, wantToBuyController.createWantToBuyPost);
router.put("/:id", requireUserAuth, wantToBuyController.updateWantToBuyPost);
router.delete("/:id", requireUserAuth, wantToBuyController.deleteWantToBuyPost);

module.exports = router;
