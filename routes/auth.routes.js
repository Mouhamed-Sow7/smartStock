const express = require('express');
const router = express.Router();
const { register, login, getProfile, createDemoUser } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.post('/demo', createDemoUser);
router.post('/create-demo-user', createDemoUser);
router.get('/me', authMiddleware, getProfile);

module.exports = router;
