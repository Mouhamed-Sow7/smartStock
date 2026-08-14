const Vente = require("../models/vente.model");
const Produit = require("../models/produit.model");
const User = require("../models/user.model");
const Client = require("../models/client.model");
const { createOuRecupererClient } = require("./client.controller");
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
  // Le frontend (pos.service.ts + sync.service.ts) envoie le panier sous la cle
  // "lignes", jamais "produits" — on accepte les deux pour ne plus jamais
  // depanner ce mismatch silencieusement (ex: "panier vide" alors qu'il est plein).
  const itemsPanier = req.body.produits || req.body.lignes;
  const { modePaiement, note, clientNom } = req.body;
  const tenantId = req.tenantId || "default";
  if (!itemsPanier || itemsPanier.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Le panier est vide" });
  }
  try {
    // L'identite de l'agent vient TOUJOURS du JWT (req.user, pose par
    // authMiddleware), jamais d'un agentId envoye par le client dans le body:
    // 1) le frontend ne l'envoie meme pas aujourd'hui (cause du bug "panier vide"),
    // 2) un agentId client est falsifiable — l'utilisateur authentifie doit etre
    //    la seule source de verite pour savoir qui a fait la vente.
    const utilisateur = await User.findOne({ _id: req.user.id, tenantId });
    if (!utilisateur) {
      return res
        .status(404)
        .json({ success: false, message: "Utilisateur non trouve" });
    }
    if (!utilisateur.actif) {
      return res
        .status(403)
        .json({ success: false, message: "Compte desactive" });
    }
    const agentNom = utilisateur.nom;
    let montantTotal = 0;
    let margeTotale = 0;
    const lignes = [];
    for (const item of itemsPanier) {
      // Un produitId non-ObjectId valide (ex: "temp_xxx", resté non résolu côté
      // client après une création offline jamais remappée) plantait Mongoose
      // avec une CastError, remontée en 500 générique par le catch plus bas.
      // Le frontend traite les 500 comme des erreurs réseau temporaires et
      // retentait cette vente indéfiniment, sans jamais pouvoir aboutir.
      // On la détecte tôt et on répond 400 (erreur définitive, non-retryable).
      if (!/^[0-9a-fA-F]{24}$/.test(String(item.produitId))) {
        return res.status(400).json({
          success: false,
          message: `Identifiant produit invalide (${item.produitId}) — produit non synchronisé`,
        });
      }
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
    // Vente à crédit : un nom de client est obligatoire, on retrouve/crée sa fiche
    let client = null;
    if (modePaiement === "credit") {
      if (!clientNom || !clientNom.trim()) {
        return res
          .status(400)
          .json({ success: false, message: "Nom du client requis pour une vente à crédit" });
      }
      client = await createOuRecupererClient(tenantId, clientNom);
    }

    for (const item of itemsPanier) {
      await Produit.findByIdAndUpdate(item.produitId, {
        $inc: { stock: -item.quantite },
      });
    }
    const numeroTicket = await genererNumeroTicket();
    const vente = await Vente.create({
      tenantId,
      agentId: utilisateur._id,
      agentNom,
      produits: lignes,
      montantTotal,
      margeTotale,
      modePaiement: modePaiement || "especes",
      clientId: client ? client._id : null,
      clientNom: client ? client.nom : "",
      statut: "paye",
      numeroTicket,
      note: note || "",
    });

    // La marchandise part quand même (statut "paye" = vente conclue), seule la
    // créance client augmente. Le solde est mis à jour APRÈS la création de la
    // vente pour ne jamais créer une dette si la vente elle-même échoue.
    if (client) {
      client.soldeDu += montantTotal;
      // Pose une échéance de relance seulement si aucune n'est déjà programmée
      // dans le futur : une nouvelle vente à crédit d'un client déjà suivi ne
      // doit pas repousser sa date de relance en cours (sinon un client qui
      // achète souvent à crédit ne serait jamais relancé).
      const echeanceExistanteFuture =
        client.prochaineEcheance && client.prochaineEcheance.getTime() > Date.now();
      if (!echeanceExistanteFuture) {
        const dans30Jours = new Date();
        dans30Jours.setDate(dans30Jours.getDate() + 30);
        client.prochaineEcheance = dans30Jours;
      }
      await client.save();
    }

    res.status(201).json({ success: true, data: vente });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const getVentes = async (req, res) => {
  try {
    const { debut, fin, agentId, modePaiement, boutiqueId } = req.query;
    const filtre = { tenantId: req.tenantId || "default" };
    if (debut || fin) {
      filtre.createdAt = {};
      if (debut) filtre.createdAt["$gte"] = new Date(debut);
      if (fin) filtre.createdAt["$lte"] = new Date(fin);
    }
    if (agentId) {
      filtre.agentId = agentId;
    } else if (boutiqueId) {
      // Filtre par boutique : recuperer les agents de cette boutique et filtrer les ventes
      const User = require('../models/user.model');
      const agents = await User.find({ boutiqueId, tenantId: req.tenantId, role: 'agent' }).select('_id');
      filtre.agentId = { $in: agents.map(a => a._id.toString()) };
    }
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

    // Semaine : du lundi au dimanche (standard FR/SN)
    // getDay() : 0=dim, 1=lun ... 6=sam
    // On ramène à lundi : si dimanche (0) → recule 6 jours, sinon recule (getDay - 1) jours
    const debutSemaine = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const jourSemaine = now.getDay(); // 0=dim
    const reculLundi = jourSemaine === 0 ? 6 : jourSemaine - 1;
    debutSemaine.setDate(debutSemaine.getDate() - reculLundi);
    // debutSemaine est déjà à minuit grâce au constructeur Date(y,m,d)

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
