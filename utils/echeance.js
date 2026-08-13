// Calcul de jours restants avant une échéance, utilisé pour deux besoins
// distincts qui partagent la même logique : les clients à crédit des
// boutiques (models/client.model.js) et l'abonnement SaaS des patrons
// (models/user.model.js). Toujours calculé à la volée (rien stocké) : pas
// de cron nécessaire, fiable même si le serveur Render s'est mis en veille
// entre deux requêtes.
const SEUIL_ALERTE_JOURS = 3;

function calculerJoursRestants(date) {
  const msParJour = 24 * 60 * 60 * 1000;
  return Math.ceil((new Date(date).getTime() - Date.now()) / msParJour);
}

function statutEcheance(joursRestants) {
  return joursRestants < 0 ? 'en_retard' : 'a_venir';
}

module.exports = { SEUIL_ALERTE_JOURS, calculerJoursRestants, statutEcheance };
