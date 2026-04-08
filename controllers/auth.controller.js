const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const bcrypt = require("bcryptjs");
const JWT_SECRET = process.env.JWT_SECRET || "smartstock-secret-key-2024";
const register = async (req, res) => {
  try {
    const { email, password, nom, role = "patron" } = req.body;
    const tenantId = req.headers["x-tenant-id"] || "demo-tenant";
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Un utilisateur avec cet email existe déjà",
        });
    }
    const user = new User({ email, password, nom, role, tenantId });
    await user.save();
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res
      .status(201)
      .json({
        success: true,
        message: "Compte créé avec succès",
        token,
        user: {
          id: user._id,
          email: user.email,
          nom: user.nom,
          role: user.role,
          tenantId: user.tenantId,
        },
      });
  } catch (err) {
    console.error("Erreur register:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Erreur lors de la création du compte",
      });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Tentative de connexion:", email);
    const user = await User.findOne({ email });
    if (!user) {
      console.log("Utilisateur non trouvé:", email);
      return res
        .status(401)
        .json({ success: false, message: "Email ou mot de passe incorrect" });
    }
    console.log("Utilisateur trouvé:", user.email, "tenantId:", user.tenantId);
    const motDePasseValide = await user.verifierMotDePasse(password);
    if (!motDePasseValide) {
      console.log("Mot de passe incorrect pour:", email);
      return res
        .status(401)
        .json({ success: false, message: "Email ou mot de passe incorrect" });
    }
    if (!user.actif) {
      return res
        .status(403)
        .json({ success: false, message: "Ce compte est désactivé" });
    }
    console.log("Connexion réussie pour:", email);
    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    res.json({
      success: true,
      message: "Connexion réussie",
      token,
      user: {
        id: user._id,
        email: user.email,
        nom: user.nom,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (err) {
    console.error("Erreur login:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
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
    console.error("Erreur getProfile:", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
};
const createDemoUser = async (req, res) => {
  try {
    const tenantId = "demo-tenant";
    const existingPatron = await User.findOne({ email: "patron@demo.com" });
    if (existingPatron) {
      return res.json({
        success: true,
        message: "Utilisateurs démo déjà créés",
        credentials: {
          patron: { email: "patron@demo.com", password: "demo123" },
          agent: { email: "agent@demo.com", password: "demo123" },
        },
      });
    }
    const patron = new User({
      email: "patron@demo.com",
      password: "demo123",
      nom: "Patron Demo",
      role: "patron",
      tenantId,
    });
    const agent = new User({
      email: "agent@demo.com",
      password: "demo123",
      nom: "Agent Demo",
      role: "agent",
      tenantId,
    });
    await patron.save();
    await agent.save();
    res
      .status(201)
      .json({
        success: true,
        message: "Utilisateurs démo créés avec succès",
        credentials: {
          patron: { email: "patron@demo.com", password: "demo123" },
          agent: { email: "agent@demo.com", password: "demo123" },
        },
      });
  } catch (err) {
    console.error("Erreur createDemoUser:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Erreur lors de la création des utilisateurs démo",
      });
  }
};
module.exports = { register, login, getProfile, createDemoUser };
