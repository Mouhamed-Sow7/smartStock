const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    nom: { type: String, required: true },
    role: { type: String, enum: ["patron", "agent"], required: true },
    tenantId: { type: String, required: true },
    actif: { type: Boolean, default: true },
  },
  { timestamps: true },
); // Mongoose 6+ avec async/await - next est passé automatiquement userSchema.pre("save", async function (next) { if (!this.isModified("password")) return next(); this.password = await bcrypt.hash(this.password, 10); }); userSchema.methods.verifierMotDePasse = async function (motDePasse) { return bcrypt.compare(motDePasse, this.password); }; module.exports = mongoose.model("User", userSchema);
