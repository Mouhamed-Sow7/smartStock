const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  telephone:  { type: String, default: '', index: true },  // toujours stocké normalisé via utils/phone.js (ex: "221781440232")
  password:   { type: String, required: true },
  nom:        { type: String, required: true },
  prenom:     { type: String, default: '' },
  boutique:   { type: String, default: '' },      // label affiché
  boutiqueId: { type: mongoose.Schema.Types.ObjectId, ref: 'Boutique', default: null },
  role:       { type: String, enum: ['patron', 'agent'], required: true },
  tenantId:   { type: String, required: true },
  actif:      { type: Boolean, default: true },
}, { timestamps: true });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.verifierMotDePasse = async function (mdp) {
  return bcrypt.compare(mdp, this.password);
};

module.exports = mongoose.model('User', userSchema);
