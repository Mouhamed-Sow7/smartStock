'use strict';

const os = require('os');
const QRCode = require('qrcode');

const { resolveMongoUri } = require('../config/db');
const { environnementLocalValide } = require('../scripts/local-backup');
const { detecterIpLan, resolvePort } = require('../utils/reseauLocal');

// GET /api/patron/reseau-local
//
// Réservé au patron (voir routes/patron.routes.js pour authMiddleware),
// contrôle de rôle inline ici -- même pattern que
// controllers/fournisseur.controller.js::verifierPatron, pas de middleware
// dédié pour un seul contrôleur.
//
// Ne renvoie JAMAIS de secret/JWT/URI Mongo : uniquement IP, port, URL
// (déduite des deux) et le QR encodant cette même URL -- aucune autre
// donnée n'a de raison d'être dans ce payload.
exports.getReseauLocal = async (req, res) => {
  try {
    if (req.user?.role !== 'patron') {
      return res.status(403).json({ success: false, message: 'Réservé au patron' });
    }

    if (!environnementLocalValide(process.platform, resolveMongoUri())) {
      return res.status(409).json({
        success: false,
        message: "Fonction disponible uniquement en mode SmartStock Local (Windows + MongoDB local).",
      });
    }

    const { ip, candidats } = detecterIpLan(os.networkInterfaces());
    if (!ip) {
      return res.status(500).json({
        success: false,
        message: "Aucune interface réseau locale détectée.",
      });
    }

    const port = resolvePort();
    const url = `http://${ip}:${port}`;
    const qrCode = await QRCode.toDataURL(url, { width: 200 });

    return res.json({
      success: true,
      ip,
      port,
      url,
      qrCode,
      // Utile pour un futur sélecteur manuel si plusieurs interfaces
      // valides coexistent (ex: Ethernet + Wi-Fi actifs) -- décision
      // d'UI non tranchée, voir audit section E. N'affecte pas le
      // contrat { success, ip, port, url, qrCode } attendu aujourd'hui.
      interfaces: candidats,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
