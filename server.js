require('dotenv').config();

const express = require('express');
const connectDB = require('./config/db');
const produitRoutes = require('./routes/produit.routes');
const venteRoutes = require('./routes/vente.routes');
const agentRoutes = require('./routes/agent.routes');
const app = express();

// Middleware pour parser le JSON
app.use(express.json());
app.use('/api/ventes', venteRoutes);
app.use('/api/agents', agentRoutes);
// Connexion à la base de données
connectDB();

// Routes
app.use('/api/produits', produitRoutes);

// Route par défaut
app.get('/', (req, res) => {
  res.json({
    message: "Bienvenue sur l'API SmartStock",
    endpoints: {
      produits: '/api/produits',
      alerte: '/api/produits/alerte'
    }
  });
});

// Middleware 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée'
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});