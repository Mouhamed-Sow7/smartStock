# SmartStock Backend — Architecture Technique

> Repo backend de SmartStock. Le frontend correspondant est `Mouhamed-Sow7/smartstock-pwa` (Angular, offline-first, Dexie.js).

## Stack

| Couche | Technologie |
|---|---|
| Runtime | Node.js + Express 5 |
| Base de données | MongoDB (Mongoose) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Hébergement | Render (free tier — cold-start ~20-30s après inactivité) |
| Autres | `qrcode` / `bwip-js` (génération QR/codes-barres agents), `dotenv` |

## Structure des dossiers

```
├── controllers/
│   ├── auth.controller.js       # register, login, createDemoUser, changePassword
│   ├── produit.controller.js    # CRUD produits, alertes stock, scan barcode
│   ├── vente.controller.js      # createVente (identité via JWT), getStats, getVentes
│   ├── agent.controller.js      # QR-code agents (collection séparée, sans login)
│   ├── boutique.controller.js   # CRUD boutiques + agents multi-boutiques
│   ├── client.controller.js     # système de vente à crédit — gestion clients
│   ├── panier.controller.js     # gestion panier / paiements
│   └── admin.controller.js      # gestion superadmin (clé API)
├── models/
│   ├── user.model.js            # patrons ET agents (même collection, champ `role`)
│   ├── boutique.model.js        # points de vente multi-boutiques
│   ├── produit.model.js         # catalogue produits
│   ├── vente.model.js           # transactions + marge
│   ├── client.model.js          # clients (vente à crédit)
│   ├── paiement.model.js        # paiements (vente à crédit)
│   └── agent.model.js           # agents QR
├── routes/                      # un fichier par domaine, miroir des controllers
├── middleware/
│   └── auth.middleware.js       # décode JWT -> req.user, req.tenantId
└── utils/
    ├── phone.js                 # normalisation téléphone sénégalais
    ├── password.js              # générateur mot de passe aléatoire lisible
    ├── panier.js                # helpers panier
    └── echeance.js              # helpers échéances (rappels crédit clients)
```

> ⚠️ Cette structure a évolué (système de vente à crédit ajouté : `client`, `paiement`, `panier`) — l'`ARCHITECTURE.md` du repo frontend ne reflète pas encore ces ajouts. À recaler si besoin lors d'une prochaine session touchant les deux repos.

## Multi-tenant

Chaque patron a un `tenantId`. Ses agents héritent du même `tenantId`. **Toute requête et tout modèle qui stocke des données métier doit être scopé par `tenantId`** — c'est la garantie d'isolation entre boutiques.

## CORS — point critique

Whitelist stricte par origine exacte dans `server.js` (`originesAutorisees`), **pas de wildcard** :

```js
const originesAutorisees = [
  "http://localhost:4200",
  "https://smartstock-pwa-cyan.vercel.app",
  "https://smartstock.digitalesf.com",
  process.env.FRONTEND_URL,
].filter(Boolean);
```

**Tout nouveau domaine/sous-domaine frontend doit être ajouté ici**, sinon toutes les requêtes API échouent silencieusement en erreur CORS côté navigateur (visible seulement en Console DevTools — pas intuitif à diagnostiquer si on ne sait pas où chercher).

## Gestion des erreurs — convention

`POST /api/ventes` rejette un `produitId` non-`ObjectId` valide avec un **400 clair** plutôt que de laisser Mongoose planter en 500 générique — le frontend traite les 500 comme des erreurs réseau temporaires et retry indéfiniment. **Cette convention (erreurs définitives = 400, jamais 500 générique sur une entrée invalide) doit être suivie pour tout nouvel endpoint.**

## Vérification syntaxique

Pas de `node_modules` fiable en sandbox IA pour builder → utiliser systématiquement `node -c fichier.js` après chaque édition d'un fichier backend, en plus de la relecture manuelle.
