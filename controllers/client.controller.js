const Client = require('../models/client.model');
const Paiement = require('../models/paiement.model');
const Vente = require('../models/vente.model');

const getClients = async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';
    const clients = await Client.find({ tenantId }).sort({ soldeDu: -1, nom: 1 });
    res.json({ success: true, data: clients, count: clients.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getClientById = async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';
    const client = await Client.findOne({ _id: req.params.id, tenantId });
    if (!client) return res.status(404).json({ success: false, message: 'Client non trouvé' });

    const [ventesCredit, paiements] = await Promise.all([
      Vente.find({ tenantId, clientId: client._id, modePaiement: 'credit' }).sort({ createdAt: -1 }),
      Paiement.find({ tenantId, clientId: client._id }).sort({ createdAt: -1 }),
    ]);

    res.json({ success: true, data: { client, ventesCredit, paiements } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Créé un client s'il n'existe pas encore avec ce nom exact pour ce tenant,
// sinon renvoie celui qui existe déjà (évite les doublons créés par accident,
// notamment en cas de sync offline retentée deux fois).
const createOuRecupererClient = async (tenantId, nom, telephone = '') => {
  const nomTrim = (nom || '').trim();
  if (!nomTrim) throw new Error('Nom du client requis');
  let client = await Client.findOne({ tenantId, nom: nomTrim });
  if (!client) {
    client = await Client.create({ tenantId, nom: nomTrim, telephone: telephone || '' });
  }
  return client;
};

const createClient = async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';
    const { nom, telephone } = req.body;
    const client = await createOuRecupererClient(tenantId, nom, telephone);
    res.status(201).json({ success: true, data: client });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Enregistre un paiement (remboursement) contre le solde dû d'un client.
// Ne descend jamais le solde en dessous de 0 (protège contre un montant saisi
// trop grand, ou un paiement offline dupliqué qui rejouerait après sync).
const enregistrerPaiement = async (req, res) => {
  try {
    const tenantId = req.tenantId || 'default';
    const { montant, note } = req.body;
    const montantNum = Number(montant);
    if (!montantNum || montantNum <= 0) {
      return res.status(400).json({ success: false, message: 'Montant invalide' });
    }
    const client = await Client.findOne({ _id: req.params.id, tenantId });
    if (!client) return res.status(404).json({ success: false, message: 'Client non trouvé' });

    const agentNom = req.user?.nom || '';
    const paiement = await Paiement.create({
      tenantId,
      clientId: client._id,
      clientNom: client.nom,
      montant: montantNum,
      agentId: req.user?.id || '',
      agentNom,
      note: note || '',
    });

    client.soldeDu = Math.max(0, client.soldeDu - montantNum);
    await client.save();

    res.status(201).json({ success: true, data: { paiement, soldeDu: client.soldeDu } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getClients,
  getClientById,
  createClient,
  createOuRecupererClient,
  enregistrerPaiement,
};
