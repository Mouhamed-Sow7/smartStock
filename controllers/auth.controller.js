const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const JWT_SECRET = process.env.JWT_SECRET || "smartstock-secret-key-2024";
const register = async (req, res) => {
  try {
    const { email, password, nom, role = "patron" } = req.body;
    // tenantId unique généré côté serveur — jamais pris du header/body (falsifiable)
    const tenantId = `tenant_${crypto.randomUUID().slice(0, 8)}`;
    const existing = await User.findOne({ email });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email déjà utilisé" });
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
    res.status(500).json({ success: false, message: err.message });
  }
};
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Email ou mot de passe incorrect" });
    }
    const valide = await user.verifierMotDePasse(password);
    if (!valide) {
      return res
        .status(401)
        .json({ success: false, message: "Email ou mot de passe incorrect" });
    }
    if (!user.actif) {
      return res
        .status(403)
        .json({ success: false, message: "Compte désactivé" });
    }
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
      token,
      user: {
        id: user._id,
        email: user.email,
        nom: user.nom,
        boutique: user.boutique || user.nom,
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
module.exports = { register, login, getProfile, createDemoUser };
