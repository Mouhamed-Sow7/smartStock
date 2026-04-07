const express = require('express');
const router = express.Router();

const {
  getProduits,
  getProduitById,
  createProduit,
  updateProduit,
  deleteProduit,
  updateStock,
  getProduitsStockBas
} = require('../controllers/produit.controller');

// // Debug temporaire - supprimer après confirmation
// console.log('Controllers:', { getProduits, getProduitById, createProduit, updateProduit, deleteProduit, updateStock, getProduitsStockBas });

// GET / POST
router.route('/')
  .get(getProduits)
  .post(createProduit);

// GET alerte stock bas
router.route('/alerte')
  .get(getProduitsStockBas);

// GET / PUT / DELETE par id
router.route('/:id')
  .get(getProduitById)
  .put(updateProduit)
  .delete(deleteProduit);

// PATCH stock
router.route('/:id/stock')
  .patch(updateStock);

module.exports = router;