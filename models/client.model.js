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
    // Prochaine échéance de paiement du solde dû. Auto-posée à +30j lors de la
    // première vente à crédit (ou quand elle est déjà passée / absente), et
    // manuellement modifiable par le patron. Remise à null quand soldeDu
    // retombe à 0 (plus rien à relancer). Le statut d'alerte (à venir/en retard)
    // n'est jamais stocké : toujours recalculé à la lecture à partir de cette
    // date, pour rester stateless (pas de cron à faire tourner, pas de risque
    // de désync si le serveur Render s'endort).
    prochaineEcheance: { type: Date, default: null },
  },
  { timestamps: true },
);

clientSchema.index({ tenantId: 1, nom: 1 });

module.exports = mongoose.model('Client', clientSchema);
