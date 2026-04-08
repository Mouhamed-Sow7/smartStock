const Produit = require("../models/produit.model");
const panierUtils = require("../utils/panier");

/**
 * Ajoute un produit au panier via code-barres
 * POST /api/panier/add
 * Body: { codeBarres: string }
 */
const ajouterProduitPanier = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const userId = req.user?.id || "default";
    const { codeBarres } = req.body;

    if (!codeBarres) {
      return res.status(400).json({
        success: false,
        message: "Code-barres requis",
      });
    }

    // Trouver le produit par code-barres
    const produit = await Produit.findOne({ codeBarres, tenantId });

    if (!produit) {
      return res.status(404).json({
        success: false,
        message: "Produit non trouvé pour ce code-barres",
      });
    }

    // Ajouter au panier
    const panier = panierUtils.ajouterAuPanier(userId, produit, tenantId);

    // Calculer le total
    const { total, nombreArticles } = panierUtils.calculerTotal(panier);

    res.json({
      success: true,
      message: "Produit ajouté au panier",
      data: {
        panier: panier.items,
        total,
        nombreArticles,
      },
    });
  } catch (err) {
    console.error("Erreur ajouterProduitPanier:", err);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
};

/**
 * Récupère le panier de l'utilisateur
 * GET /api/panier
 */
const getPanierUtilisateur = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const userId = req.user?.id || "default";

    const panier = panierUtils.getPanier(userId, tenantId);
    const { total, nombreArticles } = panierUtils.calculerTotal(panier);

    res.json({
      success: true,
      data: {
        panier: panier.items,
        total,
        nombreArticles,
      },
    });
  } catch (err) {
    console.error("Erreur getPanierUtilisateur:", err);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
};

/**
 * Vide le panier de l'utilisateur
 * DELETE /api/panier/clear
 */
const viderPanierUtilisateur = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const userId = req.user?.id || "default";

    const panier = panierUtils.viderPanier(userId, tenantId);

    res.json({
      success: true,
      message: "Panier vidé",
      data: {
        panier: panier.items,
        total: 0,
        nombreArticles: 0,
      },
    });
  } catch (err) {
    console.error("Erreur viderPanierUtilisateur:", err);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
};

/**
 * Supprime un produit du panier
 * DELETE /api/panier/:produitId
 */
const supprimerProduitPanier = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const userId = req.user?.id || "default";
    const { produitId } = req.params;

    if (!produitId) {
      return res.status(400).json({
        success: false,
        message: "ID produit requis",
      });
    }

    const panier = panierUtils.supprimerDuPanier(userId, produitId, tenantId);

    if (!panier) {
      return res.status(404).json({
        success: false,
        message: "Produit non trouvé dans le panier",
      });
    }

    const { total, nombreArticles } = panierUtils.calculerTotal(panier);

    res.json({
      success: true,
      message: "Produit supprimé du panier",
      data: {
        panier: panier.items,
        total,
        nombreArticles,
      },
    });
  } catch (err) {
    console.error("Erreur supprimerProduitPanier:", err);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
};

/**
 * Modifie la quantité d'un produit dans le panier
 * PUT /api/panier/:produitId
 * Body: { quantite: number }
 */
const modifierQuantiteProduit = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const userId = req.user?.id || "default";
    const { produitId } = req.params;
    const { quantite } = req.body;

    if (!produitId) {
      return res.status(400).json({
        success: false,
        message: "ID produit requis",
      });
    }

    if (quantite === undefined || quantite === null) {
      return res.status(400).json({
        success: false,
        message: "Quantité requise",
      });
    }

    const panier = panierUtils.modifierQuantite(
      userId,
      produitId,
      quantite,
      tenantId,
    );

    if (!panier) {
      return res.status(404).json({
        success: false,
        message: "Produit non trouvé dans le panier",
      });
    }

    const { total, nombreArticles } = panierUtils.calculerTotal(panier);

    res.json({
      success: true,
      message:
        quantite <= 0 ? "Produit supprimé du panier" : "Quantité mise à jour",
      data: {
        panier: panier.items,
        total,
        nombreArticles,
      },
    });
  } catch (err) {
    console.error("Erreur modifierQuantiteProduit:", err);
    res.status(500).json({
      success: false,
      message: "Erreur serveur",
    });
  }
};

module.exports = {
  ajouterProduitPanier,
  getPanierUtilisateur,
  viderPanierUtilisateur,
  supprimerProduitPanier,
  modifierQuantiteProduit,
};
