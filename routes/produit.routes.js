const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");

const {
  getProduits,
  getProduitById,
  getBarcode,
  createProduit,
  updateProduit,
  deleteProduit,
  updateStock,
  getProduitByCodeBarres,
  getProduitsStockBas,
} = require("../controllers/produit.controller");

router.use(authMiddleware);

// GET / POST
router.route("/").get(getProduits).post(createProduit);

// GET scan par code-barres (avant /:id pour éviter les conflits)
router.route("/scan/:codeBarres").get(getProduitByCodeBarres);
router.route("/barcode/:codeBarres").get(getProduitByCodeBarres);

// GET alerte stock bas
router.route("/alerte").get(getProduitsStockBas);

// GET barcode image
router.route("/:id/barcode").get(getBarcode);

// GET / PUT / DELETE par id
router
  .route("/:id")
  .get(getProduitById)
  .put(updateProduit)
  .delete(deleteProduit);

// PATCH stock
router.route("/:id/stock").patch(updateStock);

module.exports = router;
