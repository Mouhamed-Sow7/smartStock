const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  getClients,
  getClientById,
  createClient,
  enregistrerPaiement,
} = require('../controllers/client.controller');

router.use(authMiddleware);

router.route('/').get(getClients).post(createClient);
router.route('/:id').get(getClientById);
router.route('/:id/paiement').post(enregistrerPaiement);

module.exports = router;
