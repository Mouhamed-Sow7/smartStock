require("dotenv").config();
console.log("=== Démarrage du serveur SmartStock ===");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
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

// SmartStock Local / réseau LAN / Tailscale -- ces adresses ne sont pas
// connues à l'avance (chaque boutique a sa propre IP), donc liste blanche
// exacte impossible ici : on teste un motif plutôt qu'une valeur figée.
// Reste volontairement restreint à des plages non routables publiquement
// (RFC1918 + CGNAT Tailscale) + localhost -- jamais un accès depuis
// Internet, cohérent avec "ne pas exposer l'API au public" pour le mode
// Local (voir décision architecture CORS du 08/09/2026).
const REGEX_ORIGINE_LOCALE = new RegExp(
  '^https?:\\/\\/(' +
    'localhost' + // localhost, tout port
    '|127\\.0\\.0\\.1' + // boucle locale IPv4, tout port
    '|10\\.(?:\\d{1,3}\\.){2}\\d{1,3}' + // RFC1918 10.0.0.0/8
    '|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3}' + // RFC1918 172.16.0.0/12
    '|192\\.168\\.\\d{1,3}\\.\\d{1,3}' + // RFC1918 192.168.0.0/16
    '|100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.\\d{1,3}\\.\\d{1,3}' + // Tailscale CGNAT 100.64.0.0/10
    '|[a-zA-Z0-9.-]+\\.ts\\.net' + // Tailscale MagicDNS / Serve (usage futur)
    ')(:\\d+)?$',
);
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || originesAutorisees.includes(origin) || REGEX_ORIGINE_LOCALE.test(origin)) {
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

// --- SmartStock Local : servir le build Angular depuis ce même process ---
// Décision architecture du 08/09/2026 : en mode Local, le frontend et
// l'API tournent sur le même serveur Express, à la même adresse -- pas
// besoin de connaître d'IP à l'avance côté frontend (voir
// environments/environment.ts, résolution "same-origin"). Détection par
// présence de fichier plutôt que par variable d'env : sur Render (Cloud),
// ce dossier n'existe pas dans le repo backend déployé, donc
// frontendDisponible est toujours false et RIEN ne change côté Cloud.
const frontendDistPath = path.join(__dirname, "public");
const frontendDisponible = fs.existsSync(path.join(frontendDistPath, "index.html"));
if (frontendDisponible) {
  console.log("Frontend Local détecté (public/index.html) -- servi statiquement.");
  app.use(express.static(frontendDistPath));
}

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
// Message de bienvenue JSON -- uniquement pertinent quand il n'y a pas de
// frontend à servir ici (Cloud/Render). En mode Local, express.static
// sert déjà index.html sur "/" automatiquement, donc pas besoin (et pas
// souhaitable) d'enregistrer cette route JSON par-dessus.
if (!frontendDisponible) {
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
}
app.use((req, res) => {
  // Mode Local : toute requête GET qui n'est ni un fichier statique connu
  // ni une route API est probablement une route interne du routeur
  // Angular (ex: /patron/dashboard rechargée directement dans le
  // navigateur) -- on renvoie index.html et le routeur Angular côté
  // client prend le relais. Les vraies routes /api/* inconnues gardent
  // exactement leur réponse JSON 404 actuelle, en Local comme en Cloud.
  if (frontendDisponible && req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(frontendDistPath, "index.html"));
  }
  res.status(404).json({ success: false, message: "Route non trouvée" });
});
// --- SmartStock Local : rattrapage de sauvegarde au démarrage -----------
// Concerne uniquement le mode Local Windows (voir scripts/local-backup.js
// pour la détection précise -- Windows ET MongoDB local, pas seulement
// Windows). Sur Cloud/Render, toujours Linux, cette fonction retourne
// immédiatement : aucun require de scripts/local-backup.js, aucun log,
// aucun comportement changé. Le backup, s'il est déclenché, tourne en
// arrière-plan via setImmediate -- jamais d'attente avant que le serveur
// HTTP soit prêt à répondre, et une erreur ici ne doit jamais faire tomber
// l'API (d'où le try/catch qui englobe tout, y compris les require()).
function demarrerRattrapageBackupLocal() {
  if (process.platform !== "win32") return;
  setImmediate(() => {
    try {
      const backup = require("./scripts/local-backup");
      const { resolveMongoUri } = require("./config/db");
      if (!backup.environnementLocalValide(process.platform, resolveMongoUri())) return;
      if (backup.backupRecentExiste(24 * 60 * 60 * 1000)) return;
      console.log("SmartStock Local : aucun backup récent (< 24h) -- lancement en arrière-plan.");
      backup.executerBackup();
    } catch (err) {
      console.error(
        "SmartStock Local : rattrapage de backup ignoré suite à une erreur (non bloquant pour le serveur) :",
        err.message,
      );
    }
  });
}

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
      demarrerRattrapageBackupLocal();
    });
  } catch (error) {
    console.error("Erreur de connexion MongoDB:", error.message);
    process.exit(1);
  }
}
console.log("Appel de startServer()...");
startServer();
