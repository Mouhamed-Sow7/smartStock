/**
 * Génère un mot de passe aléatoire fort mais lisible/transcriptible à la main.
 * Évite les caractères ambigus (0/O, 1/l/I) pour faciliter la transcription
 * papier par un patron qui communique le mot de passe à son agent.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function genererMotDePasse(longueur = 9) {
  const bytes = require('crypto').randomBytes(longueur);
  let mdp = '';
  for (let i = 0; i < longueur; i++) {
    mdp += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return mdp;
}

module.exports = { genererMotDePasse };
