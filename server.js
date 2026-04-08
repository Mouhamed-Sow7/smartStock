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
console.log("Création de l'application Express...");
const app = express();
console.log("Configuration CORS...");
app.use(
  cors({
    origin: ["http://localhost:4200", "http://127.0.0.1:4200"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-tenant-id"],
  }),
);
app.use(express.json());
app.use("/api", (req, res, next) => {
  console.log("Route hit:", req.originalUrl);
  next();
});
console.log("Configuration des routes...");
app.use("/api/produits", produitRoutes);
app.use("/api/ventes", venteRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/panier", panierRoutes);
app.use("/api/auth", authRoutes);
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
