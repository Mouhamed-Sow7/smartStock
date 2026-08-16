# SmartStock Backend — État courant

> Lire ce fichier + `ARCHITECTURE.md` avant de commencer toute tâche.
> Historique détaillé → `CHANGELOG.md` (charger seulement pour investiguer une régression).

**Dernière mise à jour** : 2026-08-15 — dernier commit `7999339`

---

## Contexte business

Client réel en production. Frontend sur `smartstock.digitalesf.com`, backend sur Render (`smartstock-nhmt.onrender.com`). Prudence sur tout changement à impact large.

## ⚠️ Déploiement Render non vérifiable automatiquement

Contrairement à Vercel (qui poste un statut de déploiement sur GitHub, vérifiable via API), **Render ne le fait pas**. Après un push sur ce repo, toujours demander à l'utilisateur de confirmer le déploiement sur son dashboard Render avant de considérer un fix comme "en prod".

## Bugs ouverts

_Aucun bug bloquant connu actuellement côté backend._

## Backlog priorisé par l'utilisateur (2026-08-15)

1. ✅ **Login par téléphone patron** — corrigé (`7999339`). La recherche par téléphone dans `login()` était codée en dur sur `role:'agent'`, excluant les patrons. Filtre retiré.
2. ✅ **Cascade renommage boutique** — corrigé (`7999339`). `editUser()` (admin) ne mettait à jour que le patron édité ; le nom est dénormalisé sur chaque compte agent à sa création (`boutique.controller.js creerAgent`). Cascade ajoutée via `User.updateMany({tenantId}, ...)`. Collection `Boutique` (système multi-outlet séparé) volontairement non cascadée.
3. **⏳ Pas commencé — mot de passe généré par admin pour patron**
   `PATCH /admin/users/:id/reset-password` existe déjà (`admin.controller.js`, fonctionnel, déjà utilisé pour les agents côté UI admin). Vérifier/exposer côté UI admin pour un **patron** (frontend `smartstock-pwa`, `admin.component.ts` — semble scopé aux agents actuellement, à vérifier côté frontend).
4. **⏳ Pas commencé — endpoint pour que le patron change son propre email/téléphone**
   Nécessaire pour (a) les patrons sans téléphone en base (point 1 côté login), (b) le cas "email bloqué" mentionné par l'utilisateur. Pas d'endpoint dédié actuellement (`editUser` est admin-only, protégé par `x-admin-key`).
5. **⏳ Pas commencé, priorité la plus basse — email de récupération de mot de passe**
   Adresses dispo côté utilisateur : `contact@digitalesf.com` / `noreply@digitalesf.com`. Nécessite Nodemailer + provider SMTP gratuit (Brevo/SendGrid free tier à évaluer) + variables d'env (`SMTP_HOST`, `SMTP_USER`, etc. sur Render) + un flow token de reset à durée limitée. En attente que 3-4 soient terminés.

## À vérifier / recaler

- La doc `ARCHITECTURE.md` du repo **frontend** (`smartstock-pwa`) contient une description de la structure backend **partiellement obsolète** : elle ne mentionne pas `client.controller.js`, `panier.controller.js`, `client.model.js`, `paiement.model.js` (système de vente à crédit, déjà en place dans ce repo).

## Pièges connus — ne pas rouvrir sauf nouveau signal

_Rien de spécifique côté backend actuellement. Voir le repo frontend pour le point d'architecture "zoneless" (concerne le frontend, pas ce repo, mais explique plusieurs bugs UI de la session du 2026-08-15)._

## Convention de travail (résumé — détail complet dans `.github/copilot-instructions.md`)

- `git pull --rebase` avant toute édition.
- `node -c fichier.js` après chaque édition (pas de build possible en sandbox).
- Commits en français, détaillés, cause racine expliquée.
- Tout changement infra (CORS, domaine, env vars) → vérifier aussi côté frontend.
- Messages de commit avec backticks : utiliser `git commit -F fichier.txt` plutôt que `-m "..."` en bash double-quotes (les backticks y sont interprétés comme de la substitution de commande).

## Comment mettre à jour ce fichier

En fin de session : déplacer les items résolus vers `CHANGELOG.md` (commit hash + cause racine), garder "Bugs ouverts"/"Backlog priorisé" à jour, mettre à jour la date en haut.
