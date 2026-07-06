const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const { normaliserTelephone } = require("../utils/phone");
const JWT_SECRET = process.env.JWT_SECRET || "smartstock-secret-key-2024";
const register = async (req, res) => {
  try {
    const { email, password, nom, boutique, role = "patron" } = req.body;
    if (!email || !password || !nom) {
      return res.status(400).json({ success: false, message: "Nom, email et mot de passe requis" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Mot de passe trop court (min 6 caractères)" });
    }
    // tenantId unique généré côté serveur — jamais pris du header/body (falsifiable)
    const tenantId = `tenant_${crypto.randomUUID().slice(0, 8)}`;
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email déjà utilisé" });
    }
    const user = new User({
      email: email.toLowerCase().trim(),
      password,
      nom,
      boutique: boutique || nom,  // nom boutique = nom du patron par défaut
      role,
      tenantId,
    });
    await user.save();
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, tenantId: user.tenantId },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        nom: user.nom,
        boutique: user.boutique,
        role: user.role,
        tenantId: user.tenantId,
      },
      });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const login = async (req, res) => {
  try {
    const { email, telephone, password } = req.body;
    if (!password) return res.status(400).json({ success: false, message: 'Mot de passe requis' });

    // Chercher par email OU téléphone (normalisé, peu importe le format tapé)
    let user = null;
    if (email) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
    } else if (telephone) {
      const telNormalise = normaliserTelephone(telephone);
      if (!telNormalise) {
        return res.status(401).json({ success: false, message: 'Numéro de téléphone invalide' });
      }
      user = await User.findOne({ telephone: telNormalise, role: 'agent' });
    }
    if (!user) {
      return res.status(401).json({ success: false, message: 'Identifiant ou mot de passe incorrect' });
    }
    const valide = await user.verifierMotDePasse(password);
    if (!valide) {
      return res.status(401).json({ success: false, message: 'Identifiant ou mot de passe incorrect' });
    }
    if (!user.actif) {
      return res.status(403).json({ success: false, message: 'Compte désactivé' });
    }
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, tenantId: user.tenantId, boutiqueId: user.boutiqueId },
      JWT_SECRET,
      { expiresIn: '7d' },
    );
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        telephone: user.telephone,
        nom: user.nom,
        prenom: user.prenom,
        boutique: user.boutique || user.nom,
        boutiqueId: user.boutiqueId,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Utilisateur non trouvé" });
    }
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const createDemoUser = async (req, res) => {
  try {
    await User.deleteMany({
      email: { $in: ["patron@demo.com", "agent@demo.com"] },
    });
    const patron = new User({
      email: "patron@demo.com",
      password: "demo123",
      nom: "Patron Demo",
      role: "patron",
      tenantId: "demo-tenant",
    });
    const agent = new User({
      email: "agent@demo.com",
      password: "demo123",
      nom: "Agent Demo",
      role: "agent",
      tenantId: "demo-tenant",
    });
    await patron.save();
    await agent.save();
    res
      .status(201)
      .json({
        success: true,
        message: "Utilisateurs démo créés",
        credentials: {
          patron: { email: "patron@demo.com", password: "demo123" },
          agent: { email: "agent@demo.com", password: "demo123" },
        },
      });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
const changerMonMotDePasse = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;
    if (!ancienMotDePasse || !nouveauMotDePasse) {
      return res.status(400).json({ success: false, message: 'Ancien et nouveau mot de passe requis' });
    }
    if (nouveauMotDePasse.length < 6) {
      return res.status(400).json({ success: false, message: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
    }
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });

    const valide = await user.verifierMotDePasse(ancienMotDePasse);
    if (!valide) {
      return res.status(401).json({ success: false, message: 'Ancien mot de passe incorrect' });
    }
    user.password = nouveauMotDePasse; // pre-save hook hash automatiquement
    await user.save();
    res.json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { register, login, getProfile, createDemoUser, changerMonMotDePasse };
