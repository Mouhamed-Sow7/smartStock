# SmartStock Backend — Changelog technique

> Archive chronologique. Ne pas charger par défaut — état courant dans `STATE.md`.

## 2026-08

- `ab28c79` — Filet de sécurité : `POST /api/ventes` rejette désormais un `produitId` non-`ObjectId` valide avec un **400 clair** (erreur définitive) au lieu de laisser Mongoose planter en 500 générique. Contexte : un bug frontend (`8c447f5` dans `smartstock-pwa`) pouvait envoyer un id temporaire `temp_xxx` non résolu ; le frontend traitait les 500 comme erreurs réseau temporaires et retry-ait indéfiniment. Le 400 casse cette boucle proprement.
- `7df4f5c` — Ajout de `https://smartstock.digitalesf.com` à la whitelist CORS (`originesAutorisees` dans `server.js`), suite au passage au nouveau domaine custom de production.
