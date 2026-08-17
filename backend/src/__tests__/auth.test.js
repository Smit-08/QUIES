'use strict';

const request = require('supertest');

// ─── Mock firebase-admin BEFORE requiring app ────────────────────────────────
// We replace verifyIdToken so tests never hit real Firebase.
const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => {
  const fakeApp = {};
  return {
    apps: [fakeApp], // non-empty → skip initializeApp in auth.js
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    auth: () => ({ verifyIdToken: mockVerifyIdToken }),
  };
});

// ─── Mock Prisma client ──────────────────────────────────────────────────────
const mockUpsert = jest.fn();

jest.mock('../services/prisma', () => ({
  user: { upsert: mockUpsert },
}));

// ─── Now require the Express app (mocks are in place) ────────────────────────
const app = require('../app');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SYNC_URL = '/api/auth/sync';
const VALID_UID = 'firebase-uid-123';
const VALID_EMAIL = 'test@example.com';
const FAKE_USER_ID = 'uuid-user-001';
const FAKE_CREATED_AT = new Date('2026-01-15T10:00:00Z');

function validDecodedToken(overrides = {}) {
  return { uid: VALID_UID, email: VALID_EMAIL, ...overrides };
}

function fakeUserRow(overrides = {}) {
  return {
    id: FAKE_USER_ID,
    firebase_uid: VALID_UID,
    email: VALID_EMAIL,
    created_at: FAKE_CREATED_AT,
    ...overrides,
  };
}

// ─── Test suites ─────────────────────────────────────────────────────────────

describe('POST /api/auth/sync — authenticate middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1) Missing Authorization header → 401
  it('returns 401 AUTH_INVALID_TOKEN when Authorization header is missing', async () => {
    const res = await request(app).post(SYNC_URL);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: 'AUTH_INVALID_TOKEN',
        message: expect.any(String),
        details: expect.any(Object),
      },
    });
  });

  // 2) Malformed header (no "Bearer " prefix) → 401
  it('returns 401 AUTH_INVALID_TOKEN when header has no Bearer prefix', async () => {
    const res = await request(app)
      .post(SYNC_URL)
      .set('Authorization', 'Token some-random-string');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });

  // 3) Invalid / expired token → 401 (verifyIdToken throws)
  it('returns 401 AUTH_INVALID_TOKEN when Firebase rejects the token', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Token expired'));

    const res = await request(app)
      .post(SYNC_URL)
      .set('Authorization', 'Bearer expired-token');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('AUTH_INVALID_TOKEN');
  });
});

describe('POST /api/auth/sync — authController.sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 4) Valid token → 200, response envelope matches contract §4.1
  it('returns 200 with {success, data: {user_id, email, created_at}} on valid token', async () => {
    mockVerifyIdToken.mockResolvedValueOnce(validDecodedToken());
    mockUpsert.mockResolvedValueOnce(fakeUserRow());

    const res = await request(app)
      .post(SYNC_URL)
      .set('Authorization', 'Bearer valid-firebase-token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: {
        user_id: FAKE_USER_ID,
        email: VALID_EMAIL,
        created_at: FAKE_CREATED_AT.toISOString(),
      },
    });

    // Verify Prisma upsert was called correctly
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { firebase_uid: VALID_UID },
      create: { firebase_uid: VALID_UID, email: VALID_EMAIL },
      update: { email: VALID_EMAIL },
    });
  });

  // 5) Calling /api/auth/sync twice with the same uid upserts (no duplicate user)
  it('upserts — second call with same uid returns the same user_id', async () => {
    const userRow = fakeUserRow();

    // First call
    mockVerifyIdToken.mockResolvedValueOnce(validDecodedToken());
    mockUpsert.mockResolvedValueOnce(userRow);

    const res1 = await request(app)
      .post(SYNC_URL)
      .set('Authorization', 'Bearer valid-token-1');

    // Second call (same uid)
    mockVerifyIdToken.mockResolvedValueOnce(validDecodedToken());
    mockUpsert.mockResolvedValueOnce(userRow);

    const res2 = await request(app)
      .post(SYNC_URL)
      .set('Authorization', 'Bearer valid-token-2');

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.data.user_id).toBe(res2.body.data.user_id);

    // Both calls used upsert (not create), confirming no duplicate
    expect(mockUpsert).toHaveBeenCalledTimes(2);
    for (const call of mockUpsert.mock.calls) {
      expect(call[0].where).toEqual({ firebase_uid: VALID_UID });
    }
  });
});
