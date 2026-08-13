const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  getClients,
  getClientById,
  createClient,
  enregistrerPaiement,
  definirEcheance,
  getRelances,
} = require('../controllers/client.controller');

router.use(authMiddleware);

// AVANT /:id pour que "relances" ne soit pas interprété comme un ObjectId.
router.route('/relances').get(getRelances);
router.route('/').get(getClients).post(createClient);
router.route('/:id').get(getClientById);
router.route('/:id/paiement').post(enregistrerPaiement);
router.route('/:id/echeance').patch(definirEcheance);

module.exports = router;
