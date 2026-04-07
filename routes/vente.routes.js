const express = require('express');
const router = express.Router();

const {
  createVente,
  getVentes,
  getVenteById,
  annulerVente,
  getStats
} = require('../controllers/vente.controller');

// Stats dashboard (avant /:id pour éviter conflit de route)
router.route('/stats')
  .get(getStats);

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

module.exports = router;
