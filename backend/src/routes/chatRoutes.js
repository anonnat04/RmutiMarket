const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { requireUserAuth } = require("../middleware/userAuth");

router.use(requireUserAuth);

router.get("/conversations", chatController.getConversations);
router.post("/conversations", chatController.createOrGetConversation);
router.get("/conversations/:id/messages", chatController.getMessages);
router.post("/conversations/:id/messages", chatController.sendMessage);
router.delete("/conversations/:id", chatController.deleteConversation);

module.exports = router;
