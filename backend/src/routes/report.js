'use strict';

const { z }        = require('zod');
const express      = require('express');
const authenticate = require('../middleware/auth');
const validate     = require('../middleware/validate');
const reportCtrl   = require('../controllers/reportController');

const router = express.Router();

// POST /api/report
// Contract §4.5 — evidence_ids array required; include_scan_history optional boolean.
const reportSchema = z.object({
  evidence_ids:        z.array(z.string().uuid('each evidence_id must be a UUID')).min(1, 'at least one evidence_id is required'),
  include_scan_history: z.boolean().optional().default(false),
});

router.post('/', authenticate, validate(reportSchema), reportCtrl.submitReport);

module.exports = router;
