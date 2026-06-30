/**
 * Normalisation des numéros de téléphone sénégalais.
 *
 * Formats acceptés en entrée (avec espaces, tirets, indicatif, etc.) :
 *   "221 78 144 02 32" | "78 144 02 32" | "+221781440232" | "0781440232"
 *   "221781440232"     | "0781-44-02-32"
 *
 * Format de sortie normalisé (toujours le même, stocké en base) :
 *   "221781440232"  (indicatif + 9 chiffres locaux, sans espace ni +)
 *
 * Préfixes mobiles sénégalais valides : 70, 75, 76, 77, 78
 */

const PREFIXES_VALIDES = ['70', '75', '76', '77', '78'];

/**
 * Normalise un numéro de téléphone sénégalais vers un format unique.
 * Retourne null si le numéro ne correspond pas à un format sénégalais valide.
 */
function normaliserTelephone(input) {
  if (!input || typeof input !== 'string') return null;

  // Ne garder que les chiffres (retire espaces, tirets, points, parenthèses, +)
  let digits = input.replace(/\D/g, '');
  if (!digits) return null;

  // Retirer un éventuel "00" international devant le 221
  if (digits.startsWith('00221')) digits = digits.slice(2);

  // Retirer l'indicatif 221 s'il est présent
  if (digits.startsWith('221')) {
    digits = digits.slice(3);
  }

  // Retirer le 0 initial local (ex: 0781440232 -> 781440232)
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // À ce stade on doit avoir exactement 9 chiffres locaux
  if (digits.length !== 9) return null;

  const prefixe = digits.slice(0, 2);
  if (!PREFIXES_VALIDES.includes(prefixe)) return null;

  return `221${digits}`;
}

/**
 * Formate un numéro normalisé ("221781440232") pour affichage humain :
 * "+221 78 144 02 32"
 */
function formaterTelephoneAffichage(normalise) {
  if (!normalise || normalise.length !== 12) return normalise || '';
  const local = normalise.slice(3); // 9 chiffres
  return `+221 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5, 7)} ${local.slice(7, 9)}`;
}

module.exports = { normaliserTelephone, formaterTelephoneAffichage, PREFIXES_VALIDES };
