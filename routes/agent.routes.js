const express = require('express');
const router = express.Router();
const { createAgent, getAgents, toggleAgent, deleteAgent, getQRCodeImage, scanAgent } = require('../controllers/agent.controller');
const authMiddleware = require('../middleware/auth.middleware');

// LIST agents — réservé au patron
router.get('/', authMiddleware, getAgents);

// CREATE agent — réservé au patron authentifié, tenantId pris du token (pas du body)
router.post('/', authMiddleware, createAgent);

// TOGGLE actif/inactif
router.patch('/:id/toggle', authMiddleware, toggleAgent);

// DELETE agent
router.delete('/:id', authMiddleware, deleteAgent);

// SCAN agent by QR code — public : l'agent scanne avant d'avoir un token
router.get('/scan/:code', scanAgent);

// GET QR Code Image — réservé au patron propriétaire de cet agent
router.get('/:id/qrcode-image', authMiddleware, getQRCodeImage);

module.exports = router;