'use strict';

const prisma              = require('../services/prisma');
const { createJob }       = require('../services/jobService');
const { AppError }        = require('../services/errors');
const { runScanJob }      = require('../jobs/scanJob');

/**
 * Resolves a firebase_uid to the DB User record.
 * Throws NOT_FOUND if the user has never called /auth/sync.
 */
async function resolveUser(uid) {
  const user = await prisma.user.findUnique({ where: { firebase_uid: uid } });
  if (!user) throw new AppError('NOT_FOUND', 'User record not found — call /api/auth/sync first');
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/scan
 * Contract §4.2
 *
 * Creates a "scan" job, kicks it off asynchronously, returns 202 + job_id.
 * The app then polls GET /api/jobs/:job_id to get the result.
 */
async function submitScan(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);
    const job  = await createJob(user.id, 'scan', req.body);

    // Fire the job runner without awaiting — the response must return immediately (202)
    // The runner updates the job row to "processing" → "complete" | "failed"
    setImmediate(() => runScanJob(job.id, user.id, req.body));

    return res.status(202).json({
      success: true,
      data: { job_id: job.id, status: job.status },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/risk-score
 * Contract §4.2
 *
 * Returns the most recent risk_score row for the authenticated user.
 * Returns 404 (NOT_FOUND) if no score exists yet.
 */
async function getLatestRiskScore(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);

    const score = await prisma.riskScore.findFirst({
      where:   { user_id: user.id },
      orderBy: { created_at: 'desc' },
    });

    if (!score) {
      throw new AppError('NOT_FOUND', 'No risk score found — run a scan first');
    }

    return res.status(200).json({
      success: true,
      data: {
        score:      score.score,
        factors:    score.factors,
        created_at: score.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/history
 * Contract §4.2
 *
 * Returns paginated scan history (completed scan jobs) newest first.
 * Query params: ?page=1&limit=20 (defaults applied, limit capped at 100).
 */
async function getHistory(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);

    // Parse + validate pagination params
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where:   { user_id: user.id, type: 'scan' },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.job.count({ where: { user_id: user.id, type: 'scan' } }),
    ]);

    const items = jobs.map((job) => ({
      type:       job.type,
      job_id:     job.id,
      created_at: job.created_at,
      // Summarise from the result blob if present, otherwise null
      summary: job.result
        ? {
            score:         job.result.risk_score?.score ?? null,
            flagged_count: job.result.scan?.flagged_apps?.length ?? 0,
          }
        : null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        items,
        pagination: { page, limit, total },
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { submitScan, getLatestRiskScore, getHistory };
