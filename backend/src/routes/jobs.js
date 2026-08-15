'use strict';

const express      = require('express');
const authenticate = require('../middleware/auth');
const jobCtrl      = require('../controllers/jobController');

const router = express.Router();

// GET /api/jobs/:job_id
// Contract §2 — poll for job status; returns 404 (not 403) if job doesn't exist or belongs to another user.
router.get('/:job_id', authenticate, jobCtrl.getJob);

module.exports = router;
