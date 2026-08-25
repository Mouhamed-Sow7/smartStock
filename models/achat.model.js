const mongoose = require('mongoose');

// Une ligne de facture. produitId est OPTIONNEL et volontairement pas requis
// (voir décision produit — 24/08/2026) : une vraie facture papier contient
// souvent des produits pas encore catalogués dans SmartStock au moment de
// la saisie. `nom` est toujours renseigné (ce qui est écrit sur la facture,
// ou le nom du produit lié au moment de la saisie -- snapshot, comme les
// lignes de vente) ; produitId permet de calculer une marge réelle
// (prix de vente - dernier prix d'achat connu) quand il est présent, sans
// jamais bloquer la saisie d'une ligne non liée.
const ligneAchatSchema = new mongoose.Schema({
  produitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', default: null },
  nom: { type: String, required: true, trim: true },
  quantite: { type: Number, required: true, min: 0 },
  prixUnitaire: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
}, { _id: false });

const achatSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    fournisseurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Fournisseur', required: true },
    // Snapshot du nom au moment de l'achat -- si le fournisseur est renommé
    // ou supprimé plus tard, l'historique de facture garde un nom lisible
    // sans jointure (même logique que vente.produits[].nom).
    fournisseurNom: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    numeroFacture: { type: String, default: '' },
    lignes: { type: [ligneAchatSchema], default: [] },
    montantTotal: { type: Number, required: true, min: 0 },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

achatSchema.index({ tenantId: 1, fournisseurId: 1, date: -1 });
achatSchema.index({ tenantId: 1, date: -1 });

module.exports = mongoose.model('Achat', achatSchema);
