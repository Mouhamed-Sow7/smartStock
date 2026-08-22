const mongoose = require('mongoose');

const ligneVenteSchema = new mongoose.Schema({
  produitId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', required: true },
  nom:         { type: String, required: true },   // snapshot nom au moment de la vente
  prixUnitaire:{ type: Number, required: true },   // snapshot prix de vente au moment de la vente
  prixAchatUnitaire: { type: Number, default: 0 }, // snapshot prix d'achat au moment de la vente
  quantite:    { type: Number, required: true, min: 1 },
  sousTotal:   { type: Number, required: true },
  margeLigne:  { type: Number, default: 0 },       // (prixUnitaire - prixAchatUnitaire) * quantite
  // 'gros' seulement si le produit a un prixGros défini ET que l'agent a
  // explicitement choisi ce mode à la vente — sinon toujours 'detail'.
  typeVente:   { type: String, enum: ['detail', 'gros'], default: 'detail' },
}, { _id: false });

const venteSchema = new mongoose.Schema({
  tenantId:       { type: String, required: true, index: true },
  agentId:        { type: String, required: true },  // sera ObjectId quand module Agent sera prêt
  agentNom:       { type: String, default: 'Agent' },
  produits:       { type: [ligneVenteSchema], required: true },
  montantTotal:   { type: Number, required: true },
  margeTotale:    { type: Number, default: 0 },       // somme des margeLigne — marge brute de la vente
  modePaiement:   { type: String, enum: ['especes', 'wave', 'orange_money', 'free_money', 'mtn', 'autre', 'credit'], default: 'especes' },
  clientId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null }, // uniquement si modePaiement === 'credit'
  clientNom:      { type: String, default: '' }, // snapshot, pratique pour l'affichage sans populate
  statut:         { type: String, enum: ['paye', 'en_attente', 'annule'], default: 'paye' },
  numeroTicket:   { type: String, unique: true },
  note:           { type: String, default: '' },
  // Historique des corrections a posteriori (mode de paiement et/ou prix
  // d'une ligne) — jamais de suppression silencieuse d'une valeur passée,
  // toujours une trace de qui a changé quoi et quand. Voir corrigerVente
  // dans vente.controller.js pour les règles d'autorisation et la fenêtre
  // de 24h après laquelle une vente n'est plus modifiable.
  corrections: [{
    date: { type: Date, default: Date.now },
    parRole: { type: String, enum: ['agent', 'patron'] },
    parNom: { type: String, default: '' },
    champ: { type: String }, // 'modePaiement' ou 'prixUnitaire'
    ligneIndex: { type: Number, default: null }, // uniquement pour une correction de prix
    avant: { type: mongoose.Schema.Types.Mixed },
    apres: { type: mongoose.Schema.Types.Mixed },
  }],
}, { timestamps: true }); // createdAt = date/heure de la vente

// Index pour les rapports par date
venteSchema.index({ tenantId: 1, createdAt: -1 });
venteSchema.index({ tenantId: 1, agentId: 1 });
venteSchema.index({ tenantId: 1, modePaiement: 1 });

module.exports = mongoose.model('Vente', venteSchema);
