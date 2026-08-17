'use strict';

const prisma              = require('../services/prisma');
const { createJob }       = require('../services/jobService');
const { AppError }        = require('../services/errors');
const { runReportJob }    = require('../jobs/reportJob');

async function resolveUser(uid) {
  const user = await prisma.user.findUnique({ where: { firebase_uid: uid } });
  if (!user) throw new AppError('NOT_FOUND', 'User record not found — call /api/auth/sync first');
  return user;
}

/**
 * POST /api/report
 * Contract §4.5
 *
 * Verifies each evidence_id belongs to the requesting user, then creates a
 * "report" job and fires the runner asynchronously.
 */
async function submitReport(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);
    const { evidence_ids, include_scan_history } = req.body;

    // Verify every supplied evidence_id belongs to this user
    const evidence = await prisma.evidence.findMany({
      where: { id: { in: evidence_ids }, user_id: user.id },
    });

    if (evidence.length !== evidence_ids.length) {
      // Some ids either don't exist or belong to another user — 404, not 403, to avoid leaking
      throw new AppError('NOT_FOUND', 'One or more evidence records not found');
    }

    const job = await createJob(user.id, 'report', { evidence_ids, include_scan_history });

    setImmediate(() => runReportJob(job.id, user.id, evidence, include_scan_history));

    return res.status(202).json({
      success: true,
      data: { job_id: job.id, status: job.status },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { submitReport };
