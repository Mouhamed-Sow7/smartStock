const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const _resolved = new Map();

/**
 * Résout un secret depuis une variable d'environnement, avec une hiérarchie
 * de filets de sécurité si elle est absente :
 *
 *   1. process.env[envVarName] -- priorité absolue, Cloud comme Local.
 *   2. Mode Local (Windows) sans variable d'env -- secret PERSISTÉ dans
 *      %ProgramData%\SmartStock\secrets.json : généré une seule fois puis
 *      réutilisé à chaque redémarrage. Un redémarrage (coupure de courant,
 *      mise à jour) ne doit jamais invalider les sessions actives d'une
 *      boutique.
 *   3. Mode Cloud (ou tout ce qui n'est pas Windows) sans variable d'env --
 *      comportement historique inchangé : secret aléatoire EN MÉMOIRE
 *      UNIQUEMENT, régénéré à chaque démarrage, jamais persisté sur disque.
 *
 * Pourquoi (2) et (3) sont différents : sur Render, le filesystem est
 * éphémère et le process redémarre souvent (déploiements, mise en veille) --
 * persister un secret sur un disque qui disparaît n'aurait aucun sens, et le
 * comportement "aléatoire à chaque démarrage tant que la vraie variable
 * d'env manque" est un choix de sécurité déjà en place (voir plus bas) qu'on
 * ne modifie pas. En Local, c'est l'inverse : le disque survit aux
 * redémarrages et c'est justement pour ça qu'on peut y persister le secret
 * en sécurité.
 *
 * Détection Local vs Cloud : process.platform === 'win32'. Render (Cloud)
 * tourne toujours sur Linux ; SmartStock Local cible explicitement un PC
 * boutique Windows (c'est la raison d'être de %ProgramData%). Ce signal ne
 * couple donc PAS ce module au frontend ni à server.js -- aucun autre
 * fichier n'a besoin d'être modifié. Limite connue et assumée : une
 * hypothétique install Local sous Linux retomberait sur le comportement (3)
 * (éphémère) -- hors périmètre actuel, à étendre plus tard si besoin (ex:
 * un chemin XDG_CONFIG_HOME sur Linux).
 *
 * Pourquoi une valeur aléatoire en mémoire plutôt qu'une valeur fixe en cas
 * d'absence de variable d'env (comportement (3), historique) : ce repo est
 * PUBLIC sur GitHub. Une valeur par défaut fixe écrite dans le code (ex:
 * "smartstock-admin-2024") est lisible par n'importe qui sur Internet. Si
 * jamais la vraie variable d'environnement n'est pas configurée sur Render
 * (oubli, erreur de déploiement, nouvel environnement de staging...),
 * n'importe qui pourrait alors se connecter en tant qu'admin ou forger un
 * token JWT valide pour n'importe quel tenant, juste en lisant le code
 * source public. Avec un secret aléatoire généré à chaque démarrage :
 * l'accès admin/JWT reste bloqué pour tout le monde (le secret n'est connu
 * de personne, pas même de nous) plutôt que d'être ouvert à tout le monde.
 *
 * IMPORTANT : le résultat est mémoïsé (Map en haut de ce module, singleton
 * grâce au cache de require() de Node) pour que TOUS les fichiers qui
 * appellent resolveSecret("JWT_SECRET") reçoivent la MÊME valeur pendant la
 * durée de vie du process -- sinon un token signé via auth.controller.js et
 * vérifié via auth.middleware.js utiliseraient deux secrets différents, et
 * TOUTE authentification échouerait en permanence.
 */
function resolveSecret(envVarName) {
  const value = process.env[envVarName];
  if (value && value.trim().length > 0) return value;

  if (_resolved.has(envVarName)) return _resolved.get(envVarName);

  if (process.platform === 'win32') {
    const secret = resolveSecretLocalPersiste(envVarName);
    _resolved.set(envVarName, secret);
    return secret;
  }

  const fallback = crypto.randomBytes(32).toString('hex');
  _resolved.set(envVarName, fallback);
  console.error(
    `⚠️  ATTENTION SÉCURITÉ : la variable d'environnement ${envVarName} n'est pas configurée. ` +
    `Un secret temporaire aléatoire a été généré pour ce démarrage uniquement -- ` +
    `configure ${envVarName} sur Render dès que possible (Settings > Environment).`,
  );
  return fallback;
}

// --- Persistance Local (Windows) ---------------------------------------

function dossierSecretsLocal() {
  // %ProgramData% est défini nativement par Windows (ex: C:\ProgramData).
  // Chemin machine-wide (pas %APPDATA%, qui est par utilisateur Windows) --
  // le backend Express est une instance unique partagée par toute la
  // boutique, le secret doit suivre le service, pas le compte Windows qui
  // l'a démarré.
  const base = process.env.ProgramData || 'C:\\ProgramData';
  return path.join(base, 'SmartStock');
}

function cheminFichierSecrets() {
  return path.join(dossierSecretsLocal(), 'secrets.json');
}

// Arrêt volontaire et propre du process, avec un message clair -- jamais un
// stack trace brut. Utilisé uniquement pour des situations où continuer
// serait dangereux (fichier corrompu, permissions cassées) : dans ces
// cas-là, générer silencieusement un nouveau secret invaliderait toutes les
// sessions actives sans que personne ne comprenne pourquoi. On préfère
// bloquer le démarrage avec une explication actionnable.
function echecFatal(message) {
  console.error('\n❌ ERREUR FATALE -- secrets SmartStock Local\n' + message + '\n');
  process.exit(1);
}

function lireFichierSecretsLocal() {
  const chemin = cheminFichierSecrets();
  let contenu;
  try {
    contenu = fs.readFileSync(chemin, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null; // pas encore créé -- premier démarrage, cas normal
    echecFatal(
      `Impossible de lire ${chemin} (${err.code || err.message}).\n` +
      `Vérifiez que le compte qui exécute SmartStock a les droits de lecture sur ${dossierSecretsLocal()}.`,
    );
  }
  let data;
  try {
    data = JSON.parse(contenu);
  } catch (err) {
    echecFatal(
      `Le fichier ${chemin} existe mais n'est pas un JSON valide (corrompu ?).\n` +
      `Pour éviter d'invalider silencieusement toutes les sessions actives, le démarrage est arrêté.\n` +
      `Si vous êtes certain de vouloir régénérer de nouveaux secrets (cela déconnectera tout le monde), ` +
      `supprimez ou réparez ce fichier manuellement puis relancez SmartStock.`,
    );
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    echecFatal(
      `Le fichier ${chemin} ne contient pas l'objet JSON attendu (corrompu ?).\n` +
      `Démarrage arrêté par sécurité -- voir le message ci-dessus pour la marche à suivre.`,
    );
  }
  return data;
}

function ecrireFichierSecretsLocal(data) {
  const dossier = dossierSecretsLocal();
  const chemin = cheminFichierSecrets();
  try {
    fs.mkdirSync(dossier, { recursive: true });
    // Écriture atomique : fichier temporaire (nommé avec le PID pour éviter
    // toute collision entre deux process qui écriraient en même temps) puis
    // renommage. Le renommage est atomique sur un même volume -- un lecteur
    // concurrent, ou une coupure de courant en plein milieu de l'écriture,
    // ne peut jamais laisser secrets.json dans un état partiellement écrit :
    // soit l'ancien fichier complet est encore là, soit le nouveau l'est.
    const tmp = `${chemin}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, chemin);
  } catch (err) {
    echecFatal(
      `Impossible d'écrire ${chemin} (${err.code || err.message}).\n` +
      `Vérifiez que le compte qui exécute SmartStock a les droits d'écriture sur ${dossier}.`,
    );
  }
}

function resolveSecretLocalPersiste(envVarName) {
  const existant = lireFichierSecretsLocal() || {};
  if (existant[envVarName] && String(existant[envVarName]).trim().length > 0) {
    return existant[envVarName];
  }
  // Absent du fichier (premier démarrage, ou l'autre secret existe déjà
  // mais pas celui-ci) -- on le génère et on réécrit le fichier en
  // conservant les éventuels autres secrets déjà présents.
  const nouveauSecret = crypto.randomBytes(32).toString('hex');
  existant[envVarName] = nouveauSecret;
  ecrireFichierSecretsLocal(existant);
  console.log(
    `SmartStock Local : ${envVarName} généré et persisté dans ${cheminFichierSecrets()} ` +
    `(sera réutilisé aux prochains démarrages).`,
  );
  return nouveauSecret;
}

module.exports = { resolveSecret };
