const mongoose = require('mongoose');

const ligneVenteSchema = new mongoose.Schema({
  produitId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', required: true },
  nom:         { type: String, required: true },   // snapshot nom au moment de la vente
  prixUnitaire:{ type: Number, required: true },   // snapshot prix de vente au moment de la vente
  prixAchatUnitaire: { type: Number, default: 0 }, // snapshot prix d'achat au moment de la vente
  quantite:    { type: Number, required: true, min: 1 },
  sousTotal:   { type: Number, required: true },
  margeLigne:  { type: Number, default: 0 }        // (prixUnitaire - prixAchatUnitaire) * quantite
}, { _id: false });

const venteSchema = new mongoose.Schema({
  tenantId:       { type: String, required: true, index: true },
  agentId:        { type: String, required: true },  // sera ObjectId quand module Agent sera prêt
  agentNom:       { type: String, default: 'Agent' },
  produits:       { type: [ligneVenteSchema], required: true },
  montantTotal:   { type: Number, required: true },
  margeTotale:    { type: Number, default: 0 },       // somme des margeLigne — marge brute de la vente
  modePaiement:   { type: String, enum: ['especes', 'wave', 'orange_money', 'mtn', 'autre'], default: 'especes' },
  statut:         { type: String, enum: ['paye', 'en_attente', 'annule'], default: 'paye' },
  numeroTicket:   { type: String, unique: true },
  note:           { type: String, default: '' }
}, { timestamps: true }); // createdAt = date/heure de la vente

// Index pour les rapports par date
venteSchema.index({ tenantId: 1, createdAt: -1 });
venteSchema.index({ tenantId: 1, agentId: 1 });
venteSchema.index({ tenantId: 1, modePaiement: 1 });

module.exports = mongoose.model('Vente', venteSchema);
