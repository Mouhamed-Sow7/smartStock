# SmartStock Backend — État courant

> Lire ce fichier + `ARCHITECTURE.md` avant de commencer toute tâche.
> Historique détaillé → `CHANGELOG.md` (charger seulement pour investiguer une régression).

**Dernière mise à jour** : 2026-08-20 — dernier commit `b56e471`

---

## Contexte business

Client réel en production. Frontend sur `smartstock.digitalesf.com`, backend sur Render (`smartstock-nhmt.onrender.com`). Prudence sur tout changement à impact large. **L'utilisateur prévoit de passer sur des plans payants Render + MongoDB Atlas pour faire grandir ce SaaS** (2026-08-20) — voir section audit ci-dessous, plusieurs points deviennent plus importants dans cette optique (index, pagination, rate limiting).

## ⚠️ Déploiement Render non vérifiable automatiquement

Contrairement à Vercel (poste un statut sur GitHub, vérifiable via API), **Render ne le fait pas**. Toujours demander confirmation à l'utilisateur après un push sur ce repo.

## 🔒 Audit sécurité/performance (2026-08-20)

Audit demandé par l'utilisateur avant la montée en charge Render/Atlas. Voir aussi le commit `b56e471`.

### Corrigé cette session

- **[CRITIQUE] Secrets de repli codés en dur** — `JWT_SECRET` et `ADMIN_SECRET_KEY` retombaient sur une valeur fixe écrite en clair dans le code (`"smartstock-secret-key-2024"` / `"smartstock-admin-2024"`) si la variable d'env correspondante manquait. **Ce repo est public sur GitHub** — n'importe qui aurait pu forger un JWT valide ou obtenir un accès admin complet si ces variables venaient à manquer sur Render (oubli, nouvel environnement). Corrigé via `utils/secrets.js` : génère un secret aléatoire par démarrage de process si la variable manque (mémoïsé pour rester cohérent entre les fichiers qui le consomment), au lieu d'une valeur publique connue. Log d'avertissement explicite dans les logs Render si ça se déclenche — **à surveiller après le prochain déploiement : si le warning apparaît, `JWT_SECRET`/`ADMIN_SECRET_KEY` ne sont pas configurées sur Render, à corriger dans Settings > Environment.**
- Index manquant sur `User.tenantId` (présent partout ailleurs, oublié sur ce modèle) — requêtes "équipe d'un tenant" en scan complet de collection. Se recrée automatiquement au déploiement via `User.syncIndexes()`.
- `console.log("Route hit", ...)` sur chaque requête API désactivé en production (bruit de logs, coûteux sur les plans Render à quota de logs).

### Recommandé, pas encore fait (à prioriser avant/pendant la montée en charge)

1. **Pagination absente sur tous les endpoints de liste** (`GET /ventes`, `/produits`, `/clients`, `/agents`...) — retournent la collection complète du tenant à chaque appel. Pour une petite boutique aujourd'hui ce n'est pas grave, mais `Vente` grandit sans limite dans le temps (jamais purgé) et chaque appel du dashboard/historique va transférer un JSON de plus en plus lourd vers des téléphones sur réseau mobile ouest-africain. À traiter avant que l'historique des plus anciens tenants ne devienne trop volumineux — nécessite un changement API (paramètres `page`/`limit`) ET frontend (chargement par page), donc pas un correctif rapide, à planifier.
2. **Aucun rate limiting** — ni sur `/auth/login` (brute force possible sur les mots de passe), ni sur le reste de l'API. Sur un plan payant Render/Atlas, ça veut aussi dire qu'un abus (bot, boucle cliente buggée) se traduit directement en facture plus élevée. `express-rate-limit` suffit largement pour ce volume, léger à ajouter.
3. **Pas de `helmet`** — en-têtes de sécurité HTTP standards absents (X-Content-Type-Options, etc.). Ajout à faible risque, une ligne dans `server.js`.
4. **Repo public** — les deux PAT de ce repo et du frontend ont été exposés de très nombreuses fois dans les conversations précédentes (voir section pièges connus) ; combiné au fait que le code source (y compris toute logique métier/tarification) est visible par n'importe qui, à garder en tête même si ça reste un choix légitime de l'utilisateur.

### Conseil plans Render/Atlas (pas un engagement, juste un repère)

Avec l'usage actuel (quelques tenants, historique encore petit), le principal bénéfice concret d'un plan Render payant est d'éliminer le cold-start (voir commit `cefebf5` côté frontend — les faux "déconnexion" pendant l'indexation sont directement causés par le sleep du plan gratuit). Sur Atlas, le plan gratuit M0 a des limites de connexions/stockage qui deviendront un vrai sujet une fois plusieurs tenants actifs simultanément avec plus d'historique de ventes — mais tant que la pagination (point 1 ci-dessus) n'est pas traitée, un plan Atlas plus gros masquera le symptôme sans régler la cause (requêtes qui rapatrient des collections entières). Idéalement : traiter au moins la pagination des ventes avant ou juste après la bascule vers les plans payants, pas après avoir laissé grossir l'historique encore plusieurs mois.

## Bugs ouverts

_Aucun bug bloquant connu actuellement._

## Backlog — demandes utilisateur en attente (2026-08-20)

1. **⏳ Email de récupération de mot de passe** — priorité la plus basse. Nécessite Nodemailer + provider SMTP gratuit (Brevo/SendGrid à évaluer), variables d'env sur Render (`SMTP_HOST`, `SMTP_USER`...), flow de token de reset à durée limitée. Adresses dispo côté utilisateur : `contact@digitalesf.com`/`noreply@digitalesf.com`.
2. **⏳ Version "quincaillerie"** — l'utilisateur veut une variante de SmartStock pour la gestion commerciale de quincailleries (pas une traduction, un métier différent). Aucun détail précis donné pour l'instant — à clarifier en début de prochaine session (nomenclature produits différente ? unités de mesure ? rien de plus précisé à ce stade).
3. **⏳ Pagination + rate limiting + helmet** — voir section audit ci-dessus, à traiter avant que le volume ne devienne un vrai problème.

## Résolu récemment (2026-08-17 → 2026-08-20), pour référence rapide

- Vente à crédit dans le panier agent (carte "Crédit" + nom client), cloisonnement des ventes par agent (chaque agent ne voit que ses ventes, patron voit tout + filtre par agent), refonte "Relances" → "Prêts" (todo-list paiement clients, notifie uniquement le patron)
- Vente détail/gros (prix de gros optionnel sur le produit, choix à la vente), scan rapide togglable, filtres stock, alertes péremption
- Fix base Dexie cassée (DatabaseClosedError) suite à une migration de structure du panier hors-ligne + lectures caméra erronées (checksum EAN + double lecture)
- Fix icône date invisible (`color-scheme` désynchronisé du thème réel de l'app) + modal produit fermé par erreur au clic extérieur
- Traduction arabe (fusha) du parcours agent avec sélecteur FR/AR (pas de librairie externe, service maison signal-based)
- Fix date de péremption (et prix de gros) jamais sauvegardés à la création d'un produit — payload de création figé en dur, jamais mis à jour avec les nouveaux champs
- Prix de vente ajustable ligne par ligne dans le panier avant validation (remises sur lot type "3 pour 100F"), sans jamais toucher au prix catalogue
- Fix fausse "déconnexion" pendant l'indexation (cold-start Render sans retry sur creerProduit/ajusterStock, corrigé comme creerVente)
- **Audit sécurité/performance** (cette session) — voir section dédiée ci-dessus

## Résolu avant ça (2026-08-15 → 2026-08-16), pour référence rapide

- Login par téléphone patron débloqué (`role:'agent'` retiré du filtre de recherche)
- Cascade complète de renommage de boutique : `User.boutique` sur tout le tenant + `Boutique.nom`/`slug` (si mono-boutique) + relocalisation des emails agents concernés — nouvel utilitaire partagé `utils/boutiqueRename.js`
- Nouvel endpoint `PATCH /auth/profil` — patron peut modifier lui-même nom/email/téléphone/boutique
- Réponse `creerAgent` incomplète (`_id`/`actif` manquants) → badge "inactif" jusqu'à reload côté frontend, corrigé
- **Agents : téléphone devient le SEUL identifiant** (plus d'email généré du tout). `User.email` optionnel pour role=agent (required uniquement patron), index unique passé en `sparse:true`. `server.js` synchronise automatiquement l'index au démarrage (`User.syncIndexes()`) — pas de script de migration manuel nécessaire. Rétrocompatible : agents créés avant ce changement gardent leur email et continuent de fonctionner.
- **Bug critique découvert** : `PATCH /api/agents/:id` (modification nom/tél/reset mdp d'un agent) tapait dans un système **totalement séparé et legacy** — l'ancien système d'agents à QR code (`agent.controller.js`/`agent.routes.js`, modèle `Agent` distinct de `User`, collection vide en prod). Ne trouvait jamais l'agent réel → 404 → "Erreur de modification" côté patron à chaque tentative. Nouvel endpoint `modifierAgentInfos` créé dans `boutique.controller.js` (le bon endroit, comme `creerAgent`/`toggleAgent`/`resetPasswordAgent`), route `PATCH /api/boutiques/agents/:agentId`. **Le système `agent.controller.js`/`agent.routes.js` legacy reste en place mais n'est plus appelé par le frontend actuel — vestige à nettoyer un jour si confirmé totalement mort.**
- `resetPasswordAgent` : `loginInfo` référençait encore `agent.email`, `undefined` pour un agent créé en téléphone-seul — corrigé.
- `abonnementsARelancer` : nouveau paramètre `?tous=1` pour lister tout le portefeuille de patrons (pas seulement ceux à relancer sous 3j).

## À vérifier / recaler

- L'`ARCHITECTURE.md` du repo **frontend** décrit une structure backend **partiellement obsolète** (ne mentionne pas `client.controller.js`/`panier.controller.js`/système de crédit, déjà en place).
- **Système `agent.controller.js`/`agent.routes.js` legacy (QR code)** : plus utilisé par le frontend actuel, collection `Agent` vide en prod. Candidat à suppression complète si confirmé mort — vérifier qu'aucun autre appelant ne l'utilise avant de le retirer (ne pas le faire sans confirmation explicite de l'utilisateur, risque de casser quelque chose d'invisible).

## Pièges connus — ne pas rouvrir sauf nouveau signal

- **PAT exposés dans les conversations à de très nombreuses reprises** — à révoquer et régénérer dès que possible.
- **Repo public sur GitHub** — voir section audit ci-dessus, garder en tête pour tout ce qui touche aux secrets/clés.
- Voir le repo frontend pour le point d'architecture "zoneless" (concerne le frontend, explique plusieurs bugs UI) et le piège de build Vercel (erreurs de typage TS invisibles sans vérification du build réel).

## Convention de travail (résumé — détail complet dans `.github/copilot-instructions.md`)

- `git pull --rebase` avant toute édition.
- `node -c fichier.js` après chaque édition (pas de build possible en sandbox).
- Commits en français, détaillés, cause racine expliquée.
- Tout changement infra (CORS, domaine, env vars) → vérifier aussi côté frontend.
- Messages de commit avec backticks : `git commit -F fichier.txt` plutôt que `-m "..."` en bash double-quotes.

## Comment mettre à jour ce fichier

En fin de session : déplacer les items résolus vers `CHANGELOG.md` (commit hash + cause racine), garder "Bugs ouverts"/"Backlog" à jour, mettre à jour la date en haut.

## Convention de travail (résumé — détail complet dans `.github/copilot-instructions.md`)

- `git pull --rebase` avant toute édition.
- `node -c fichier.js` après chaque édition (pas de build possible en sandbox).
- Commits en français, détaillés, cause racine expliquée.
- Tout changement infra (CORS, domaine, env vars) → vérifier aussi côté frontend.
- Messages de commit avec backticks : `git commit -F fichier.txt` plutôt que `-m "..."` en bash double-quotes.

## Comment mettre à jour ce fichier

En fin de session : déplacer les items résolus vers `CHANGELOG.md` (commit hash + cause racine), garder "Bugs ouverts"/"Backlog" à jour, mettre à jour la date en haut.
