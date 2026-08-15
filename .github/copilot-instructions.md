# Instructions pour agents IA (Copilot, Claude, Cline...)

Lu automatiquement par GitHub Copilot Chat au début de chaque conversation dans ce repo.
Pour toute autre IA : lire ce fichier explicitement avant de commencer.

## Avant de commencer une tâche

1. Lire `STATE.md` (bugs ouverts, tâches en attente).
2. Lire `ARCHITECTURE.md` (stack, structure, CORS, conventions d'erreurs).
3. `git pull --rebase` avant toute édition — d'autres sessions/personnes poussent en parallèle.
4. Ne PAS charger `CHANGELOG.md` sauf besoin explicite d'investiguer une régression.

## Contraintes projet

- **Client réel en production**. Priorité à la stabilité, pas de régression.
- Multi-tenant strict : toute donnée métier scopée par `tenantId`.
- CORS : whitelist stricte par origine exacte dans `server.js` (`originesAutorisees`), jamais de wildcard. Tout nouveau domaine frontend doit y être ajouté.
- Convention d'erreurs : une entrée invalide (ex: id malformé) doit renvoyer un **400 clair**, jamais laisser Mongoose planter en 500 générique — le frontend retry indéfiniment sur les 500 en les traitant comme erreurs réseau.

## Style de code et de commit attendu

- Commits en français, détaillés, cause racine expliquée (pas juste le symptôme).
- `node -c fichier.js` systématiquement après chaque édition (pas de build possible en sandbox).
- Utilisateur non-développeur mais technique et exigeant : explications claires, sans jargon non expliqué.

## En fin de session

Mettre à jour `STATE.md` : déplacer les items résolus vers `CHANGELOG.md` (commit hash + cause racine).

## Repo lié

Le frontend correspondant est `Mouhamed-Sow7/smartstock-pwa` (Angular, offline-first). Toute modif infra (CORS, domaine, env vars) doit être vérifiée des deux côtés.
