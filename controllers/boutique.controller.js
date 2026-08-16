const Boutique = require('../models/boutique.model');
const User     = require('../models/user.model');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const { normaliserTelephone, formaterTelephoneAffichage } = require('../utils/phone');
const { genererMotDePasse } = require('../utils/password');

// Générer un slug unique à partir du nom
async function genererSlug(base) {
  let slug = base.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 20);
  let attempt = slug;
  let i = 2;
  while (await Boutique.findOne({ slug: attempt })) {
    attempt = `${slug}-${i++}`;
  }
  return attempt;
}

// GET /api/boutiques — toutes les boutiques du patron
exports.listBoutiques = async (req, res) => {
  try {
    const boutiques = await Boutique.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    // Compter les agents par boutique
    const counts = await User.aggregate([
      { $match: { tenantId: req.tenantId, role: 'agent' } },
      { $group: { _id: '$boutiqueId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    counts.forEach(c => { if (c._id) countMap[c._id.toString()] = c.count; });
    const data = boutiques.map(b => ({
      ...b.toObject(),
      agentsCount: countMap[b._id.toString()] || 0,
    }));
    res.json({ success: true, data });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/boutiques — créer une boutique
exports.creerBoutique = async (req, res) => {
  try {
    const { nom, adresse, telephone, description } = req.body;
    if (!nom) return res.status(400).json({ success: false, message: 'Nom requis' });
    const slug = await genererSlug(nom);
    const boutique = new Boutique({ tenantId: req.tenantId, nom, adresse, telephone, description, slug });
    await boutique.save();
    res.status(201).json({ success: true, data: boutique });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PATCH /api/boutiques/:id
exports.modifierBoutique = async (req, res) => {
  try {
    const { nom, adresse, telephone, description, actif } = req.body;
    const boutique = await Boutique.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { nom, adresse, telephone, description, actif },
      { new: true }
    );
    if (!boutique) return res.status(404).json({ success: false, message: 'Boutique introuvable' });
    res.json({ success: true, data: boutique });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /api/boutiques/:id
exports.supprimerBoutique = async (req, res) => {
  try {
    const agentsActifs = await User.countDocuments({ boutiqueId: req.params.id, actif: true });
    if (agentsActifs > 0) {
      return res.status(400).json({ success: false, message: `${agentsActifs} agent(s) actif(s) dans cette boutique. Désactivez-les d'abord.` });
    }
    await Boutique.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    res.json({ success: true, message: 'Boutique supprimée' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// GET /api/boutiques/:id/agents — agents d'une boutique
exports.getAgentsBoutique = async (req, res) => {
  try {
    const agents = await User.find({ boutiqueId: req.params.id, tenantId: req.tenantId, role: 'agent' })
      .select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: agents });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// POST /api/boutiques/:id/agents — créer un agent dans une boutique
exports.creerAgent = async (req, res) => {
  try {
    const { nom, prenom, telephone } = req.body;
    if (!nom) return res.status(400).json({ success: false, message: 'Nom requis' });

    // Téléphone désormais obligatoire : c'est le SEUL identifiant de
    // connexion d'un agent (plus d'email auto-généré du tout — l'ancien
    // format prenom.nom@slug.sm posait un vrai problème pratique : illisible,
    // change si la boutique est renommée, aucune valeur ajoutée pour un
    // agent qui n'a pas de boîte mail à consulter). Les agents créés avant
    // ce changement gardent leur email existant et continuent de fonctionner
    // (login() accepte encore email OU téléphone) — rien de cassé pour eux,
    // juste plus disponible pour les nouveaux agents.
    if (!telephone || !telephone.trim()) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone requis pour créer un agent' });
    }
    const telephoneNormalise = normaliserTelephone(telephone);
    if (!telephoneNormalise) {
      return res.status(400).json({
        success: false,
        message: "Numéro de téléphone invalide. Format attendu : préfixe 70/75/76/77/78, avec ou sans indicatif 221.",
      });
    }
    // Un téléphone ne peut servir d'identifiant qu'à un seul compte (patron
    // OU agent — pas de filtre de rôle, comme pour login() désormais).
    const telExists = await User.findOne({ telephone: telephoneNormalise });
    if (telExists) {
      return res.status(400).json({ success: false, message: 'Ce numéro de téléphone est déjà utilisé par un autre compte' });
    }

    const boutique = await Boutique.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!boutique) return res.status(404).json({ success: false, message: 'Boutique introuvable' });

    // Mot de passe aléatoire fort (jamais le numéro de téléphone — sécurité)
    const motDePasseGenere = genererMotDePasse(9);

    const agent = new User({
      // Pas de champ email : optionnel pour un agent (voir models/user.model.js,
      // required uniquement pour role==='patron', index sparse).
      telephone: telephoneNormalise,
      password: motDePasseGenere,
      nom, prenom: prenom || '',
      boutique: boutique.nom,
      boutiqueId: boutique._id,
      role: 'agent',
      tenantId: req.tenantId,
    });
    await agent.save();

    const telephoneAffiche = formaterTelephoneAffichage(telephoneNormalise);

    res.status(201).json({
      success: true,
      data: {
        _id: agent._id,
        id: agent._id, // conservé pour compat avec un éventuel appelant existant
        nom: agent.nom,
        prenom: agent.prenom,
        boutique: boutique.nom,
        boutiqueId: boutique._id,
        telephone: telephoneAffiche,
        // Sans ce champ, l'agent flambant neuf inséré directement dans la
        // liste côté frontend (sans re-fetch) apparaissait "inactif" (rond
        // rouge) jusqu'à un rechargement de page -- agent.actif valait
        // undefined au lieu de true, le vrai booléen n'existant qu'en base
        // (valeur par défaut du schéma, jamais renvoyée ici auparavant).
        actif: agent.actif,
        motDePasseGenere,
        loginInfo: `Connexion par téléphone: ${telephoneAffiche}\nMot de passe: ${motDePasseGenere}`,
      }
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PATCH /api/boutiques/agents/:agentId/toggle
exports.toggleAgent = async (req, res) => {
  try {
    const agent = await User.findOne({ _id: req.params.agentId, tenantId: req.tenantId, role: 'agent' });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent introuvable' });
    agent.actif = !agent.actif;
    await agent.save();
    res.json({ success: true, data: { actif: agent.actif } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// PATCH /api/boutiques/agents/:agentId/reset-password
// PATCH /api/boutiques/agents/:agentId — modifier nom/prenom/telephone,
// avec reset optionnel du mot de passe dans le même appel. Le frontend
// (agents.component.ts sauvegarderAgent) appelait auparavant PATCH
// /api/agents/:id -- un routeur totalement différent et legacy (ancien
// système d'agents à QR code, modèle Agent séparé, collection vide en
// prod), qui ne trouvait jamais l'agent (il vit dans User, pas Agent) et
// renvoyait 404 -> "Erreur lors de la modification" côté patron. Voir
// agents.component.ts pour la correction de l'URL appelée.
exports.modifierAgentInfos = async (req, res) => {
  try {
    const agent = await User.findOne({ _id: req.params.agentId, tenantId: req.tenantId, role: 'agent' });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent introuvable' });

    const { nom, prenom, telephone, resetPassword } = req.body;
    if (nom && nom.trim()) agent.nom = nom.trim();
    if (prenom !== undefined) agent.prenom = prenom.trim();

    if (telephone && telephone.trim()) {
      const telNorm = normaliserTelephone(telephone);
      if (!telNorm) {
        return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide' });
      }
      const collision = await User.findOne({ telephone: telNorm, _id: { $ne: agent._id } });
      if (collision) {
        return res.status(400).json({ success: false, message: 'Ce numéro est déjà utilisé par un autre compte' });
      }
      agent.telephone = telNorm;
    }

    let motDePasseGenere = null;
    if (resetPassword) {
      motDePasseGenere = genererMotDePasse(9);
      agent.password = motDePasseGenere; // pre-save hook hash automatiquement
    }

    await agent.save();

    res.json({
      success: true,
      data: {
        _id: agent._id,
        nom: agent.nom,
        prenom: agent.prenom,
        telephone: formaterTelephoneAffichage(agent.telephone),
        actif: agent.actif,
      },
      // Nom conservé identique à ce qu'attend déjà le frontend (voir
      // sauvegarderAgent) -- ne pas renommer sans adapter les deux côtés.
      ...(motDePasseGenere ? { nouveauMotDePasse: motDePasseGenere } : {}),
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

exports.resetPasswordAgent = async (req, res) => {
  try {
    const agent = await User.findOne({ _id: req.params.agentId, tenantId: req.tenantId, role: 'agent' });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent introuvable' });
    const motDePasseGenere = genererMotDePasse(9);
    agent.password = motDePasseGenere; // pre-save hook hash automatiquement
    await agent.save();
    res.json({
      success: true,
      message: 'Mot de passe réinitialisé',
      data: {
        motDePasseGenere,
        loginInfo: agent.email
          ? `Connexion par email: ${agent.email}\nMot de passe: ${motDePasseGenere}`
          : `Connexion par téléphone: ${formaterTelephoneAffichage(agent.telephone)}\nMot de passe: ${motDePasseGenere}`,
      },
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /api/boutiques/agents/:agentId
exports.supprimerAgent = async (req, res) => {
  try {
    await User.findOneAndDelete({ _id: req.params.agentId, tenantId: req.tenantId, role: 'agent' });
    res.json({ success: true, message: 'Agent supprimé' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
