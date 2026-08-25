require("dotenv").config();
console.log("=== Démarrage du serveur SmartStock ===");
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
console.log("Import des routes...");
const produitRoutes = require("./routes/produit.routes");
console.log(" - produitRoutes chargé");
const venteRoutes = require("./routes/vente.routes");
console.log(" - venteRoutes chargé");
const agentRoutes = require("./routes/agent.routes");
console.log(" - agentRoutes chargé");
const panierRoutes = require("./routes/panier.routes");
console.log(" - panierRoutes chargé");
const authRoutes = require("./routes/auth.routes");
console.log(" - authRoutes chargé");
const adminRoutes = require("./routes/admin.routes");
console.log(" - adminRoutes chargé");
console.log("Création de l'application Express...");
const app = express();
console.log("Configuration CORS...");
const originesAutorisees = [
  "http://localhost:4200",
  "https://smartstock-pwa-cyan.vercel.app",
  "https://smartstock.digitalesf.com",
  process.env.FRONTEND_URL,
].filter(Boolean);
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || originesAutorisees.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS non autorisé: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id", "x-admin-key"],
  }),
);
app.use(express.json());
app.get("/ping", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.use("/api", (req, res, next) => {
  // Log de diagnostic déclenché sur CHAQUE requête -- utile en tout début de
  // développement, mais coûteux et bruyant maintenant que l'app tourne en
  // prod (dilue les vrais messages d'erreur dans les logs Render, qui sont
  // aussi soumis à des quotas de volume selon le plan). Ne logue plus qu'en
  // dehors de production ; les erreurs réelles restent journalisées ailleurs.
  if (process.env.NODE_ENV !== "production") {
    console.log("Route hit:", req.originalUrl);
  }
  next();
});
console.log("Configuration des routes...");
app.use("/api/produits", produitRoutes);
app.use("/api/ventes", venteRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/panier", panierRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/boutiques", require("./routes/boutique.routes"));
app.use("/api/clients", require("./routes/client.routes"));
app.use("/api/fournisseurs", require("./routes/fournisseur.routes"));
app.use("/api/achats", require("./routes/achat.routes"));
app.get("/", (req, res) => {
  res.json({
    message: "Bienvenue sur l'API SmartStock",
    endpoints: {
      produits: "/api/produits",
      ventes: "/api/ventes",
      agents: "/api/agents",
      panier: "/api/panier",
      auth: "/api/auth",
    },
  });
});
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route non trouvée" });
});
const PORT = process.env.PORT || 3000;
async function startServer() {
  console.log("=== startServer() appelée ===");
  try {
    console.log("Tentative de connexion à MongoDB...");
    await connectDB();
    console.log("MongoDB connecté avec succès!");

    // L'index unique existant sur User.email (créé avant l'introduction des
    // agents sans email) n'a pas l'option "sparse" -- incompatible avec
    // plusieurs agents ayant email absent (le login par téléphone seul ne
    // pose plus d'email du tout, voir boutique.controller.js creerAgent).
    // syncIndexes() compare le schéma actuel à l'index réel en base et le
    // recrée automatiquement s'il ne correspond plus (ici : ajout de
    // sparse:true) -- pas de script de migration manuel à faire tourner.
    // Non bloquant : si ça échoue (ex: permissions Atlas), on log et on
    // continue plutôt que de crasher tout le serveur pour un souci d'index.
    try {
      const User = require("./models/user.model");
      await User.syncIndexes();
      console.log("Index User synchronisés.");
    } catch (syncErr) {
      console.error("Avertissement : échec syncIndexes User (non bloquant):", syncErr.message);
    }

    app.listen(PORT, () => {
      console.log("========================================");
      console.log("Serveur démarré sur le port " + PORT);
      console.log("URL: http://localhost:" + PORT);
      console.log("========================================");
    });
  } catch (error) {
    console.error("Erreur de connexion MongoDB:", error.message);
    process.exit(1);
  }
}
console.log("Appel de startServer()...");
startServer();
