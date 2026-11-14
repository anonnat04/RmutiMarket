const express = require('express');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');
const { createTicket } = require('../controllers/supportController');

router.post('/', requireUserAuth, createTicket);

module.exports = router;