'use strict';

const prisma               = require('../services/prisma');
const { updateJob }        = require('../services/jobService');

/**
 * runScanJob — async job runner for POST /api/scan.
 *
 * Orchestration flow (contract §2, §4.2, §5.1, §5.2):
 *   1. Mark job "processing"
 *   2. Upsert/create a Device row for this user
 *   3. TODO: Call POST /ai/scan-analysis → get flagged_apps
 *      ┌─ OWNERSHIP DECISION NEEDED (flag from Part 1) ──────────────────────────────┐
 *      │  The API contract (§5.1) treats /ai/scan-analysis as a Vedant-owned FastAPI │
 *      │  endpoint. The README/task says Smit owns the scanner + risk-score model.    │
 *      │  Resolve before Part 2: is this an HTTP call to http://ai-service:8000, or  │
 *      │  a direct Python interop call (e.g. python-shell)?                           │
 *      └─────────────────────────────────────────────────────────────────────────────┘
 *   4. TODO: Call POST /ai/risk-score → get score + factors
 *      (same ownership question as above)
 *   5. Persist the new RiskScore row
 *   6. Update Device.scan_results + last_scanned_at
 *   7. Mark job "complete" with combined result
 *
 * @param {string} jobId
 * @param {string} userId   — DB user id
 * @param {object} payload  — validated device_info from the request
 */
async function runScanJob(jobId, userId, payload) {
  try {
    await updateJob(jobId, { status: 'processing' });

    // ── Step 2: Upsert device row ──────────────────────────────────────────
    // Find the user's most recently scanned device, or create a new one.
    // NOTE: once Device supports a device fingerprint/identifier field (TBD with Rohan),
    //       change this to upsert on that field rather than findFirst.
    let device = await prisma.device.findFirst({ where: { user_id: userId } });
    if (!device) {
      device = await prisma.device.create({ data: { user_id: userId } });
    }

    // ── Step 3: Scan analysis ──────────────────────────────────────────────
    // TODO (Part 2): call AI service once ownership is confirmed.
    // Option A (HTTP — if Vedant exposes it via FastAPI):
    //   const aiRes = await axios.post(`${process.env.AI_SERVICE_URL}/ai/scan-analysis`, {
    //     device_info: payload.device_info,
    //   }, { headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY } });
    //   const { flagged_apps } = aiRes.data;
    //
    // Option B (direct — if Smit's model runs in-process or via child_process):
    //   const { flagged_apps } = await runLocalScanModel(payload.device_info);
    const flagged_apps = []; // placeholder until ownership resolved

    // ── Step 4: Risk score ─────────────────────────────────────────────────
    // TODO (Part 2): call AI service once ownership is confirmed.
    // Option A (HTTP — Vedant's /ai/risk-score):
    //   const scoreRes = await axios.post(`${process.env.AI_SERVICE_URL}/ai/risk-score`, {
    //     scan_result: { flagged_apps },
    //     breach_check: { breached: false, breach_count: 0 }, // TODO: integrate HaveIBeenPwned
    //   }, { headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY } });
    //   const { score, factors } = scoreRes.data;
    //
    // Option B (direct — Smit's sklearn model):
    //   const { score, factors } = await runLocalRiskScoreModel({ flagged_apps });
    const score   = 0;   // placeholder
    const factors = {};  // placeholder

    // ── Step 5: Persist risk score ─────────────────────────────────────────
    await prisma.riskScore.create({
      data: { user_id: userId, score, factors },
    });

    // ── Step 6: Update device ──────────────────────────────────────────────
    await prisma.device.update({
      where: { id: device.id },
      data:  {
        scan_results:    { flagged_apps },
        last_scanned_at: new Date(),
      },
    });

    // ── Step 7: Mark job complete ──────────────────────────────────────────
    const result = {
      scan:       { flagged_apps, device_id: device.id },
      risk_score: { score, factors },
    };

    await updateJob(jobId, {
      status:       'complete',
      result,
      completed_at: new Date(),
    });
  } catch (err) {
    console.error(`[scanJob] Job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error:  { code: 'INTERNAL_ERROR', message: err.message },
    }).catch(() => {}); // don't throw from error handler
  }
}

module.exports = { runScanJob };
