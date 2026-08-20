const crypto = require('crypto');

const _resolved = new Map();

/**
 * Résout un secret depuis une variable d'environnement, avec filet de
 * sécurité si elle est absente : au lieu de retomber sur une valeur fixe
 * écrite en clair dans le code source (comme c'était le cas avant pour
 * JWT_SECRET et ADMIN_SECRET_KEY), on génère un secret aléatoire UNIQUE À
 * CE DÉMARRAGE DU SERVEUR.
 *
 * Pourquoi c'est important : ce repo est PUBLIC sur GitHub. Une valeur par
 * défaut fixe écrite dans le code (ex: "smartstock-admin-2024") est lisible
 * par n'importe qui sur Internet. Si jamais la vraie variable d'environnement
 * n'est pas configurée sur Render (oubli, erreur de déploiement, nouvel
 * environnement de staging...), n'importe qui pourrait alors se connecter
 * en tant qu'admin ou forger un token JWT valide pour n'importe quel
 * tenant, juste en lisant le code source public.
 *
 * Avec un secret aléatoire généré à chaque démarrage : si la variable
 * d'env manque, l'accès admin/JWT reste bloqué pour tout le monde (le
 * secret n'est connu de personne, pas même de nous) plutôt que d'être
 * ouvert à tout le monde. Effet de bord acceptable : tous les tokens JWT
 * émis avant un redémarrage deviennent invalides si la variable manquait
 * déjà avant (comportement identique à un vrai secret qui changerait --
 * pas pire que la situation actuelle, largement préférable à une faille
 * ouverte).
 *
 * IMPORTANT : le fallback est mémoïsé (Map en haut de ce module, qui est
 * un singleton grâce au cache de require() de Node) pour que TOUS les
 * fichiers qui appellent resolveSecret("JWT_SECRET") reçoivent la MÊME
 * valeur aléatoire pendant la durée de vie du process -- sinon un token
 * signé via auth.controller.js et vérifié via auth.middleware.js
 * utiliseraient deux secrets aléatoires différents, et TOUTE
 * authentification échouerait en permanence (pas juste en cas de secret
 * manquant).
 *
 * Le warning ci-dessous s'affiche dans les logs Render à chaque démarrage
 * tant que la variable n'est pas configurée -- à surveiller après
 * déploiement.
 */
function resolveSecret(envVarName) {
  const value = process.env[envVarName];
  if (value && value.trim().length > 0) return value;

  if (_resolved.has(envVarName)) return _resolved.get(envVarName);

  const fallback = crypto.randomBytes(32).toString('hex');
  _resolved.set(envVarName, fallback);
  console.error(
    `⚠️  ATTENTION SÉCURITÉ : la variable d'environnement ${envVarName} n'est pas configurée. ` +
    `Un secret temporaire aléatoire a été généré pour ce démarrage uniquement -- ` +
    `configure ${envVarName} sur Render dès que possible (Settings > Environment).`,
  );
  return fallback;
}

module.exports = { resolveSecret };
