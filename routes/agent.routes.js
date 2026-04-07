const express = require('express');
const router = express.Router();
const { createAgent, getQRCodeImage, scanAgent } = require('../controllers/agent.controller');

// CREATE agent
router.post('/', createAgent);

// SCAN agent by QR code
router.get('/scan/:code', scanAgent);

// GET QR Code Image
router.get('/:id/qrcode-image', getQRCodeImage);

module.exports = router;