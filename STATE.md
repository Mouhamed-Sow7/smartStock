# SmartStock Backend — État courant

> Lire ce fichier + `ARCHITECTURE.md` avant de commencer toute tâche.
> Historique détaillé → `CHANGELOG.md` (charger seulement pour investiguer une régression).

**Dernière mise à jour** : 2026-08-15 — dernier commit `7df4f5c`

---

## Contexte business

Client réel en production. Frontend sur `smartstock.digitalesf.com`, backend sur Render (`smartstock-nhmt.onrender.com`). Prudence sur tout changement à impact large.

## Bugs ouverts

_Aucun bug bloquant connu actuellement côté backend._

## Tâches en attente (non bloquantes)

1. **Champ `theme` sur le modèle `User`** — pour synchroniser la préférence de thème clair/sombre entre appareils (le frontend doit pouvoir lire/écrire via un endpoint dédié). Voir `STATE.md` du repo frontend pour le détail complet de la feature. Pas commencé.

## À vérifier / recaler

- La doc `ARCHITECTURE.md` du repo **frontend** (`smartstock-pwa`) contient une description de la structure backend qui est **partiellement obsolète** : elle ne mentionne pas `client.controller.js`, `panier.controller.js`, `client.model.js`, `paiement.model.js` (système de vente à crédit, déjà en place dans ce repo). À mettre à jour côté frontend si une session y retourne.

## Pièges connus — ne pas rouvrir sauf nouveau signal

_Rien de spécifique côté backend actuellement. Voir aussi le repo frontend pour les investigations générales (cache navigateur, etc.)._

## Convention de travail (résumé — détail complet dans `.github/copilot-instructions.md`)

- `git pull --rebase` avant toute édition.
- `node -c fichier.js` après chaque édition (pas de build possible en sandbox).
- Commits en français, détaillés, cause racine expliquée.
- Tout changement infra (CORS, domaine, env vars) → vérifier aussi côté frontend.

## Comment mettre à jour ce fichier

En fin de session : déplacer les items résolus vers `CHANGELOG.md` (commit hash + cause racine), garder "Bugs ouverts" / "Tâches en attente" à jour, mettre à jour la date en haut.
