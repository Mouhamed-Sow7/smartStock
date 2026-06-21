const Agent = require("../models/agent.model");
const QRCode = require("qrcode");

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
