const express = require('express');
const router = express.Router();
const { verifyAdminKey, listUsers, createPatron, toggleUser, resetPassword, deleteUser, editUser, getTeam, globalStats, purgeVentes } = require('../controllers/admin.controller');

router.use(verifyAdminKey);
router.get('/stats', globalStats);
router.get('/users', listUsers);
router.post('/users', createPatron);
router.patch('/users/:id', editUser);
router.patch('/users/:id/toggle', toggleUser);
router.patch('/users/:id/reset-password', resetPassword);
router.delete('/users/:id', deleteUser);
router.get('/tenants/:tenantId/team', getTeam);
router.delete('/ventes', purgeVentes);
module.exports = router;
