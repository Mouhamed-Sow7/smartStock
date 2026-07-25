const mongoose = require('mongoose');

// Un paiement = un remboursement partiel ou total du solde dû d'un client.
// Volontairement pas lié à une Vente précise : dans la pratique un client
// rembourse "de l'argent sur son ardoise", pas une vente spécifique.
const paiementSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    clientNom: { type: String, required: true }, // snapshot
    montant: { type: Number, required: true, min: 1 },
    agentId: { type: String, default: '' },
    agentNom: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

paiementSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

module.exports = mongoose.model('Paiement', paiementSchema);
