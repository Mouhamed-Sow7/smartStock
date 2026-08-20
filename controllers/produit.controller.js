const Produit = require("../models/produit.model");
const bwipjs = require("bwip-js");

// GET /api/produits
const getProduits = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const produits = await Produit.find({ tenantId });
    res.json({ success: true, data: produits });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/produits/:id
const getProduitById = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const produit = await Produit.findOne({ _id: req.params.id, tenantId });
    if (!produit) {
      return res
        .status(404)
        .json({ success: false, message: "Produit non trouvé" });
    }
    res.json({ success: true, data: produit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/produits/:id/barcode - Génère une image PNG du code-barres
const getBarcode = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const produit = await Produit.findOne({ _id: req.params.id, tenantId });

    if (!produit) {
      return res
        .status(404)
        .json({ success: false, message: "Produit non trouvé" });
    }

    if (!produit.codeBarres) {
      return res
        .status(400)
        .json({ success: false, message: "Ce produit n'a pas de code-barres" });
    }

    const png = await bwipjs.toBuffer({
      bcid: "code128",
      text: produit.codeBarres,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: "center",
    });

    res.type("png");
    res.send(png);
  } catch (err) {
    console.error("Erreur génération code-barres:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/produits
const createProduit = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    let { codeBarres, ...rest } = req.body;

    // Génération automatique du code-barres si absent
    if (!codeBarres || codeBarres.trim() === "") {
      codeBarres = `SS-${Date.now()}`;
    }

    // Vérifier doublon de code-barres dans le même tenant
    const existingProduit = await Produit.findOne({ codeBarres, tenantId });
    if (existingProduit) {
      return res.status(400).json({
        success: false,
        message: "Un produit avec ce code-barres existe déjà",
      });
    }

    const produit = await Produit.create({ ...rest, codeBarres, tenantId });
    res.status(201).json({ success: true, data: produit });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/produits/:id
const updateProduit = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const produit = await Produit.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      req.body,
      { new: true, runValidators: true },
    );

    if (!produit) {
      return res
        .status(404)
        .json({ success: false, message: "Produit non trouvé" });
    }
    res.json({ success: true, data: produit });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/produits/:id
const deleteProduit = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const produit = await Produit.findOneAndDelete({
      _id: req.params.id,
      tenantId,
    });

    if (!produit) {
      return res
        .status(404)
        .json({ success: false, message: "Produit non trouvé" });
    }
    res.json({ success: true, message: "Produit supprimé" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/produits/:id/stock
const updateStock = async (req, res) => {
  try {
    const { quantite, type } = req.body;
    const tenantId = req.tenantId || "default";

    if (!quantite || !type) {
      return res.status(400).json({
        success: false,
        message: "quantite et type (entree/sortie) requis",
      });
    }

    const produit = await Produit.findOne({ _id: req.params.id, tenantId });
    if (!produit) {
      return res
        .status(404)
        .json({ success: false, message: "Produit non trouvé" });
    }

    if (type === "entree") {
      produit.stock += quantite;
    } else if (type === "sortie") {
      if (produit.stock < quantite) {
        return res
          .status(400)
          .json({ success: false, message: "Stock insuffisant" });
      }
      produit.stock -= quantite;
    } else {
      return res.status(400).json({
        success: false,
        message: "type doit être entree ou sortie",
      });
    }

    await produit.save();
    res.json({ success: true, data: produit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/produits/scan/:codeBarres
const getProduitByCodeBarres = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const { codeBarres } = req.params;

    if (!codeBarres) {
      return res
        .status(400)
        .json({ success: false, message: "Code-barres requis" });
    }

    const produit = await Produit.findOne({ codeBarres, tenantId });
    if (!produit) {
      return res.status(404).json({
        success: false,
        message: "Produit non trouvé pour ce code-barres",
      });
    }
    res.json({ success: true, data: produit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/produits/alerte
const getProduitsStockBas = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const produits = await Produit.find({
      tenantId,
      $expr: { $lte: ["$stock", "$seuilAlerte"] },
    });
    res.json({ success: true, data: produits, count: produits.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/produits/expiration-proche?jours=14
// Produits déjà périmés OU dont la date de péremption tombe dans les N
// prochains jours (défaut 14) — sert uniquement à alerter le patron, aucune
// vente n'est bloquée automatiquement sur cette base.
const getProduitsExpirationProche = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    // Priorité : ?jours= explicite (debug/admin) > préférence du patron >
    // 14 par défaut si le patron n'a jamais touché ce réglage.
    let jours = parseInt(req.query.jours, 10);
    if (!jours) {
      const User = require("../models/user.model");
      const patron = await User.findOne({ tenantId, role: "patron" }).select("parametres");
      jours = patron?.parametres?.seuilExpirationJours || 14;
    }
    jours = Math.max(1, jours);
    const seuil = new Date();
    seuil.setDate(seuil.getDate() + jours);
    const produits = await Produit.find({
      tenantId,
      dateExpiration: { $ne: null, $lte: seuil },
    }).sort({ dateExpiration: 1 });
    const maintenant = new Date();
    const data = produits.map((p) => ({
      ...p.toObject(),
      perime: p.dateExpiration < maintenant,
    }));
    res.json({ success: true, data, count: data.length, seuilJours: jours });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getProduits,
  getProduitById,
  getBarcode,
  createProduit,
  updateProduit,
  deleteProduit,
  updateStock,
  getProduitByCodeBarres,
  getProduitsStockBas,
  getProduitsExpirationProche,
};
