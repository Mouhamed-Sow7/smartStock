const Agent = require("../models/agent.model");
const QRCode = require("qrcode");

// GET ALL AGENTS (patron)
exports.getAgents = async (req, res) => {
  try {
    const agents = await Agent.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    res.json({ success: true, data: agents });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// TOGGLE ACTIF/INACTIF
exports.toggleAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!agent) return res.status(404).json({ success: false, message: "Agent non trouvé" });
    agent.actif = !agent.actif;
    await agent.save();
    res.json({ success: true, data: agent });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE AGENT
exports.deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!agent) return res.status(404).json({ success: false, message: "Agent non trouvé" });
    res.json({ success: true, message: "Agent supprimé" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// CREATE AGENT + QR
exports.createAgent = async (req, res) => {
  try {
    const { nom, prenom, telephone, role, boutique } = req.body;
    const tenantId = req.tenantId;

    const agent = new Agent({
      tenantId,
      nom,
      prenom,
      telephone,
      role,
      boutique,
    });

    // Générer un QR court (pas image)
    agent.qrCode = `QR-${agent._id}-${tenantId}`;

    await agent.save();

    res.status(201).json({
      success: true,
      data: agent,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// GET QR CODE IMAGE
exports.getQRCodeImage = async (req, res) => {
  try {
    const agent = await Agent.findOne({ _id: req.params.id, tenantId: req.tenantId });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent non trouvé",
      });
    }

    const data = JSON.stringify({
      agentId: agent._id,
      tenantId: agent.tenantId,
      nom: `${agent.prenom} ${agent.nom}`,
    });

    const image = await QRCode.toDataURL(data, { width: 200 });

    res.json({
      success: true,
      qrCode: image,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// SCAN AGENT BY QR CODE
exports.scanAgent = async (req, res) => {
  try {
    const { code } = req.params;

    const agent = await Agent.findOne({ qrCode: code });

    if (!agent) {
      return res.status(404).json({
        success: false,
        message: "Agent non trouvé",
      });
    }

    if (!agent.actif) {
      return res.status(403).json({
        success: false,
        message: "Agent désactivé",
      });
    }

    res.json({
      success: true,
      data: {
        agentId: agent._id,
        nom: `${agent.prenom} ${agent.nom}`,
        role: agent.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// PATCH /api/agents/:id — modifier nom, prenom, telephone + reset optionnel mot de passe
exports.updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!agent) return res.status(404).json({ success: false, message: 'Agent non trouvé' });

    const { nom, prenom, telephone, resetPassword } = req.body;
    if (nom)       agent.nom       = nom;
    if (prenom)    agent.prenom    = prenom;
    if (telephone) agent.telephone = telephone;

    let nouveauMotDePasse = null;
    if (resetPassword) {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      nouveauMotDePasse = Array.from({ length: 8 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
      agent.password = nouveauMotDePasse;
    }

    await agent.save();
    res.json({
      success: true,
      data: agent,
      ...(nouveauMotDePasse ? { nouveauMotDePasse } : {}),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
