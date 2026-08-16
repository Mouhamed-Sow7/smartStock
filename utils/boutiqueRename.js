const crypto = require('crypto');
const User = require('../models/user.model');
const Boutique = require('../models/boutique.model');

// Même logique de slugification que register()/creerAgent() (boutique.controller.js
// et auth.controller.js) — dupliquée volontairement ici plutôt qu'importée pour
// éviter un couplage circulaire entre controllers ; à garder en synchro si l'un
// des deux change.
function slugifier(nom) {
  return nom.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 20);
}

/**
 * Cascade un renommage de boutique à tout ce qui en dépend :
 *  1. User.boutique (label affiché) sur TOUS les comptes du tenant (patron + agents)
 *     — dénormalisé sur chaque compte à sa création, sinon reste périmé partout
 *     sauf sur le compte édité directement (bug corrigé le 2026-08-15).
 *  2. Boutique.nom + Boutique.slug — UNIQUEMENT si le tenant a exactement une
 *     seule boutique (cas standard mono-boutique). En multi-boutique, on ne
 *     sait pas laquelle des N boutiques du tenant l'utilisateur veut renommer
 *     avec un simple champ "nom de boutique" sur le patron -> on ne touche à
 *     rien côté Boutique/slug/emails dans ce cas, pour éviter de corrompre un
 *     setup multi-enseignes. Le champ User.boutique (point 1) reste mis à jour
 *     dans tous les cas, c'est le comportement qui existait déjà avant cette
 *     fonction.
 *  3. Emails des agents : générés à la création sous la forme
 *     prenom.nom@{ancien-slug}.sm (boutique.controller.js creerAgent). Si le
 *     slug change (point 2), on relocalise chaque email agent vers le nouveau
 *     domaine en gardant la partie locale (prenom.nom) identique, avec le même
 *     garde-fou anti-collision qu'à la création (suffixe aléatoire si le nouvel
 *     email existe déjà, cas extrêmement improbable mais géré par prudence).
 *
 * @param {string} tenantId
 * @param {string} nouveauNom
 * @param {string} excludeUserId  Id du User déjà mis à jour par l'appelant
 *                                (évite un double-write inutile, pas bloquant
 *                                si omis).
 * @returns {Promise<{boutiqueEtSlugMisAJour: boolean, emailsChanges: Array<{agentId:string, ancienEmail:string, nouvelEmail:string}>}>}
 */
async function cascaderRenommageBoutique(tenantId, nouveauNom, excludeUserId = null) {
  // 1. Label affiché, sur tous les comptes du tenant
  const filtreUsers = excludeUserId
    ? { tenantId, _id: { $ne: excludeUserId } }
    : { tenantId };
  await User.updateMany(filtreUsers, { $set: { boutique: nouveauNom } });

  // 2. Boutique.nom + slug — seulement si mono-boutique
  const boutiques = await Boutique.find({ tenantId });
  const emailsChanges = [];
  let boutiqueEtSlugMisAJour = false;

  if (boutiques.length === 1) {
    const boutique = boutiques[0];
    const ancienSlug = boutique.slug;
    let nouveauSlug = slugifier(nouveauNom);

    if (nouveauSlug && nouveauSlug !== ancienSlug) {
      const slugExist = await Boutique.findOne({ slug: nouveauSlug, _id: { $ne: boutique._id } });
      if (slugExist) {
        nouveauSlug = `${nouveauSlug}-${crypto.randomBytes(2).toString('hex')}`;
      }

      boutique.nom = nouveauNom;
      boutique.slug = nouveauSlug;
      await boutique.save();
      boutiqueEtSlugMisAJour = true;

      // 3. Relocaliser les emails des agents de cette boutique
      const agents = await User.find({ tenantId, role: 'agent', boutiqueId: boutique._id });
      for (const agent of agents) {
        const [partieLocale] = (agent.email || '').split('@');
        if (!partieLocale) continue; // email déjà anormal, ne pas y toucher en aveugle
        let nouvelEmail = `${partieLocale}@${nouveauSlug}.sm`;
        const collision = await User.findOne({ email: nouvelEmail, _id: { $ne: agent._id } });
        if (collision) {
          const rand = crypto.randomBytes(2).toString('hex');
          nouvelEmail = `${partieLocale}.${rand}@${nouveauSlug}.sm`;
        }
        const ancienEmail = agent.email;
        agent.email = nouvelEmail;
        await agent.save();
        emailsChanges.push({ agentId: String(agent._id), ancienEmail, nouvelEmail });
      }
    } else if (nouveauNom !== boutique.nom) {
      // Nom changé mais slug identique (ex: juste la casse/accents) -> on
      // met quand même à jour le nom affiché, pas d'impact email.
      boutique.nom = nouveauNom;
      await boutique.save();
      boutiqueEtSlugMisAJour = true;
    }
  }

  return { boutiqueEtSlugMisAJour, emailsChanges };
}

module.exports = { cascaderRenommageBoutique, slugifier };
