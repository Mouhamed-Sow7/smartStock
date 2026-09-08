const mongoose = require("mongoose");

// Source unique de vérité pour l'URI MongoDB -- exportée pour que d'autres
// fichiers (ex: scripts/local-backup.js) résolvent EXACTEMENT la même valeur
// que la connexion applicative, sans dupliquer ce fallback ailleurs. Une
// duplication aurait un risque concret : si ce fallback changeait un jour
// ici sans être répercuté ailleurs, un script de backup pourrait sauvegarder
// une base différente de celle réellement utilisée par l'app, en silence.
function resolveMongoUri() {
  return process.env.MONGODB_URI || "mongodb://localhost:27017/smartStock";
}

const connectDB = async () => {
  try {
    console.log("Connexion à MongoDB en cours...");
    const conn = await mongoose.connect(resolveMongoUri());
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
// connectDB est une fonction -- on peut lui attacher des propriétés sans
// changer sa forme d'usage existante (const connectDB = require("./config/db")
// continue de fonctionner à l'identique partout où c'est déjà utilisé).
module.exports.resolveMongoUri = resolveMongoUri;
