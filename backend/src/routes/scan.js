'use strict';

const { z }        = require('zod');
const express      = require('express');
const authenticate = require('../middleware/auth');
const validate     = require('../middleware/validate');
const scanCtrl     = require('../controllers/scanController');

const router = express.Router();

// ── POST /api/scan ────────────────────────────────────────────────────────────
// Contract §4.2 — accepts device_info, returns 202 + job_id.
const scanSchema = z.object({
  device_info: z.object({
    platform:             z.enum(['android', 'ios']),
    os_version:           z.string().min(1),
    installed_apps:       z.array(
      z.object({
        package_name: z.string().min(1),
        permissions:  z.array(z.string()).default([]),
      }),
    ).default([]),
    background_processes: z.array(z.string()).default([]),
  }),
});

router.post('/scan', authenticate, validate(scanSchema), scanCtrl.submitScan);

// ── GET /api/risk-score ───────────────────────────────────────────────────────
// Contract §4.2 — returns most recent risk score for the authenticated user.
router.get('/risk-score', authenticate, scanCtrl.getLatestRiskScore);

// ── GET /api/history ──────────────────────────────────────────────────────────
// Contract §4.2 — paginated list of past scans and risk scores, newest first.
router.get('/history', authenticate, scanCtrl.getHistory);

module.exports = router;
