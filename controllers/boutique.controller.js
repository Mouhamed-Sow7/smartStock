const Boutique = require('../models/boutique.model');
const User     = require('../models/user.model');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

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

    const boutique = await Boutique.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!boutique) return res.status(404).json({ success: false, message: 'Boutique introuvable' });

    // Email format : prenom.nom@slug.sm  (ou telephone si pas de prenom/nom valides)
    const prenomSlug = (prenom || 'agent').toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
    const nomSlug    = nom.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
    let email = `${prenomSlug}.${nomSlug}@${boutique.slug}.sm`;

    // Dédoublonner si email déjà pris
    const exists = await User.findOne({ email });
    if (exists) {
      const rand = crypto.randomBytes(2).toString('hex');
      email = `${prenomSlug}.${nomSlug}.${rand}@${boutique.slug}.sm`;
    }

    // Mot de passe par défaut = téléphone ou "smartstock2024"
    const defaultPassword = telephone || 'smartstock2024';

    const agent = new User({
      email, telephone: telephone || '',
      password: defaultPassword,
      nom, prenom: prenom || '',
      boutique: boutique.nom,
      boutiqueId: boutique._id,
      role: 'agent',
      tenantId: req.tenantId,
    });
    await agent.save();

    res.status(201).json({
      success: true,
      data: {
        id: agent._id,
        email: agent.email,
        nom: agent.nom,
        prenom: agent.prenom,
        boutique: boutique.nom,
        boutiqueId: boutique._id,
        telephone: agent.telephone,
        defaultPassword,
        loginInfo: `Email: ${email} | Mot de passe: ${defaultPassword}`,
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
exports.resetPasswordAgent = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, message: 'Mot de passe trop court (min 4)' });
    }
    const agent = await User.findOne({ _id: req.params.agentId, tenantId: req.tenantId, role: 'agent' });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent introuvable' });
    agent.password = newPassword; // pre-save hook hash automatiquement
    await agent.save();
    res.json({ success: true, message: 'Mot de passe réinitialisé' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// DELETE /api/boutiques/agents/:agentId
exports.supprimerAgent = async (req, res) => {
  try {
    await User.findOneAndDelete({ _id: req.params.agentId, tenantId: req.tenantId, role: 'agent' });
    res.json({ success: true, message: 'Agent supprimé' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};
