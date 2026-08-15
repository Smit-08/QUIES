'use strict';

const prisma           = require('../services/prisma');
const { updateJob }    = require('../services/jobService');

/**
 * runReportJob — async job runner for POST /api/report.
 *
 * Orchestration flow (contract §2, §4.5, §5.4):
 *   1. Mark job "processing"
 *   2. Optionally fetch scan history for the user
 *   3. TODO (Part 2): Call POST /ai/report with evidence + scan_history → get report_text
 *   4. Mark job "complete" with { report_text, evidence_ids, generated_at }
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {import('@prisma/client').Evidence[]} evidence — already verified to belong to userId
 * @param {boolean} includeScanHistory
 */
async function runReportJob(jobId, userId, evidence, includeScanHistory) {
  try {
    await updateJob(jobId, { status: 'processing' });

    // ── Step 2: Fetch scan history if requested ───────────────────────────
    let scanHistory = [];
    if (includeScanHistory) {
      const scores = await prisma.riskScore.findMany({
        where:   { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: 10, // last 10 scans — enough context for a report
        select:  { score: true, created_at: true },
      });
      scanHistory = scores;
    }

    // ── Step 3: Call /ai/report ────────────────────────────────────────────
    // TODO (Part 2): wire the AI service call.
    // const aiRes = await axios.post(`${process.env.AI_SERVICE_URL}/ai/report`, {
    //   evidence:     evidence.map(e => ({ type: e.type, hash: e.hash, created_at: e.created_at })),
    //   scan_history: scanHistory,
    // }, { headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY } });
    // const { report_text } = aiRes.data;
    const report_text = '[AI report stub — wire /ai/report in Part 2]';

    const generatedAt = new Date();

    await updateJob(jobId, {
      status:       'complete',
      result:       {
        report_text,
        evidence_ids: evidence.map((e) => e.id),
        generated_at: generatedAt,
      },
      completed_at: generatedAt,
    });
  } catch (err) {
    console.error(`[reportJob] Job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error:  { code: 'AI_SERVICE_UNAVAILABLE', message: err.message },
    }).catch(() => {});
  }
}

module.exports = { runReportJob };
