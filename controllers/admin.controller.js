const User = require('../models/user.model');
const Vente = require('../models/vente.model');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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

// Stats globales
exports.globalStats = async (req, res) => {
  try {
    const [totalPatrons, actifs, inactifs] = await Promise.all([
      User.countDocuments({ role: 'patron' }),
      User.countDocuments({ role: 'patron', actif: true }),
      User.countDocuments({ role: 'patron', actif: false }),
    ]);
    res.json({ success: true, data: { totalPatrons, actifs, inactifs } });
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
