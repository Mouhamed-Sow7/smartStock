const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');

const {
  createVente,
  getVentes,
  getVenteById,
  annulerVente,
  getStats,
  getAgentsPourFiltre,
  corrigerVente
} = require('../controllers/vente.controller');

router.use(authMiddleware);

// Stats dashboard (avant /:id pour éviter conflit de route)
router.route('/stats')
  .get(getStats);

// Liste des agents pour le filtre "par agent" côté patron (avant /:id)
router.route('/agents')
  .get(getAgentsPourFiltre);

// Liste et création
router.route('/')
  .get(getVentes)
  .post(createVente);

// Détail par ID
router.route('/:id')
  .get(getVenteById);

// Annulation
router.route('/:id/annuler')
  .patch(annulerVente);

// Correction a posteriori (mode de paiement / prix d'une ligne) — fenêtre 24h
router.route('/:id/corriger')
  .patch(corrigerVente);

module.exports = router;
