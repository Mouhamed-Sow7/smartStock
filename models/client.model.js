const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    nom: { type: String, required: true, trim: true },
    telephone: { type: String, default: '' },
    // Solde dû actuel, mis à jour à chaque vente à crédit (+) et chaque paiement (-).
    // Source de vérité unique pour éviter de recalculer en sommant tout l'historique
    // à chaque lecture (coûteux et source de désync possible en offline).
    soldeDu: { type: Number, default: 0 },
  },
  { timestamps: true },
);

clientSchema.index({ tenantId: 1, nom: 1 });

module.exports = mongoose.model('Client', clientSchema);
