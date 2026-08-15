'use strict';

const prisma              = require('../services/prisma');
const { getJobOr404 }     = require('../services/jobService');

/**
 * GET /api/jobs/:job_id
 * Contract §2
 *
 * Returns the job's current status. The result shape in the `result` field varies
 * by job type (scan / chat / evidence / report) — see contract §4 for each shape.
 *
 * Security: getJobOr404 returns 404 for both missing jobs AND jobs owned by another
 * user — never 403 — to avoid leaking job existence. See jobService.js for reasoning.
 */
async function getJob(req, res, next) {
  try {
    // Look up the authenticated user's DB record
    const dbUser = await prisma.user.findUnique({
      where: { firebase_uid: req.user.uid },
    });

    if (!dbUser) {
      // Token is valid but user has not called /auth/sync yet — treat as not found
      const { AppError } = require('../services/errors');
      return next(new AppError('NOT_FOUND', 'User record not found — call /api/auth/sync first'));
    }

    const job = await getJobOr404(req.params.job_id, dbUser.id);

    // Build the response shape defined in contract §2
    return res.status(200).json({
      success: true,
      data: {
        job_id:       job.id,
        type:         job.type,
        status:       job.status,
        created_at:   job.created_at,
        completed_at: job.completed_at ?? null,
        result:       job.result   ?? null,
        error:        job.error    ?? null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getJob };
