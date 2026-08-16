const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Obligatoire pour un patron, optionnel pour un agent (identifiant de
  // connexion desormais le telephone -- voir boutique.controller.js
  // creerAgent). sparse:true indispensable : sans ca, plusieurs agents sans
  // email violeraient la contrainte unique (plusieurs valeurs "undefined"
  // seraient traitees comme des doublons par l'index Mongo).
  email:      { type: String, required: function () { return this.role === 'patron'; }, unique: true, sparse: true, lowercase: true, trim: true },
  telephone:  { type: String, default: '', index: true },  // toujours stocké normalisé via utils/phone.js (ex: "221781440232")
  password:   { type: String, required: true },
  nom:        { type: String, required: true },
  prenom:     { type: String, default: '' },
  boutique:   { type: String, default: '' },      // label affiché
  boutiqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', default: null },
  role:       { type: String, enum: ['patron', 'agent'], required: true },
  tenantId:   { type: String, required: true },
  actif:      { type: Boolean, default: true },
  // Abonnement SaaS (uniquement pertinent pour role='patron' — un agent ne
  // paie rien directement, c'est son patron qui règle pour toute la boutique).
  // Posé à +30j dès la création du compte, puis avancé de +30j à chaque fois
  // que l'admin confirme un paiement reçu. Même logique stateless que les
  // échéances clients (models/client.model.js) : rien de précalculé/stocké
  // à part la date elle-même, le statut (à venir/en retard) est toujours
  // recalculé à la lecture.
  prochainPaiementAbonnement: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.verifierMotDePasse = async function (mdp) {
  return bcrypt.compare(mdp, this.password);
};

module.exports = mongoose.model('User', userSchema);
