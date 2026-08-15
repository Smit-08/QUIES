'use strict';

const admin   = require('firebase-admin');
const { AppError } = require('../services/errors');

// ─── Firebase Admin initialisation (once, at module load) ────────────────────
// All three values come from the service-account JSON you download from
// Firebase Console → Project Settings → Service Accounts → Generate new private key.
// Store them in .env — never in code or the repo.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Firebase stores the key with literal \n; Node needs real newlines
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

/**
 * authenticate — Express middleware that verifies the Firebase ID token in the
 * Authorization: Bearer <token> header.
 *
 * On success:  attaches req.user = { uid, email } and calls next().
 * On failure:  calls next(AppError('AUTH_INVALID_TOKEN')) → central error handler.
 *
 * Contract ref: §1 (Auth convention), §6 (AUTH_INVALID_TOKEN = 401).
 */
async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return next(new AppError('AUTH_INVALID_TOKEN', 'Authorization header missing or malformed'));
    }

    const idToken = authHeader.slice('Bearer '.length);
    const decoded = await admin.auth().verifyIdToken(idToken);

    // Attach the decoded claims so controllers can read uid/email without re-verifying
    req.user = {
      uid:   decoded.uid,
      email: decoded.email || null,
    };

    return next();
  } catch (err) {
    // Firebase throws for expired, revoked, or malformed tokens
    return next(new AppError('AUTH_INVALID_TOKEN', 'Firebase token is invalid or expired'));
  }
}

module.exports = authenticate;
