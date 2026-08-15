'use strict';

const prisma                = require('../services/prisma');
const { createJob }         = require('../services/jobService');
const { AppError }          = require('../services/errors');
const { runEvidenceJob }    = require('../jobs/evidenceJob');

const ALLOWED_TYPES = ['screenshot', 'scan_report', 'audio', 'document'];

async function resolveUser(uid) {
  const user = await prisma.user.findUnique({ where: { firebase_uid: uid } });
  if (!user) throw new AppError('NOT_FOUND', 'User record not found — call /api/auth/sync first');
  return user;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/evidence
 * Contract §4.4
 *
 * Accepts a multipart upload (file + type). Validates manually (multer body, not JSON).
 * Multer v2 is used — all MulterErrors (LIMIT_FILE_SIZE, MISSING_FIELD_NAME, etc.) are
 * intercepted in the route wrapper and converted to AppError(VALIDATION_ERROR) before
 * reaching this controller, so req.file is either a complete memoryStorage file or absent.
 * Creates an "evidence" job; the runner hashes the file, stores it in Supabase, and
 * writes the hash to the Sepolia evidence-ledger contract.
 */
async function submitEvidence(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);

    // Manual validation — validate middleware doesn't run on multipart bodies.
    // req.file is populated by multer v2 memoryStorage; MulterErrors are already
    // converted to AppError in the route wrapper before we get here.
    if (!req.file) {
      throw new AppError('VALIDATION_ERROR', 'Request body failed validation', {
        file: ['file is required'],
      });
    }

    // Safety guard: memoryStorage must always populate buffer. A missing buffer means
    // a storage engine misconfiguration — catch it early rather than crashing the job.
    if (!Buffer.isBuffer(req.file.buffer)) {
      throw new AppError('INTERNAL_ERROR', 'File buffer unavailable — check multer storage configuration');
    }

    const type = req.body?.type;
    if (!type || !ALLOWED_TYPES.includes(type)) {
      throw new AppError('VALIDATION_ERROR', 'Request body failed validation', {
        type: [`type must be one of: ${ALLOWED_TYPES.join(', ')}`],
      });
    }

    const job = await createJob(user.id, 'evidence', {
      filename:  req.file.originalname,
      mimetype:  req.file.mimetype,
      size:      req.file.size,
      type,
    });

    // Pass the file buffer to the runner — it hashes + uploads asynchronously
    setImmediate(() => runEvidenceJob(job.id, user.id, type, req.file.buffer));

    return res.status(202).json({
      success: true,
      data: { job_id: job.id, status: job.status },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/evidence
 * Contract §4.4 — paginated list of evidence items for the authenticated user.
 */
async function listEvidence(req, res, next) {
  try {
    const user  = await resolveUser(req.user.uid);
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip  = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.evidence.findMany({
        where:   { user_id: user.id },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.evidence.count({ where: { user_id: user.id } }),
    ]);

    const items = rows.map((e) => ({
      evidence_id:      e.id,
      type:             e.type,
      hash:             e.hash,
      blockchain_tx_id: e.blockchain_tx_id ?? null,
      created_at:       e.created_at,
    }));

    return res.status(200).json({
      success: true,
      data: { items, pagination: { page, limit, total } },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/evidence/:evidence_id
 * Contract §4.4 — single record; 404 if not owned.
 *
 * Note: file_url is a signed URL from Supabase Storage. The Supabase client
 * integration is a TODO for Part 2 (Supabase setup sprint). For now, file_url
 * returns null as a placeholder so the shape is correct.
 */
async function getEvidence(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);

    const evidence = await prisma.evidence.findUnique({
      where: { id: req.params.evidence_id },
    });

    // Same 404-for-both-cases rule as getJobOr404 — don't leak existence
    if (!evidence || evidence.user_id !== user.id) {
      throw new AppError('NOT_FOUND', 'Evidence not found');
    }

    // TODO (Part 2 — Supabase): generate a short-lived signed URL from evidence.file_ref
    const file_url = null;

    return res.status(200).json({
      success: true,
      data: {
        evidence_id:      evidence.id,
        type:             evidence.type,
        hash:             evidence.hash,
        blockchain_tx_id: evidence.blockchain_tx_id ?? null,
        file_url,
        created_at:       evidence.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { submitEvidence, listEvidence, getEvidence };
