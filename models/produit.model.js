const mongoose = require("mongoose");

const produitSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    nom: { type: String, required: true, trim: true },
    prix: { type: Number, required: true, min: 0 },
    prixAchat: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    seuilAlerte: { type: Number, default: 5 },
    categorie: { type: String, default: "Général" },
    codeBarres: { type: String, default: "" },
    image: { type: String, default: "" },
  },
  { timestamps: true },
);

// Index composite pour les requêtes multi-tenant
produitSchema.index({ tenantId: 1, nom: 1 });

// Index unique pour codeBarres par tenant (empêche les doublons)
// partialFilterExpression ignore les documents avec codeBarres vide
produitSchema.index(
  { tenantId: 1, codeBarres: 1 },
  { unique: true, partialFilterExpression: { codeBarres: { $ne: "" } } },
);

module.exports = mongoose.model("Produit", produitSchema);
