#!/usr/bin/env node
'use strict';

/**
 * SmartStock Local -- Backup MongoDB automatique.
 *
 * Ce script est autonome : il peut être lancé manuellement
 * (`node scripts/local-backup.js`), par le Planificateur de tâches Windows
 * (Task Scheduler -- l'enregistrement de la tâche elle-même appartient au
 * futur installeur "SmartStock Local Setup.exe", PAS à ce commit), ou en
 * tâche de fond par server.js au démarrage (rattrapage si aucun backup
 * récent n'existe).
 *
 * Concerne UNIQUEMENT le mode Local Windows avec une instance MongoDB
 * locale. Sur Cloud/Render (toujours Linux) ou sur un poste Windows qui
 * pointerait vers un MongoDB distant (Atlas ou autre), ce script sort
 * proprement sans rien faire -- ce n'est jamais considéré comme une erreur.
 *
 * Détection du mode Local : `process.platform === "win32"` ET l'URI
 * MongoDB résolue (voir config/db.js -- source unique, pas de duplication
 * du fallback ici) pointe vers localhost/127.0.0.1. Volontairement PAS de
 * variable d'environnement dédiée (ex: SMARTSTOCK_MODE) -- cohérent avec la
 * décision d'architecture validée du 08/09/2026.
 *
 * Cycle : dump vers un fichier temporaire (.tmp.gz) -> vérification
 * (code de sortie 0 + fichier non vide) -> renommage atomique vers le nom
 * final -> rotation (garde les 7 plus récents) UNIQUEMENT si le nouveau
 * backup a réussi. Un lock fichier empêche deux dumps simultanés.
 *
 * Sécurité : mongodump est invoqué via child_process.spawnSync avec des
 * arguments séparés (jamais une chaîne shell construite) -- élimine tout
 * risque d'injection shell. L'URI MongoDB elle-même n'est JAMAIS écrite
 * dans un log ou un message d'erreur de ce script.
 *
 * Limite connue et assumée (documentée, pas corrigée silencieusement) :
 * si un jour une install Local ajoute des identifiants à MongoDB
 * (mongodb://user:pass@localhost/...), l'argument --uri passé à mongodump
 * resterait visible dans la liste des process de l'OS (Gestionnaire des
 * tâches / Process Explorer avec la colonne "ligne de commande") le temps
 * du dump -- limitation partagée par la quasi-totalité des outils CLI de
 * bases de données lorsqu'on leur passe des identifiants en argument, pas
 * quelque chose que ce script peut supprimer unilatéralement. Sans réel
 * mongodump disponible dans cet environnement pour le vérifier, on
 * n'implémente pas ici de mécanisme non testé (ex: fichier de config
 * `--config`) : la configuration actuelle par défaut n'a pas d'identifiants
 * MongoDB, donc ce risque est aujourd'hui inactif. À traiter avec un vrai
 * test si une install Local authentifiée voit le jour.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { resolveMongoUri } = require('../config/db');

const NOMBRE_BACKUPS_CONSERVES = 7;
const AGE_MAX_LOCK_MS = 2 * 60 * 60 * 1000; // 2h -- un dump boutique ne devrait jamais durer aussi longtemps
const REGEX_NOM_BACKUP = /^backup-\d{4}-\d{2}-\d{2}-\d{6}\.gz$/;

// --- Emplacement -----------------------------------------------------------

// %ProgramData% est machine-wide (cohérent avec secrets.json dans
// utils/secrets.js) -- volontairement un petit helper indépendant plutôt
// qu'un import partagé : la logique tient en une ligne, et ça évite de
// coupler ce script à secrets.js (qu'on ne modifie pas pour cette
// fonctionnalité, par contrainte explicite).
function dossierBackupsLocal() {
  const base = process.env.ProgramData || 'C:\\ProgramData';
  return path.join(base, 'SmartStock', 'backups');
}

function cheminLock() {
  return path.join(dossierBackupsLocal(), '.backup.lock');
}

// --- Détection du mode Local -----------------------------------------------

/**
 * Vrai uniquement si l'URI pointe vers une instance MongoDB locale
 * (localhost / 127.0.0.1 / [::1]), quel que soit le port ou la présence
 * d'identifiants. Rejette explicitement mongodb+srv:// (Atlas) et tout
 * hôte distant en mongodb://host-distant/... -- une détection naïve du
 * type "commence par mongodb://" traiterait à tort un Atlas legacy ou un
 * MongoDB distant comme local.
 */
function isLocalMongoUri(uri) {
  if (typeof uri !== 'string') return false;
  const valeur = uri.trim();
  const prefixe = 'mongodb://';
  if (valeur.slice(0, prefixe.length).toLowerCase() !== prefixe) return false; // exclut mongodb+srv:// et le reste

  const sansSchema = valeur.slice(prefixe.length);
  const apresIdentifiants = sansSchema.includes('@')
    ? sansSchema.slice(sansSchema.lastIndexOf('@') + 1)
    : sansSchema;

  const finHotes = apresIdentifiants.search(/[/?]/);
  const segmentHotes = finHotes === -1 ? apresIdentifiants : apresIdentifiants.slice(0, finHotes);
  if (!segmentHotes) return false;

  const hotes = segmentHotes.split(',').filter(Boolean);
  if (hotes.length === 0) return false;

  const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  return hotes.every((hoteAvecPort) => {
    let hote;
    if (hoteAvecPort.startsWith('[')) {
      const finCrochet = hoteAvecPort.indexOf(']');
      hote = finCrochet === -1 ? hoteAvecPort : hoteAvecPort.slice(0, finCrochet + 1);
    } else {
      const idxPort = hoteAvecPort.lastIndexOf(':');
      hote = idxPort === -1 ? hoteAvecPort : hoteAvecPort.slice(0, idxPort);
    }
    return HOTES_LOCAUX.has(hote.toLowerCase());
  });
}

function environnementLocalValide(platform, uri) {
  return platform === 'win32' && isLocalMongoUri(uri);
}

// --- mongodump ---------------------------------------------------------

function trouverMongodump() {
  const commande = process.platform === 'win32' ? 'where' : 'which';
  let resultat;
  try {
    resultat = spawnSync(commande, ['mongodump'], { encoding: 'utf8' });
  } catch (err) {
    return null;
  }
  if (resultat.status === 0 && resultat.stdout && resultat.stdout.trim()) {
    return resultat.stdout.trim().split(/\r?\n/)[0].trim();
  }
  return null;
}

// --- Horodatage --------------------------------------------------------

function horodatage(date) {
  const d = date || new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' + pad(d.getMonth() + 1) +
    '-' + pad(d.getDate()) +
    '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
  );
}

// --- Liste / rotation des backups --------------------------------------

function listerBackupsReussis() {
  const dossier = dossierBackupsLocal();
  let fichiers;
  try {
    fichiers = fs.readdirSync(dossier);
  } catch (err) {
    return [];
  }
  return fichiers
    .filter((nom) => REGEX_NOM_BACKUP.test(nom))
    .map((nom) => {
      const chemin = path.join(dossier, nom);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(chemin).mtimeMs;
      } catch (err) {
        /* fichier disparu entre le readdir et le stat -- ignoré, non bloquant */
      }
      return { nom, chemin, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function backupRecentExiste(ageMaxMs) {
  const backups = listerBackupsReussis();
  if (backups.length === 0) return false;
  return Date.now() - backups[0].mtimeMs <= ageMaxMs;
}

// Rotation appelée UNIQUEMENT après le succès confirmé d'un nouveau backup
// (voir executerBackup) -- jamais avant, pour ne jamais se retrouver sans
// aucun backup valide entre deux cycles si le nouveau échouait.
function effectuerRotation() {
  const backups = listerBackupsReussis();
  const aSupprimer = backups.slice(NOMBRE_BACKUPS_CONSERVES);
  for (const b of aSupprimer) {
    try {
      fs.unlinkSync(b.chemin);
    } catch (err) {
      console.error(
        `SmartStock Local Backup : rotation -- échec suppression de ${b.nom} ` +
        `(${err.code || err.message}), ignoré, retenté au prochain cycle.`,
      );
    }
  }
}

// --- Verrouillage --------------------------------------------------------

function lockEstObsolete(chemin) {
  let stat;
  try {
    stat = fs.statSync(chemin);
  } catch (err) {
    return false; // déjà supprimé entre-temps -- pas notre affaire ici
  }
  if (Date.now() - stat.mtimeMs > AGE_MAX_LOCK_MS) return true;

  try {
    const contenu = JSON.parse(fs.readFileSync(chemin, 'utf8'));
    if (contenu && contenu.pid) {
      try {
        process.kill(contenu.pid, 0); // ne tue rien -- teste juste l'existence du process
      } catch (err) {
        if (err.code === 'ESRCH') return true; // le process qui détenait le lock n'existe plus
      }
    }
  } catch (err) {
    /* fichier illisible/corrompu -- laissé tel quel, l'âge tranchera au prochain cycle */
  }
  return false;
}

// fs.openSync(chemin, 'wx') est atomique au niveau du système de fichiers :
// il échoue si le fichier existe déjà, ce qui élimine la fenêtre de
// concurrence (TOCTOU) qu'aurait un couple séparé "vérifier puis créer".
function acquireLock(dejaNettoye) {
  const dossier = dossierBackupsLocal();
  const chemin = cheminLock();
  try {
    fs.mkdirSync(dossier, { recursive: true });
  } catch (err) {
    return false;
  }
  try {
    const fd = fs.openSync(chemin, 'wx');
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, demarre: new Date().toISOString() }));
    fs.closeSync(fd);
    return true;
  } catch (err) {
    if (err.code !== 'EEXIST') return false;
    if (!dejaNettoye && lockEstObsolete(chemin)) {
      try {
        fs.unlinkSync(chemin);
      } catch (err2) {
        /* déjà nettoyé par un concurrent -- pas grave */
      }
      return acquireLock(true); // une seule retentative après nettoyage, jamais de boucle infinie
    }
    return false;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(cheminLock());
  } catch (err) {
    /* déjà absent -- pas grave */
  }
}

function nettoyerFichierTemporaire(cheminTmp) {
  try {
    if (fs.existsSync(cheminTmp)) fs.unlinkSync(cheminTmp);
  } catch (err) {
    console.error(`SmartStock Local Backup : échec nettoyage du fichier temporaire (${err.code || err.message}).`);
  }
}

// --- Exécution du backup ------------------------------------------------

/**
 * Retourne toujours un objet { execute, succes, fichier? } :
 *   - execute=false : ce démarrage n'a pas concerné le backup (hors mode
 *     Local, ou un autre backup était déjà en cours) -- PAS une erreur.
 *   - execute=true, succes=false : un backup a été tenté et a échoué.
 *   - execute=true, succes=true : backup réussi, `fichier` est son chemin.
 */
function executerBackup() {
  const platform = process.platform;
  const uri = resolveMongoUri();

  if (!environnementLocalValide(platform, uri)) {
    console.log(
      'SmartStock Local Backup : environnement non concerné ' +
      '(pas Windows + MongoDB local) -- aucun backup, ce n\'est pas une erreur.',
    );
    return { execute: false, succes: null };
  }

  const dossier = dossierBackupsLocal();
  try {
    fs.mkdirSync(dossier, { recursive: true });
  } catch (err) {
    console.error(
      `SmartStock Local Backup : impossible de créer ${dossier} ` +
      `(${err.code || err.message}) -- backup ignoré, anciens backups conservés.`,
    );
    return { execute: true, succes: false };
  }

  if (!acquireLock()) {
    console.log('SmartStock Local Backup : un autre backup est déjà en cours -- sortie propre, rien à faire.');
    return { execute: false, succes: null };
  }

  try {
    const mongodumpPath = trouverMongodump();
    if (!mongodumpPath) {
      console.error(
        'SmartStock Local Backup : mongodump introuvable dans le PATH -- backup ignoré. ' +
        'Installez MongoDB Database Tools (téléchargement séparé de MongoDB Community Server).',
      );
      return { execute: true, succes: false };
    }

    const ts = horodatage();
    const cheminTmp = path.join(dossier, `backup-${ts}.tmp.gz`);
    const cheminFinal = path.join(dossier, `backup-${ts}.gz`);

    console.log('SmartStock Local Backup : démarrage du dump...');
    let resultat;
    try {
      // Arguments séparés (jamais de chaîne shell construite) -- voir la
      // limite documentée en tête de fichier sur la visibilité de l'URI
      // dans la liste des process si des identifiants sont un jour ajoutés.
      resultat = spawnSync(mongodumpPath, ['--uri', uri, `--archive=${cheminTmp}`, '--gzip'], {
        windowsHide: true,
      });
    } catch (err) {
      console.error(`SmartStock Local Backup : échec du lancement de mongodump (${err.code || err.message}).`);
      nettoyerFichierTemporaire(cheminTmp);
      return { execute: true, succes: false };
    }

    if (resultat.error) {
      console.error(
        `SmartStock Local Backup : échec du lancement de mongodump ` +
        `(${resultat.error.code || resultat.error.message}).`,
      );
      nettoyerFichierTemporaire(cheminTmp);
      return { execute: true, succes: false };
    }

    if (resultat.status !== 0) {
      console.error(`SmartStock Local Backup : mongodump a échoué (code de sortie ${resultat.status}).`);
      nettoyerFichierTemporaire(cheminTmp);
      return { execute: true, succes: false };
    }

    let taille = 0;
    try {
      taille = fs.statSync(cheminTmp).size;
    } catch (err) {
      console.error('SmartStock Local Backup : fichier temporaire introuvable après mongodump -- échec.');
      return { execute: true, succes: false };
    }

    if (!(taille > 0)) {
      console.error('SmartStock Local Backup : archive vide après mongodump -- rejetée, considérée en échec.');
      nettoyerFichierTemporaire(cheminTmp);
      return { execute: true, succes: false };
    }

    try {
      fs.renameSync(cheminTmp, cheminFinal);
    } catch (err) {
      console.error(`SmartStock Local Backup : échec du renommage final (${err.code || err.message}).`);
      nettoyerFichierTemporaire(cheminTmp);
      return { execute: true, succes: false };
    }

    console.log(`SmartStock Local Backup : réussi -- ${path.basename(cheminFinal)} (${taille} octets).`);
    effectuerRotation();
    return { execute: true, succes: true, fichier: cheminFinal };
  } finally {
    releaseLock();
  }
}

module.exports = {
  isLocalMongoUri,
  environnementLocalValide,
  dossierBackupsLocal,
  cheminLock,
  listerBackupsReussis,
  backupRecentExiste,
  trouverMongodump,
  executerBackup,
  // Exposés pour les tests uniquement (verrouillage / rotation isolés) :
  acquireLock,
  releaseLock,
  effectuerRotation,
};

if (require.main === module) {
  const resultat = executerBackup();
  if (resultat.execute && resultat.succes === false) {
    process.exitCode = 1; // permet à Task Scheduler de détecter l'échec
  }
}
