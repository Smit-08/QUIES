'use strict';

const express      = require('express');
const authenticate = require('../middleware/auth');
const authCtrl     = require('../controllers/authController');

const router = express.Router();

// POST /api/auth/sync
// Contract §4.1 — no request body; identity comes from the verified Firebase token.
router.post('/sync', authenticate, authCtrl.sync);

module.exports = router;
