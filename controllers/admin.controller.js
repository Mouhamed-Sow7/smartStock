const User = require('../models/user.model');
const { cascaderRenommageBoutique } = require('../utils/boutiqueRename');
const Vente = require('../models/vente.model');
const Client = require('../models/client.model');
const Produit = require('../models/produit.model');
const Boutique = require('../models/boutique.model');
const Paiement = require('../models/paiement.model');
const Agent = require('../models/agent.model'); // legacy — vide en prod mais exporté par prudence
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { genererMotDePasse } = require('../utils/password');
const { SEUIL_ALERTE_JOURS, calculerJoursRestants, statutEcheance } = require('../utils/echeance');
const { resolveSecret } = require('../utils/secrets');

const ADMIN_KEY = resolveSecret('ADMIN_SECRET_KEY');

// Middleware : vérifie la clé admin dans le header
exports.verifyAdminKey = (req, res, next) => {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) return res.status(403).json({ success: false, message: 'Accès refusé' });
  next();
};

// Lister tous les patrons
exports.listUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'patron' })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Créer un compte patron
exports.createPatron = async (req, res) => {
  try {
    const { nom, email, password, boutique } = req.body;
    if (!nom || !email || !password) {
      return res.status(400).json({ success: false, message: 'nom, email, password requis' });
    }
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ success: false, message: 'Email déjà utilisé' });

    const tenantId = `tenant_${crypto.randomUUID().slice(0, 8)}`;
    const user = new User({ nom, email, password, boutique: boutique || nom, role: 'patron', tenantId });
    await user.save();
    res.status(201).json({ success: true, data: { id: user._id, nom, email, tenantId, boutique: user.boutique } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Activer / désactiver un compte
exports.toggleUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Introuvable' });
    user.actif = !user.actif;
    await user.save();
    res.json({ success: true, data: { id: user._id, actif: user.actif } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Réinitialiser le mot de passe
exports.resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (min 6)' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Introuvable' });
    user.password = newPassword; // le pre-save hook hash automatiquement
    await user.save();
    res.json({ success: true, message: 'Mot de passe réinitialisé' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Supprimer un compte patron
exports.deleteUser = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Compte supprimé' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Modifier nom / email / boutique d'un utilisateur (patron OU agent)
exports.editUser = async (req, res) => {
  try {
    const { nom, email, boutique } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Introuvable' });

    if (email && email !== user.email) {
      const exists = await User.findOne({ email, _id: { $ne: user._id } });
      if (exists) return res.status(400).json({ success: false, message: 'Email déjà utilisé par un autre compte' });
      user.email = email;
    }
    if (nom) user.nom = nom;

    const boutiqueChangee = boutique !== undefined && boutique !== user.boutique;
    if (boutique !== undefined) user.boutique = boutique;

    await user.save();

    // Cascade complète (User.boutique sur tout le tenant + Boutique.nom/slug
    // + relocalisation des emails agents si mono-boutique) — voir
    // utils/boutiqueRename.js pour le détail de la logique et ses limites
    // (multi-boutique volontairement non cascadé).
    let emailsChanges = [];
    if (boutiqueChangee) {
      const resultat = await cascaderRenommageBoutique(user.tenantId, boutique, user._id);
      emailsChanges = resultat.emailsChanges;
    }

    res.json({
      success: true,
      data: { id: user._id, nom: user.nom, email: user.email, boutique: user.boutique },
      emailsChanges, // [{agentId, ancienEmail, nouvelEmail}] — à afficher côté admin si non vide, pour qu'il prévienne les agents concernés
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Lister l'equipe complete d'une boutique (le patron + tous ses agents, meme tenantId)
exports.getTeam = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const team = await User.find({ tenantId }).select('-password').sort({ role: 1, createdAt: 1 });
    res.json({ success: true, data: team });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Stats globales enrichies
exports.globalStats = async (req, res) => {
  try {
    const now = new Date();
    const debut30j = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);

    const [totalPatrons, actifs, inactifs, totalAgents, totalVentes, stats30j] = await Promise.all([
      User.countDocuments({ role: 'patron' }),
      User.countDocuments({ role: 'patron', actif: true }),
      User.countDocuments({ role: 'patron', actif: false }),
      User.countDocuments({ role: 'agent' }),
      Vente.countDocuments({}),
      Vente.aggregate([
        { $match: { createdAt: { $gte: debut30j }, statut: 'paye' } },
        { $group: { _id: null, ca: { $sum: '$montantTotal' }, count: { $sum: 1 } } }
      ])
    ]);

    const ca30j = stats30j[0]?.ca || 0;
    const ventes30j = stats30j[0]?.count || 0;

    res.json({
      success: true,
      data: {
        totalPatrons, actifs, inactifs,
        totalAgents,
        totalVentes,
        ca30j,       // chiffre d'affaires global toutes boutiques sur 30 jours
        ventes30j,   // nb ventes sur 30 jours
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Purger toutes les ventes (reset complet pour repartir de zero en test).
// Optionnel: ?tenantId=xxx pour ne purger qu'un seul espace patron.
exports.purgeVentes = async (req, res) => {
  try {
    const { tenantId } = req.query;
    const filtre = tenantId ? { tenantId } : {};
    const result = await Vente.deleteMany(filtre);
    res.json({ success: true, message: `${result.deletedCount} vente(s) supprimee(s)`, deletedCount: result.deletedCount });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Clients à relancer (bientôt dus ou en retard) toutes boutiques confondues,
// avec le nom de la boutique jointe depuis les comptes patron (tenantId ->
// boutique). Même seuil/logique que le patron individuel, vue agrégée en plus.
exports.relancesGlobales = async (req, res) => {
  try {
    const [clients, patrons] = await Promise.all([
      Client.find({ soldeDu: { $gt: 0 }, prochaineEcheance: { $ne: null } }).sort({ prochaineEcheance: 1 }),
      User.find({ role: 'patron' }).select('tenantId boutique'),
    ]);

    const boutiqueParTenant = new Map(patrons.map((p) => [p.tenantId, p.boutique]));

    const relances = clients
      .map((c) => ({
        _id: c._id,
        nom: c.nom,
        telephone: c.telephone,
        soldeDu: c.soldeDu,
        prochaineEcheance: c.prochaineEcheance,
        tenantId: c.tenantId,
        boutique: boutiqueParTenant.get(c.tenantId) || c.tenantId,
        joursRestants: calculerJoursRestants(c.prochaineEcheance),
      }))
      .filter((c) => c.joursRestants <= SEUIL_ALERTE_JOURS)
      .map((c) => ({ ...c, statut: statutEcheance(c.joursRestants) }));

    res.json({ success: true, data: relances, count: relances.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Patrons dont l'abonnement SaaS arrive à échéance (<=3j) ou est déjà en
// retard, PAR DÉFAUT. Avec ?tous=1, renvoie TOUS les patrons (vue
// d'ensemble complète du portefeuille d'abonnés, triée par urgence quand
// même — un patron inscrit hier apparaît en bas, un abonnement en retard
// en haut). C'est ESF (toi) qui encaisse manuellement (Wave/OM/virement),
// donc pas de renouvellement auto : juste une liste triée pour savoir qui
// relancer, avec le contact direct pour appeler/écrire.
exports.abonnementsARelancer = async (req, res) => {
  try {
    const tous = req.query.tous === '1' || req.query.tous === 'true';
    const patrons = await User.find({ role: 'patron' })
      .select('nom email telephone boutique tenantId actif prochainPaiementAbonnement createdAt');

    let relances = patrons.map((p) => ({
      _id: p._id,
      nom: p.nom,
      email: p.email,
      telephone: p.telephone,
      boutique: p.boutique,
      actif: p.actif,
      inscritLe: p.createdAt,
      prochainPaiement: p.prochainPaiementAbonnement,
      joursRestants: calculerJoursRestants(p.prochainPaiementAbonnement),
    }));

    if (!tous) {
      relances = relances.filter((p) => p.joursRestants <= SEUIL_ALERTE_JOURS);
    }

    relances = relances
      .map((p) => ({ ...p, statut: statutEcheance(p.joursRestants) }))
      .sort((a, b) => a.joursRestants - b.joursRestants);

    res.json({ success: true, data: relances, count: relances.length });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Confirme un paiement d'abonnement reçu : repousse la prochaine échéance à
// +30j à partir d'aujourd'hui (date réelle du paiement, pas de l'ancienne
// échéance — évite l'accumulation de retard si le patron paie en retard).
exports.renouvelerAbonnement = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Introuvable' });
    if (user.role !== 'patron') {
      return res.status(400).json({ success: false, message: "Seul un compte patron a un abonnement" });
    }
    user.prochainPaiementAbonnement = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await user.save();
    res.json({ success: true, data: { id: user._id, prochainPaiement: user.prochainPaiementAbonnement } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DEBUG TEMPORAIRE — lister les agents avec leur téléphone stocké (pas de password)
exports.debugAgents = async (req, res) => {
  try {
    const agents = await User.find({ role: 'agent' })
      .select('nom prenom email telephone actif tenantId createdAt')
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, data: agents });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// Reset password agent par son email (depuis l'admin panel — déblocage)
exports.resetPasswordByEmail = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'email requis' });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    // Si un mot de passe manuel est fourni (depuis l'ancienne UI), l'utiliser.
    // Sinon générer automatiquement — cohérent avec la création d'agent.
    const motDePasse = newPassword && newPassword.length >= 4
      ? newPassword
      : genererMotDePasse(9);

    user.password = motDePasse;
    await user.save(); // pre-save hook hash automatiquement
    res.json({
      success: true,
      message: `Mot de passe réinitialisé pour ${user.nom}`,
      data: { email: user.email, role: user.role, motDePasseGenere: motDePasse }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ─── Portail d'indexation admin (rattrapage boutiques sans cahier) ────────
// Un même produit commercial (ex: "Nescafé 100g", code-barres imprimé en
// usine) est strictement identique d'une boutique à l'autre — seuls le
// stock et la date de péremption sont propres à CE réassort précis dans
// CETTE boutique. Ces deux endpoints permettent à l'admin de pré-remplir
// nom/prix/catégorie depuis n'importe quel tenant ayant déjà indexé ce
// code-barres, tout en forçant une vérification humaine du prix (les tarifs
// varient d'un fournisseur/boutique à l'autre) et une saisie fraîche du
// stock/péremption (jamais copiés — ce sont les seules infos qui ne se
// partagent pas).

// GET /api/admin/produits/lookup/:codeBarres
// Recherche CROSS-TENANT (délibérément — l'isolation par tenant ne
// s'applique pas ici, c'est le seul endroit de toute l'API où c'est le cas,
// et c'est pour ça qu'il vit sous /admin avec sa propre clé, jamais sous
// authMiddleware normal).
exports.lookupProduitCrossTenant = async (req, res) => {
  try {
    const { codeBarres } = req.params;
    if (!codeBarres || !codeBarres.trim()) {
      return res.status(400).json({ success: false, message: 'Code-barres requis' });
    }
    const matches = await Produit.find({ codeBarres: codeBarres.trim() })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('nom prix prixGros prixAchat categorie image codeBarres updatedAt tenantId');
    if (matches.length === 0) {
      return res.json({ success: true, trouve: false, data: null, nbBoutiques: 0 });
    }
    // Le plus récemment mis à jour = la donnée la plus probablement à jour
    // (prix notamment). On ne renvoie QUE les champs partageables — jamais
    // stock ni dateExpiration, propres à chaque réassort/boutique.
    const plusRecent = matches[0];
    res.json({
      success: true,
      trouve: true,
      nbBoutiques: new Set(matches.map(m => String(m.tenantId))).size,
      data: {
        nom: plusRecent.nom,
        prix: plusRecent.prix,
        prixGros: plusRecent.prixGros,
        prixAchat: plusRecent.prixAchat,
        categorie: plusRecent.categorie,
        image: plusRecent.image,
        codeBarres: plusRecent.codeBarres,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/admin/produits
// Création d'un produit pour un tenant choisi explicitement par l'admin
// (body.tenantId) — impossible via l'API normale où le tenant vient
// toujours du JWT de la personne connectée. Le tenant ciblé DOIT
// correspondre à un patron déjà enregistré (jamais de tenantId inventé).
exports.creerProduitPourTenant = async (req, res) => {
  try {
    const { tenantId, ...rest } = req.body;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'tenantId requis' });
    }
    const patron = await User.findOne({ tenantId, role: 'patron' });
    if (!patron) {
      return res.status(404).json({ success: false, message: 'Aucun patron enregistré pour ce tenantId' });
    }
    let { codeBarres } = rest;
    if (!codeBarres || !codeBarres.trim()) {
      codeBarres = `SS-${Date.now()}`;
    }
    const existant = await Produit.findOne({ codeBarres, tenantId });
    if (existant) {
      return res.status(400).json({ success: false, message: 'Un produit avec ce code-barres existe déjà dans cette boutique' });
    }
    const produit = await Produit.create({ ...rest, codeBarres, tenantId });
    res.status(201).json({ success: true, data: produit, boutique: patron.boutique });
  } catch (e) { res.status(400).json({ success: false, message: e.message }); }
};

// ─── Sauvegarde manuelle (backup) ──────────────────────────────────────
// GET /api/admin/backup?tenantId=xxx (optionnel — toutes boutiques si omis)
// Export JSON complet de toutes les collections, à la demande. Pensé comme
// un filet de sécurité manuel déclenché avant une mise à jour risquée ou
// périodiquement — PAS un backup automatique programmé (Render/l'API ne
// tourne pas de cron persistant ici). Mots de passe systématiquement
// exclus. Le fichier réponse peut être sauvegardé tel quel par l'admin
// (bouton "Télécharger" côté frontend) — voir restaurerDepuisBackup pour
// le chemin de restauration en cas de besoin.
exports.exporterBackup = async (req, res) => {
  try {
    const tenantId = req.query.tenantId;
    const filtre = tenantId ? { tenantId } : {};

    const [users, produits, ventes, clients, paiements, boutiques, agentsLegacy] = await Promise.all([
      User.find(filtre).select('-password').lean(),
      Produit.find(filtre).lean(),
      Vente.find(filtre).lean(),
      Client.find(filtre).lean(),
      Paiement.find(filtre).lean(),
      Boutique.find(filtre).lean(),
      Agent.find(filtre).lean(),
    ]);

    res.json({
      success: true,
      genereLe: new Date().toISOString(),
      tenantId: tenantId || 'TOUS',
      compteurs: {
        users: users.length, produits: produits.length, ventes: ventes.length,
        clients: clients.length, paiements: paiements.length, boutiques: boutiques.length,
        agentsLegacy: agentsLegacy.length,
      },
      data: { users, produits, ventes, clients, paiements, boutiques, agentsLegacy },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/admin/backup/restaurer
// Restauration à partir d'un export produit par exporterBackup ci-dessus.
// Volontairement PRUDENT : n'écrase RIEN par défaut — insère seulement les
// documents dont l'_id n'existe pas déjà (upsert non-destructif). Un vrai
// écrasement (mode "remplacer") demande une confirmation explicite en plus
// de la clé admin, pour qu'une restauration ne puisse jamais effacer des
// ventes faites depuis la sauvegarde par erreur de manipulation.
exports.restaurerDepuisBackup = async (req, res) => {
  try {
    const { data, confirmerRemplacement } = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ success: false, message: 'Fichier de sauvegarde invalide' });
    }
    const collections = {
      users: User, produits: Produit, ventes: Vente, clients: Client,
      paiements: Paiement, boutiques: Boutique, agentsLegacy: Agent,
    };
    const resultat = {};
    for (const [cle, Modele] of Object.entries(collections)) {
      const documents = Array.isArray(data[cle]) ? data[cle] : [];
      let inseres = 0, ignores = 0, remplaces = 0, erreurs = 0;
      for (const doc of documents) {
        try {
          const existant = await Modele.findById(doc._id);
          if (existant && !confirmerRemplacement) {
            ignores++;
            continue;
          }
          if (existant && confirmerRemplacement) {
            await Modele.replaceOne({ _id: doc._id }, doc);
            remplaces++;
          } else {
            await Modele.create(doc);
            inseres++;
          }
        } catch (erreurDoc) {
          // Un document invalide (ex: un utilisateur sans mot de passe —
          // volontairement exclu du backup pour ne jamais faire circuler de
          // hash dans un fichier téléchargeable) ne doit jamais interrompre
          // la restauration du reste de la collection.
          erreurs++;
        }
      }
      resultat[cle] = { inseres, ignores, remplaces, erreurs };
    }
    res.json({ success: true, message: 'Restauration terminée', resultat });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
