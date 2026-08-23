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

    // Stock désormais séparé par pool (détail vs gros — voir produit.model.js) :
    // on agrège les quantités par (produit + type de vente), jamais tous types
    // confondus, puisque chaque pool a son propre compteur indépendant.
    const quantiteCumuleeParCle = {};
    for (const item of itemsPanier) {
      const cle = `${item.produitId}::${item.typeVente === "gros" ? "gros" : "detail"}`;
      quantiteCumuleeParCle[cle] = (quantiteCumuleeParCle[cle] || 0) + Number(item.quantite || 0);
    }

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
      // Prix toujours recalculé côté serveur à partir du produit en base —
      // jamais depuis item.prixUnitaire envoyé par le client (falsifiable).
      // 'gros' seulement si explicitement demandé ET que le produit a bien un
      // prixGros configuré ; sinon on retombe silencieusement sur le prix
      // détail habituel (évite une vente à 0 FCFA si prixGros a été retiré
      // entre-temps côté catalogue).
      const typeVente = item.typeVente === "gros" && produit.prixGros > 0 ? "gros" : "detail";
      const cle = `${item.produitId}::${typeVente}`;
      const quantiteCumulee = quantiteCumuleeParCle[cle];
      // En modeStock 'lie', il n'y a qu'un seul stock physique réel (`stock`,
      // en unités détail) : une vente gros de N lots en retire N*uniteParGros
      // d'un coup. En 'separe' (comportement historique), stockGros reste
      // son propre pool indépendant, inchangé.
      const venteEnGrosLie = typeVente === "gros" && produit.modeStock === "lie";
      const stockDisponible = venteEnGrosLie
        ? produit.stock
        : typeVente === "gros" ? produit.stockGros : produit.stock;
      const quantiteRequise = venteEnGrosLie
        ? quantiteCumulee * (produit.uniteParGros || 0)
        : quantiteCumulee;
      if (venteEnGrosLie && !(produit.uniteParGros > 0)) {
        return res.status(400).json({
          success: false,
          message: `${produit.nom} : stock lié mal configuré (unités par gros manquantes) — contactez le patron`,
        });
      }
      if (stockDisponible < quantiteRequise) {
        return res
          .status(400)
          .json({
            success: false,
            message: `Stock ${typeVente === "gros" ? "gros" : "détail"} insuffisant pour ${produit.nom}`,
          });
      }
      const prixUnitaire = typeVente === "gros" ? produit.prixGros : produit.prix;
      const sousTotal = prixUnitaire * item.quantite;
      const prixAchatUnitaire = produit.prixAchat || 0;
      const margeLigne = (prixUnitaire - prixAchatUnitaire) * item.quantite;
      montantTotal += sousTotal;
      margeTotale += margeLigne;
      lignes.push({
        produitId: produit._id,
        nom: produit.nom,
        prixUnitaire,
        prixAchatUnitaire,
        quantite: item.quantite,
        sousTotal,
        margeLigne,
        typeVente,
        modeStockAuMoment: produit.modeStock || "separe",
        uniteParGrosAuMoment: produit.uniteParGros || 0,
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
      const typeVente = item.typeVente === "gros" ? "gros" : "detail";
      const produitLigne = lignes.find(
        (l) => String(l.produitId) === String(item.produitId) && l.typeVente === typeVente,
      );
      const venteEnGrosLie = typeVente === "gros" && produitLigne?.modeStockAuMoment === "lie";
      if (venteEnGrosLie) {
        // Stock lié : un seul compteur physique (`stock`), une vente gros
        // retire quantite*uniteParGros unités détail d'un coup.
        await Produit.findByIdAndUpdate(item.produitId, {
          $inc: { stock: -(item.quantite * (produitLigne.uniteParGrosAuMoment || 0)) },
        });
      } else {
        await Produit.findByIdAndUpdate(item.produitId, {
          $inc: typeVente === "gros" ? { stockGros: -item.quantite } : { stock: -item.quantite },
        });
      }
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
    // Cloisonnement agent : un agent ne doit JAMAIS pouvoir lire les ventes
    // d'un autre agent, même en modifiant le paramètre ?agentId= dans l'URL.
    // Le rôle vient du JWT (req.user.role), donc infalsifiable côté client.
    // Seul un patron/admin peut filtrer librement (ou ne pas filtrer = tout voir).
    if (req.user?.role === "agent") {
      filtre.agentId = req.user.id;
    } else if (agentId) {
      filtre.agentId = agentId;
    } else if (boutiqueId) {
      // Filtre par boutique : recuperer les agents de cette boutique et filtrer les ventes
      const User = require('../models/user.model');
      const agents = await User.find({ boutiqueId, tenantId: req.tenantId, role: 'agent' }).select('_id');
      filtre.agentId = { $in: agents.map(a => a._id.toString()) };
    }
    if (modePaiement) filtre.modePaiement = modePaiement;

    // Pagination — voir STATE.md "Audit sécurité/performance 2026-08-20" :
    // Vente grandit sans limite dans le temps (jamais purgé), contrairement
    // aux produits (catalogue borné, rechargé entièrement en cache offline
    // pour la recherche instantanée agent -- pas concerné par ce correctif,
    // volontairement laissé tel quel). page/limit optionnels avec défauts
    // raisonnables : un appel sans paramètre continue de fonctionner
    // (rétrocompatible), mais ne rapatrie plus jamais la collection entière.
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const [ventes, total] = await Promise.all([
      Vente.find(filtre).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Vente.countDocuments(filtre),
    ]);

    res.json({
      success: true,
      data: ventes,
      count: ventes.length,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasMore: skip + ventes.length < total,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Liste légère des agents du tenant, utilisée pour peupler le filtre "par
// agent" de la page Ventes côté patron (toutes boutiques confondues).
const getAgentsPourFiltre = async (req, res) => {
  try {
    const User = require('../models/user.model');
    const tenantId = req.tenantId || "default";
    const agents = await User.find({ tenantId, role: "agent" })
      .select("_id nom telephone boutique")
      .sort({ nom: 1 });
    res.json({ success: true, data: agents });
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
    const tenantId = req.tenantId || "default";
    const role = req.user?.role;
    const vente = await Vente.findOne({ _id: req.params.id, tenantId });
    if (!vente)
      return res
        .status(404)
        .json({ success: false, message: "Vente non trouvee" });
    if (vente.statut === "annule") {
      return res
        .status(400)
        .json({ success: false, message: "Vente deja annulee" });
    }

    // Même règle que corrigerVente : un agent ne peut annuler que ses
    // propres ventes, le patron peut annuler n'importe quelle vente du
    // tenant. Le rôle vient du JWT, donc infalsifiable côté client.
    if (role === "agent" && String(vente.agentId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez annuler que vos propres ventes",
      });
    }

    // Même fenêtre de 24h que la correction a posteriori — au-delà, seule
    // une régularisation manuelle par le patron (ajustement de stock, note)
    // a du sens, pas une annulation automatique qui pourrait surprendre
    // (stock restauré plusieurs jours après, décalé d'un inventaire entre-temps).
    const DELAI_MS = 24 * 60 * 60 * 1000;
    const age = Date.now() - new Date(vente.createdAt).getTime();
    if (age > DELAI_MS) {
      return res.status(403).json({
        success: false,
        message: "Cette vente date de plus de 24h — annulation impossible",
      });
    }

    for (const ligne of vente.produits) {
      // Restaure au bon pool — TOUJOURS d'après le snapshot pris au moment
      // de la vente (ligne.modeStockAuMoment), jamais la config actuelle du
      // produit : si le patron a changé 'separe'/'lie' entre-temps, annuler
      // doit rendre le stock exactement là où il a été prélevé à l'époque.
      const venteEnGrosLie = ligne.typeVente === "gros" && ligne.modeStockAuMoment === "lie";
      if (venteEnGrosLie) {
        await Produit.findByIdAndUpdate(ligne.produitId, {
          $inc: { stock: ligne.quantite * (ligne.uniteParGrosAuMoment || 0) },
        });
      } else {
        const champ = ligne.typeVente === "gros" ? "stockGros" : "stock";
        await Produit.findByIdAndUpdate(ligne.produitId, {
          $inc: { [champ]: ligne.quantite },
        });
      }
    }

    // Reprise du crédit client si la vente était payée "à crédit" — sinon
    // le solde dû du client resterait gonflé d'une vente qui n'a plus
    // existé. Note : les Paiement ne sont volontairement pas rattachés à
    // une vente précise (remboursement générique de l'ardoise), donc si le
    // client a déjà remboursé plus que ce que laisserait cette seule vente,
    // on plafonne à 0 plutôt que de faire passer soldeDu en négatif.
    if (vente.modePaiement === "credit" && vente.clientId) {
      await Client.findByIdAndUpdate(vente.clientId, [
        { $set: { soldeDu: { $max: [0, { $subtract: ["$soldeDu", vente.montantTotal] }] } } },
      ]);
    }

    const nomAuteur =
      (await User.findById(req.user.id).select("nom"))?.nom ||
      (role === "patron" ? "Patron" : "Agent");
    const motif = (req.body?.motif || "").toString().trim().slice(0, 300);

    vente.statut = "annule";
    vente.annulation = {
      date: new Date(),
      parRole: role,
      parNom: nomAuteur,
      motif,
    };
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
    // Même règle de cloisonnement que getVentes : un agent ne voit que ses
    // propres stats (son "Ventes du jour" sur son dashboard), le rôle vient
    // du JWT donc pas contournable. Un patron peut optionnellement filtrer
    // sur un agent précis via ?agentId=, sinon il voit tout le tenant.
    const agentFiltre =
      req.user?.role === "agent" ? req.user.id : req.query.agentId || null;
    const matchBase = { tenantId, statut: "paye" };
    if (agentFiltre) matchBase.agentId = agentFiltre;

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
          $match: { ...matchBase, createdAt: { $gte: debutJour } },
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
            ...matchBase,
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
          $match: { ...matchBase, createdAt: { $gte: debutMois } },
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
          $match: { ...matchBase, createdAt: { $gte: debutAnnee } },
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
          $match: { ...matchBase, createdAt: { $gte: debutMois } },
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
// PATCH /api/ventes/:id/corriger
// Permet de corriger a posteriori une vente déjà enregistrée : le mode de
// paiement (agent sur SA vente, ou patron sur n'importe quelle vente du
// tenant) et/ou le prix d'une ligne (patron uniquement — un agent qui se
// trompe de prix doit prévenir le patron, qui corrige lui-même : évite
// qu'un agent puisse discrètement modifier un montant encaissé).
// Fenêtre de 24h après la vente, pour les deux types de correction et les
// deux rôles — au-delà, plus aucune modification (traçabilité comptable).
const corrigerVente = async (req, res) => {
  try {
    const tenantId = req.tenantId || "default";
    const { id } = req.params;
    const { modePaiement, ligneIndex, prixUnitaire } = req.body;
    const role = req.user?.role;

    const vente = await Vente.findOne({ _id: id, tenantId });
    if (!vente) {
      return res.status(404).json({ success: false, message: "Vente non trouvée" });
    }
    if (vente.statut === "annule") {
      return res.status(400).json({ success: false, message: "Impossible de corriger une vente annulée" });
    }

    const DELAI_MS = 24 * 60 * 60 * 1000;
    const age = Date.now() - new Date(vente.createdAt).getTime();
    if (age > DELAI_MS) {
      return res.status(403).json({
        success: false,
        message: "Cette vente date de plus de 24h — correction impossible",
      });
    }

    if (role === "agent" && String(vente.agentId) !== String(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Vous ne pouvez corriger que vos propres ventes",
      });
    }

    const nomAuteur = (await User.findById(req.user.id).select("nom"))?.nom
      || (role === "patron" ? "Patron" : "Agent");
    let modifie = false;

    // ── Correction du mode de paiement (agent sur sa vente, ou patron) ──
    if (modePaiement !== undefined && modePaiement !== vente.modePaiement) {
      const modesValides = ["especes", "wave", "orange_money", "free_money", "credit"];
      if (!modesValides.includes(modePaiement)) {
        return res.status(400).json({ success: false, message: "Mode de paiement invalide" });
      }
      vente.corrections.push({
        parRole: role, parNom: nomAuteur, champ: "modePaiement",
        avant: vente.modePaiement, apres: modePaiement,
      });
      vente.modePaiement = modePaiement;
      modifie = true;
    }

    // ── Correction du prix d'une ligne (patron uniquement) ──
    if (prixUnitaire !== undefined) {
      if (role !== "patron") {
        return res.status(403).json({
          success: false,
          message: "Seul le patron peut corriger un prix — l'agent doit le signaler directement",
        });
      }
      const idx = parseInt(ligneIndex, 10);
      const ligne = vente.produits[idx];
      if (!ligne) {
        return res.status(400).json({ success: false, message: "Ligne de vente introuvable" });
      }
      const nouveauPrix = Number(prixUnitaire);
      if (!(nouveauPrix >= 0)) {
        return res.status(400).json({ success: false, message: "Prix invalide" });
      }
      if (nouveauPrix !== ligne.prixUnitaire) {
        vente.corrections.push({
          parRole: role, parNom: nomAuteur, champ: "prixUnitaire", ligneIndex: idx,
          avant: ligne.prixUnitaire, apres: nouveauPrix,
        });
        // Recalcul en cascade : sousTotal de la ligne, marge de la ligne,
        // puis montantTotal et margeTotale de la vente entière — jamais
        // laisser ces totaux désynchronisés du détail des lignes.
        const ancienSousTotal = ligne.sousTotal;
        const ancienneMarge = ligne.margeLigne;
        ligne.prixUnitaire = nouveauPrix;
        ligne.sousTotal = nouveauPrix * ligne.quantite;
        ligne.margeLigne = (nouveauPrix - (ligne.prixAchatUnitaire || 0)) * ligne.quantite;
        vente.montantTotal += ligne.sousTotal - ancienSousTotal;
        vente.margeTotale += ligne.margeLigne - ancienneMarge;
        modifie = true;
      }
    }

    if (!modifie) {
      return res.status(400).json({ success: false, message: "Aucune modification à appliquer" });
    }

    await vente.save();
    res.json({ success: true, message: "Vente corrigée", data: vente });
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
  getAgentsPourFiltre,
  corrigerVente,
};
