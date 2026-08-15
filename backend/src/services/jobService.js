'use strict';

const prisma         = require('./prisma');
const { AppError }   = require('./errors');

/**
 * createJob — inserts a new Job row in status "queued" and returns the full record.
 *
 * @param {string} userId   — the authenticated user's DB id (not firebase_uid)
 * @param {string} type     — "scan" | "chat" | "evidence" | "report"
 * @param {object} input    — original request payload for debugging/retries
 * @returns {Promise<import('@prisma/client').Job>}
 */
async function createJob(userId, type, input) {
  return prisma.job.create({
    data: {
      user_id: userId,
      type,
      status: 'queued',
      input,
    },
  });
}

/**
 * getJobOr404 — fetches a Job by id and verifies it belongs to userId.
 *
 * Returns 404 (JOB_NOT_FOUND) regardless of whether the job doesn't exist OR belongs
 * to another user — this prevents leaking job existence to other authenticated users.
 * Contract ref: §2 ("return 404, not 403, if job belongs to another user"), §6 (JOB_NOT_FOUND).
 *
 * @param {string} jobId    — UUID of the job
 * @param {string} userId   — the authenticated user's DB id
 * @returns {Promise<import('@prisma/client').Job>}
 * @throws {AppError} JOB_NOT_FOUND if job is missing or owned by a different user
 */
async function getJobOr404(jobId, userId) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });

  // Deliberately use the same error for "doesn't exist" and "wrong owner" —
  // giving different errors would let a caller enumerate valid job_ids.
  if (!job || job.user_id !== userId) {
    throw new AppError('JOB_NOT_FOUND', 'Job not found');
  }

  return job;
}

/**
 * updateJob — helper for job runners to persist status, result, and error fields.
 *
 * @param {string} jobId
 * @param {{ status: string, result?: object, error?: object, completed_at?: Date }} patch
 */
async function updateJob(jobId, patch) {
  return prisma.job.update({
    where: { id: jobId },
    data:  patch,
  });
}

module.exports = { createJob, getJobOr404, updateJob };
