const Vente = require("../models/vente.model");
const Produit = require("../models/produit.model");
const Agent = require("../models/agent.model");
const User = require("../models/user.model");
const genererNumeroTicket = async () => {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const debut = new Date(today.setHours(0, 0, 0, 0));
  const fin = new Date(today.setHours(23, 59, 59, 999));
  const count = await Vente.countDocuments({
    createdAt: { $gte: debut, $lte: fin },
  });
  const num = String(count + 1).padStart(4, "0");
  return "TK-" + dateStr + "-" + num;
};
const createVente = async (req, res) => {
  const { produits, modePaiement, agentId, note } = req.body;
  const tenantId = req.tenantId || "default";
  if (!produits || produits.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Le panier est vide" });
  }
  try {
    // Résoudre l'agent : peut être un Agent (QR code) OU un User (login email/password)
    let agentNom = "Inconnu";
    if (agentId) {
      const agentDoc = await Agent.findById(agentId).catch(() => null);
      if (agentDoc) {
        if (!agentDoc.actif) {
          return res.status(403).json({ success: false, message: "Agent desactive" });
        }
        agentNom = (agentDoc.prenom + " " + agentDoc.nom).trim();
      } else {
        // Fallback: chercher dans User (agent connecté via email/password)
        const userDoc = await User.findOne({ _id: agentId, tenantId, role: "agent" }).catch(() => null);
        if (userDoc) {
          if (!userDoc.actif) {
            return res.status(403).json({ success: false, message: "Agent desactive" });
          }
          agentNom = userDoc.nom || userDoc.email;
        }
        // Si ni Agent ni User trouvé, on continue quand même avec "Inconnu" (ne pas bloquer la vente)
      }
    }
    let montantTotal = 0;
    let margeTotale = 0;
    const lignes = [];
    for (const item of produits) {
      const produit = await Produit.findOne({ _id: item.produitId, tenantId });
      if (!produit) {
        return res
          .status(404)
          .json({
            success: false,
            message: "Produit " + item.produitId + " non trouve",
          });
      }
      if (produit.stock < item.quantite) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Stock insuffisant pour " + produit.nom,
          });
      }
      const sousTotal = produit.prix * item.quantite;
      const prixAchatUnitaire = produit.prixAchat || 0;
      const margeLigne = (produit.prix - prixAchatUnitaire) * item.quantite;
      montantTotal += sousTotal;
      margeTotale += margeLigne;
      lignes.push({
        produitId: produit._id,
        nom: produit.nom,
        prixUnitaire: produit.prix,
        prixAchatUnitaire,
        quantite: item.quantite,
        sousTotal,
        margeLigne,
      });
    }
    for (const item of produits) {
      await Produit.findByIdAndUpdate(item.produitId, {
        $inc: { stock: -item.quantite },
      });
    }
    const numeroTicket = await genererNumeroTicket();
    const vente = await Vente.create({
      tenantId,
      agentId: agent._id,
      agentNom,
      produits: lignes,
      montantTotal,
      margeTotale,
      modePaiement: modePaiement || "especes",
      statut: "paye",
      numeroTicket,
      note: note || "",
    });
    res.status(201).json({ success: true, data: vente });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const getVentes = async (req, res) => {
  try {
    const { debut, fin, agentId, modePaiement } = req.query;
    const filtre = { tenantId: req.tenantId || "default" };
    if (debut || fin) {
      filtre.createdAt = {};
      if (debut) filtre.createdAt["$gte"] = new Date(debut);
      if (fin) filtre.createdAt["$lte"] = new Date(fin);
    }
    if (agentId) filtre.agentId = agentId;
    if (modePaiement) filtre.modePaiement = modePaiement;
    const ventes = await Vente.find(filtre).sort({ createdAt: -1 });
    res.json({ success: true, data: ventes, count: ventes.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const getVenteById = async (req, res) => {
  try {
    const vente = await Vente.findOne({
      _id: req.params.id,
      tenantId: req.tenantId || "default",
    });
    if (!vente)
      return res
        .status(404)
        .json({ success: false, message: "Vente non trouvee" });
    res.json({ success: true, data: vente });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const annulerVente = async (req, res) => {
  try {
    const vente = await Vente.findOne({
      _id: req.params.id,
      tenantId: req.tenantId || "default",
    });
    if (!vente)
      return res
        .status(404)
        .json({ success: false, message: "Vente non trouvee" });
    if (vente.statut === "annule") {
      return res
        .status(400)
        .json({ success: false, message: "Vente deja annulee" });
    }
    for (const ligne of vente.produits) {
      await Produit.findByIdAndUpdate(ligne.produitId, {
        $inc: { stock: ligne.quantite },
      });
    }
    vente.statut = "annule";
    await vente.save();
    res.json({
      success: true,
      message: "Vente annulee, stock restaure",
      data: vente,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const getStats = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const now = new Date();
    const debutJour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const debutSemaine = new Date(now);
    debutSemaine.setDate(now.getDate() - now.getDay());
    debutSemaine.setHours(0, 0, 0, 0);
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const debutAnnee = new Date(now.getFullYear(), 0, 1);
    const [jour, semaine, mois, annee, paiementsMois] = await Promise.all([
      Vente.aggregate([
        {
          $match: { tenantId, statut: "paye", createdAt: { $gte: debutJour } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$montantTotal" },
            marge: { $sum: "$margeTotale" },
            count: { $sum: 1 },
          },
        },
      ]),
      Vente.aggregate([
        {
          $match: {
            tenantId,
            statut: "paye",
            createdAt: { $gte: debutSemaine },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$montantTotal" },
            marge: { $sum: "$margeTotale" },
            count: { $sum: 1 },
          },
        },
      ]),
      Vente.aggregate([
        {
          $match: { tenantId, statut: "paye", createdAt: { $gte: debutMois } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$montantTotal" },
            marge: { $sum: "$margeTotale" },
            count: { $sum: 1 },
          },
        },
      ]),
      Vente.aggregate([
        {
          $match: { tenantId, statut: "paye", createdAt: { $gte: debutAnnee } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$montantTotal" },
            marge: { $sum: "$margeTotale" },
            count: { $sum: 1 },
          },
        },
      ]),
      Vente.aggregate([
        {
          $match: { tenantId, statut: "paye", createdAt: { $gte: debutMois } },
        },
        {
          $group: {
            _id: "$modePaiement",
            count: { $sum: 1 },
            total: { $sum: "$montantTotal" },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);
    res.json({
      success: true,
      data: {
        jour: {
          total: jour[0]?.total || 0,
          marge: jour[0]?.marge || 0,
          ventes: jour[0]?.count || 0,
        },
        semaine: {
          total: semaine[0]?.total || 0,
          marge: semaine[0]?.marge || 0,
          ventes: semaine[0]?.count || 0,
        },
        mois: {
          total: mois[0]?.total || 0,
          marge: mois[0]?.marge || 0,
          ventes: mois[0]?.count || 0,
        },
        annee: {
          total: annee[0]?.total || 0,
          marge: annee[0]?.marge || 0,
          ventes: annee[0]?.count || 0,
        },
        paiements: paiementsMois,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
module.exports = {
  createVente,
  getVentes,
  getVenteById,
  annulerVente,
  getStats,
};
