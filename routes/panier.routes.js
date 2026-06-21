const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  ajouterProduitPanier,
  getPanierUtilisateur,
  viderPanierUtilisateur,
  supprimerProduitPanier,
  modifierQuantiteProduit,
} = require("../controllers/panier.controller");

router.use(authMiddleware);

// POST /api/panier/add - Ajouter un produit via code-barres
router.route("/add").post(ajouterProduitPanier);

// GET /api/panier - Récupérer le panier
router.route("/").get(getPanierUtilisateur);

// DELETE /api/panier/clear - Vider le panier
router.route("/clear").delete(viderPanierUtilisateur);

// DELETE /api/panier/:produitId - Supprimer un produit du panier
router.route("/:produitId").delete(supprimerProduitPanier);

// PUT /api/panier/:produitId - Modifier la quantité d'un produit
router.route("/:produitId").put(modifierQuantiteProduit);

module.exports = router;
