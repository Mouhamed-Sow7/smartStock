const express = require("express");
const router = express.Router();

const {
  getProduits,
  getProduitById,
  createProduit,
  updateProduit,
  deleteProduit,
  updateStock,
  getProduitByCodeBarres,
  getProduitsStockBas,
} = require("../controllers/produit.controller");

// GET / POST
router.route("/").get(getProduits).post(createProduit);

// GET scan par code-barres (avant /:id pour éviter les conflits)
router.route("/scan/:codeBarres").get(getProduitByCodeBarres);

// GET alerte stock bas
router.route("/alerte").get(getProduitsStockBas);

// GET / PUT / DELETE par id
router
  .route("/:id")
  .get(getProduitById)
  .put(updateProduit)
  .delete(deleteProduit);

// PATCH stock
router.route("/:id/stock").patch(updateStock);

module.exports = router;
