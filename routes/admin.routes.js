const express = require('express');
const router = express.Router();
const { verifyAdminKey, listUsers, createPatron, toggleUser, resetPassword, deleteUser, editUser, getTeam, globalStats, purgeVentes, debugAgents, resetPasswordByEmail, relancesGlobales, abonnementsARelancer, renouvelerAbonnement } = require('../controllers/admin.controller');

router.use(verifyAdminKey);
router.get('/stats', globalStats);
router.get('/relances', relancesGlobales);
router.get('/abonnements', abonnementsARelancer);
router.patch('/users/:id/renouveler-abonnement', renouvelerAbonnement);
router.get('/users', listUsers);
router.get('/agents', debugAgents);              // debug: lister tous les agents
router.post('/users', createPatron);
router.patch('/users/:id', editUser);
router.patch('/users/:id/toggle', toggleUser);
router.patch('/users/:id/reset-password', resetPassword);
router.patch('/reset-by-email', resetPasswordByEmail);  // déblocage agent par email
router.delete('/users/:id', deleteUser);
router.get('/tenants/:tenantId/team', getTeam);
router.delete('/ventes', purgeVentes);
module.exports = router;
