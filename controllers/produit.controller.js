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
// Un produit en modeStock 'lie' n'a de sens que si uniteParGros est
// renseigné (>0) — sans lui, impossible de savoir combien d'unités détail
// retirer/restaurer lors d'une vente/annulation en gros. Ne bloque que le
// cas où le gros est réellement utilisable (prixGros>0) : un produit en
// 'lie' sans prixGros n'a aucune vente gros possible, donc rien à valider.
function validerModeStockLie({ modeStock, prixGros, uniteParGros }) {
  if (modeStock === "lie" && (prixGros || 0) > 0 && !((uniteParGros || 0) > 0)) {
    const err = new Error(
      "Stock lié : indiquez combien d'unités détail contient une unité gros",
    );
    err.status = 400;
    throw err;
  }
}

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

    validerModeStockLie(rest);
    const produit = await Produit.create({ ...rest, codeBarres, tenantId });
    res.status(201).json({ success: true, data: produit });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, message: err.message });
  }
};

// PUT /api/produits/:id
const updateProduit = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    // Le body peut être un update partiel (ex: juste { modeStock: 'lie' }
    // depuis le formulaire) — on fusionne avec le produit existant pour
    // valider la combinaison modeStock/prixGros/uniteParGros réellement
    // effective après la mise à jour, pas juste les champs envoyés isolément.
    const existant = await Produit.findOne({ _id: req.params.id, tenantId });
    if (!existant) {
      return res.status(404).json({ success: false, message: "Produit non trouvé" });
    }
    validerModeStockLie({
      modeStock: req.body.modeStock ?? existant.modeStock,
      prixGros: req.body.prixGros ?? existant.prixGros,
      uniteParGros: req.body.uniteParGros ?? existant.uniteParGros,
    });

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
    res.status(err.status || 400).json({ success: false, message: err.message });
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
    const { quantite, type, champ } = req.body;
    const tenantId = req.tenantId || "default";

    if (!quantite || !type) {
      return res.status(400).json({
        success: false,
        message: "quantite et type (entree/sortie) requis",
      });
    }
    // 'stockGros' seulement si explicitement demandé — comportement historique
    // (ajuster le stock détail) inchangé par défaut pour tous les appels
    // existants qui n'envoient pas ce champ.
    const cible = champ === "stockGros" ? "stockGros" : "stock";

    const produit = await Produit.findOne({ _id: req.params.id, tenantId });
    if (!produit) {
      return res
        .status(404)
        .json({ success: false, message: "Produit non trouvé" });
    }

    if (type === "entree") {
      produit[cible] += quantite;
    } else if (type === "sortie") {
      if (produit[cible] < quantite) {
        return res
          .status(400)
          .json({ success: false, message: `Stock ${cible === "stockGros" ? "gros" : "détail"} insuffisant` });
      }
      produit[cible] -= quantite;
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
      $or: [
        { $expr: { $lte: ["$stock", "$seuilAlerte"] } },
        // Le pool gros n'est alerté que pour les produits qui l'utilisent
        // réellement (prixGros défini) — sinon stockGros=0 par défaut
        // déclencherait une fausse alerte sur tout produit vendu uniquement
        // au détail.
        { prixGros: { $gt: 0 }, $expr: { $lte: ["$stockGros", "$seuilAlerte"] } },
      ],
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
