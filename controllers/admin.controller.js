const User = require('../models/user.model');
const Vente = require('../models/vente.model');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { genererMotDePasse } = require('../utils/password');

const ADMIN_KEY = process.env.ADMIN_SECRET_KEY || 'smartstock-admin-2024';

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
    if (boutique !== undefined) user.boutique = boutique;

    await user.save();
    res.json({ success: true, data: { id: user._id, nom: user.nom, email: user.email, boutique: user.boutique } });
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
