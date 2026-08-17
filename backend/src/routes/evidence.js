'use strict';

const express      = require('express');
const multer       = require('multer');
const authenticate = require('../middleware/auth');
const evidenceCtrl = require('../controllers/evidenceController');
const { AppError } = require('../services/errors');

const router = express.Router();

// Multer config — store in memory so the job runner can hash and forward to Supabase Storage.
// Limit to 20 MB; the evidence job will reject unsupported MIME types at the runner layer.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/**
 * multerUpload — multer v2 compatible wrapper.
 *
 * Multer v2 properly propagates ALL errors (including busboy parse errors that
 * silently crashed servers in v1) through next(err). We intercept MulterError
 * here and convert it into our AppError(VALIDATION_ERROR) so the central error
 * handler always emits the API contract envelope {success,error{code,message,details}}.
 */
const MULTER_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE:    'File exceeds the 20 MB size limit',
  LIMIT_FILE_COUNT:   'Too many files uploaded',
  LIMIT_FIELD_COUNT:  'Too many form fields',
  LIMIT_FIELD_KEY:    'Field name too long',
  LIMIT_FIELD_VALUE:  'Field value too long',
  LIMIT_PART_COUNT:   'Too many multipart parts',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
  MISSING_FIELD_NAME: 'Multipart field is missing a name',
};

function multerUpload (req, res, next) {
  upload.single('file')(req, res, function (err) {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message = MULTER_ERROR_MESSAGES[err.code] ?? err.message;
      return next(new AppError('VALIDATION_ERROR', message, {
        file: [message],
      }));
    }

    // Unknown upload error — forward as-is; central handler returns 500
    return next(err);
  });
}

// ── POST /api/evidence ────────────────────────────────────────────────────────
// Contract §4.4 — multipart/form-data; fields: file (binary) + type (string).
// Body validation (type field) happens in the controller because multer parses the body,
// not express.json() — validate middleware only works on JSON bodies.
router.post('/', authenticate, multerUpload, evidenceCtrl.submitEvidence);

// ── GET /api/evidence ─────────────────────────────────────────────────────────
// Contract §4.4 — paginated list of the user's evidence items.
router.get('/', authenticate, evidenceCtrl.listEvidence);

// ── GET /api/evidence/:evidence_id ───────────────────────────────────────────
// Contract §4.4 — single evidence record; 404 if not found or not owned.
router.get('/:evidence_id', authenticate, evidenceCtrl.getEvidence);

module.exports = router;
