const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth.middleware');
const {
  listBoutiques, creerBoutique, modifierBoutique, supprimerBoutique,
  getAgentsBoutique, creerAgent,
  toggleAgent, resetPasswordAgent, supprimerAgent,
} = require('../controllers/boutique.controller');

// Toutes les routes sont protégées
router.use(auth);

// ── Boutiques ──
router.get('/',      listBoutiques);
router.post('/',     creerBoutique);
router.patch('/:id', modifierBoutique);
router.delete('/:id',supprimerBoutique);

// ── Agents par boutique ──
router.get('/:id/agents',  getAgentsBoutique);
router.post('/:id/agents', creerAgent);

// ── Actions agent (indépendant de la boutique) ──
router.patch('/agents/:agentId/toggle',          toggleAgent);
router.patch('/agents/:agentId/reset-password',  resetPasswordAgent);
router.delete('/agents/:agentId',                supprimerAgent);

module.exports = router;
