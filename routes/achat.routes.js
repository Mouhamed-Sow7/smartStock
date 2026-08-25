const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { getAchats, createAchat, deleteAchat, dernierPrixAchat } = require('../controllers/fournisseur.controller');

router.use(authMiddleware);

// AVANT /:id pour ne pas être interprété comme un ObjectId (même pattern
// que client.routes.js pour /relances).
router.route('/dernier-prix/:produitId').get(dernierPrixAchat);
router.route('/').get(getAchats).post(createAchat);
router.route('/:id').delete(deleteAchat);

module.exports = router;
