const express = require("express");
const router = express.Router();
const returnController = require("../controllers/returnController");
const { requireUserAuth } = require("../middleware/userAuth");

router.use(requireUserAuth);

router.get("/", returnController.getMyReturns);
router.post("/", returnController.createReturnRequest);

module.exports = router;
