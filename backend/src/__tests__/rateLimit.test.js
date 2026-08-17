'use strict';

const request = require('supertest');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { AppError } = require('../services/errors');

describe('Rate Limiting & 429 Error Envelope', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Configure a tight limiter for test purposes (max 2 requests per window)
    const testLimiter = rateLimit({
      windowMs: 60 * 1000,
      limit: 2,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, _res, next) => {
        next(new AppError('RATE_LIMITED', 'Too many requests, please try again later.'));
      },
    });

    app.use(testLimiter);

    app.get('/test', (_req, res) => {
      res.json({ success: true, data: { status: 'ok' } });
    });

    // Mount contract-compliant central error handler
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
      if (err.isAppError) {
        return res.status(err.httpStatus).json({
          success: false,
          error: {
            code: err.errorCode,
            message: err.message,
            details: err.details,
          },
        });
      }
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: {} },
      });
    });
  });

  it('allows requests within the configured limit', async () => {
    const res1 = await request(app).get('/test');
    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);

    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
  });

  it('returns 429 with RATE_LIMITED error code and contract envelope when limit is exceeded', async () => {
    // Consume allowed requests
    await request(app).get('/test');
    await request(app).get('/test');

    // Exceed limit
    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later.',
        details: {},
      },
    });
  });
});
