const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  telephone: { type: String },
  role: {
    type: String,
    enum: ['agent', 'caissier', 'superviseur'],
    default: 'agent'
  },

  actif: { type: Boolean, default: true },

  qrCode: { type: String, unique: true },

  boutique: { type: String }

}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);