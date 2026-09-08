'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { getReseauLocal } = require('../controllers/reseau.controller');

router.use(authMiddleware);

router.get('/reseau-local', getReseauLocal);

module.exports = router;
