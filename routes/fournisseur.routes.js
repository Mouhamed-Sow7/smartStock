const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  getFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  getAchats, createAchat, deleteAchat, dernierPrixAchat,
} = require('../controllers/fournisseur.controller');

router.use(authMiddleware);

router.route('/').get(getFournisseurs).post(createFournisseur);
router.route('/:id').patch(updateFournisseur).delete(deleteFournisseur);

module.exports = router;
