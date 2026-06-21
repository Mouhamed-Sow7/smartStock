const express = require('express');
const router = express.Router();
const { createAgent, getQRCodeImage, scanAgent } = require('../controllers/agent.controller');
const authMiddleware = require('../middleware/auth.middleware');

// CREATE agent — réservé au patron authentifié, tenantId pris du token (pas du body)
router.post('/', authMiddleware, createAgent);

// SCAN agent by QR code — public : l'agent scanne avant d'avoir un token
router.get('/scan/:code', scanAgent);

// GET QR Code Image — réservé au patron propriétaire de cet agent
router.get('/:id/qrcode-image', authMiddleware, getQRCodeImage);

module.exports = router;