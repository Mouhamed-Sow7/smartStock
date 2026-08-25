const mongoose = require('mongoose');

const fournisseurSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    nom: { type: String, required: true, trim: true },
    telephone: { type: String, default: '' },
    adresse: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true },
);

fournisseurSchema.index({ tenantId: 1, nom: 1 });

module.exports = mongoose.model('Fournisseur', fournisseurSchema);
