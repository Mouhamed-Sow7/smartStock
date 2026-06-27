const mongoose = require('mongoose');

const boutiqueSchema = new mongoose.Schema({
  tenantId:    { type: String, required: true, index: true }, // patron propriétaire
  nom:         { type: String, required: true, trim: true },
  adresse:     { type: String, default: '' },
  telephone:   { type: String, default: '' },
  description: { type: String, default: '' },
  actif:       { type: Boolean, default: true },
  // Slug court unique pour composer les emails agents : agent@slug.sm
  slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
}, { timestamps: true });

module.exports = mongoose.model('Boutique', boutiqueSchema);
