'use strict';

const prisma       = require('../services/prisma');
const { AppError } = require('../services/errors');

/**
 * POST /api/auth/sync
 * Contract §4.1
 *
 * Verifies the Firebase token (done upstream in authenticate middleware),
 * then upserts a User row keyed on firebase_uid.
 *
 * Response: { success: true, data: { user_id, email, created_at } }
 */
async function sync(req, res, next) {
  try {
    const { uid, email } = req.user; // set by authenticate middleware

    if (!uid) {
      // Shouldn't happen if authenticate ran correctly, but guard anyway
      return next(new AppError('AUTH_INVALID_TOKEN', 'Token missing uid claim'));
    }

    const user = await prisma.user.upsert({
      where:  { firebase_uid: uid },
      create: { firebase_uid: uid, email: email || '' },
      update: { email: email || '' },     // keep email in sync if user changes it in Firebase
    });

    return res.status(200).json({
      success: true,
      data: {
        user_id:    user.id,
        email:      user.email,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { sync };
