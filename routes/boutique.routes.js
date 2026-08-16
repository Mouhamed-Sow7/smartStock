const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth.middleware');
const {
  listBoutiques, creerBoutique, modifierBoutique, supprimerBoutique,
  getAgentsBoutique, creerAgent,
  toggleAgent, resetPasswordAgent, modifierAgentInfos, supprimerAgent,
} = require('../controllers/boutique.controller');

// Toutes les routes sont protégées
router.use(auth);

// ── Routes agents (AVANT /:id pour éviter le conflit Express) ──
// Express matche dans l'ordre — /agents/:agentId doit être déclaré avant /:id
// sinon "agents" est capturé comme valeur de ":id"
router.patch('/agents/:agentId',                 modifierAgentInfos);
router.patch('/agents/:agentId/toggle',          toggleAgent);
router.patch('/agents/:agentId/reset-password',  resetPasswordAgent);
router.delete('/agents/:agentId',                supprimerAgent);

// ── Boutiques ──
router.get('/',      listBoutiques);
router.post('/',     creerBoutique);
router.patch('/:id', modifierBoutique);
router.delete('/:id',supprimerBoutique);

// ── Agents par boutique ──
router.get('/:id/agents',  getAgentsBoutique);
router.post('/:id/agents', creerAgent);

module.exports = router;
