'use strict';

/**
 * Contract-compliant error codes (API Contract §6).
 * Keep these in sync with the contract — one place to update if codes ever change.
 */
const ErrorCodes = {
  AUTH_INVALID_TOKEN:      { httpStatus: 401, code: 'AUTH_INVALID_TOKEN' },
  AUTH_FORBIDDEN:          { httpStatus: 403, code: 'AUTH_FORBIDDEN' },
  VALIDATION_ERROR:        { httpStatus: 400, code: 'VALIDATION_ERROR' },
  NOT_FOUND:               { httpStatus: 404, code: 'NOT_FOUND' },
  JOB_NOT_FOUND:           { httpStatus: 404, code: 'JOB_NOT_FOUND' },
  AI_SERVICE_UNAVAILABLE:  { httpStatus: 502, code: 'AI_SERVICE_UNAVAILABLE' },
  AI_SERVICE_TIMEOUT:      { httpStatus: 504, code: 'AI_SERVICE_TIMEOUT' },
  BLOCKCHAIN_WRITE_FAILED: { httpStatus: 502, code: 'BLOCKCHAIN_WRITE_FAILED' },
  RATE_LIMITED:            { httpStatus: 429, code: 'RATE_LIMITED' },
  INTERNAL_ERROR:          { httpStatus: 500, code: 'INTERNAL_ERROR' },
};

/**
 * AppError — throw this from anywhere in the app to produce a structured
 * error envelope. The central error handler in app.js catches it.
 *
 * @param {string} codeKey   — key in ErrorCodes, e.g. 'NOT_FOUND'
 * @param {string} message   — human-readable string for the frontend
 * @param {object} [details] — optional field-level detail (VALIDATION_ERROR)
 */
class AppError extends Error {
  constructor(codeKey, message, details = {}) {
    super(message);
    const entry = ErrorCodes[codeKey];
    if (!entry) throw new Error(`Unknown error code key: ${codeKey}`);
    this.codeKey    = codeKey;
    this.httpStatus = entry.httpStatus;
    this.errorCode  = entry.code;
    this.details    = details;
    this.isAppError = true;
  }
}

module.exports = { ErrorCodes, AppError };
