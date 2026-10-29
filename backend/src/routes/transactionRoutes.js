const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const { requireUserAuth } = require("../middleware/userAuth");

router.use(requireUserAuth);

router.get("/", transactionController.getMyTransactions);
router.get("/:id", transactionController.getTransactionById);
router.post("/", transactionController.createTransaction);
router.post("/:id/confirm", transactionController.confirmTransaction);
router.post("/:id/complete", transactionController.completeTransaction);
router.post("/:id/cancel", transactionController.cancelTransaction);

module.exports = router;
