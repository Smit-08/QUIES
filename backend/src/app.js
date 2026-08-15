'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');

// Route modules
const authRoutes     = require('./routes/auth');
const scanRoutes     = require('./routes/scan');
const jobRoutes      = require('./routes/jobs');
const evidenceRoutes = require('./routes/evidence');
const chatRoutes     = require('./routes/chat');
const reportRoutes   = require('./routes/report');

// Error helpers
const { AppError } = require('./services/errors');

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────

// JSON body parser — applies to all routes except /api/evidence (multipart handled by multer there)
app.use(express.json());

// CORS — the React Native Expo app needs this; adjust origins before production deploy
app.use(cors());

// ─── Health check (no auth required — used by docker-compose healthcheck) ────
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api',          scanRoutes);      // /api/scan, /api/risk-score, /api/history
app.use('/api/jobs',     jobRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/chat',     chatRoutes);
app.use('/api/report',   reportRoutes);

// ─── 404 catch-all (unknown routes) ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
  });
});

// ─── Central error handler (MUST be mounted last, with 4 params) ─────────────
// Catches: AppError throws, unexpected runtime errors, and anything next(err) forwards.
// Always emits the contract envelope {success:false, error:{code,message,details}}.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.isAppError) {
    // Structured application error — use its own status and code
    return res.status(err.httpStatus).json({
      success: false,
      error: {
        code:    err.errorCode,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Unexpected / unhandled error — log it server-side, never leak internals to the client
  console.error('[UnhandledError]', err);
  return res.status(500).json({
    success: false,
    error: {
      code:    'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: {},
    },
  });
});

module.exports = app;
