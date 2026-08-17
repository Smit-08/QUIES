'use strict';

const { randomUUID }    = require('crypto');
const prisma            = require('../services/prisma');
const { createJob }     = require('../services/jobService');
const { AppError }      = require('../services/errors');
const { runChatJob }    = require('../jobs/chatJob');

async function resolveUser(uid) {
  const user = await prisma.user.findUnique({ where: { firebase_uid: uid } });
  if (!user) throw new AppError('NOT_FOUND', 'User record not found — call /api/auth/sync first');
  return user;
}

/**
 * POST /api/chat
 * Contract §4.3
 *
 * Persists the user's message turn, retrieves conversation history for the AI service,
 * creates a "chat" job, fires the runner asynchronously, returns 202.
 * conversation_id is generated if not provided (new conversation).
 */
async function submitChat(req, res, next) {
  try {
    const user = await resolveUser(req.user.uid);

    const { message } = req.body;
    const conversationId = req.body.conversation_id || randomUUID();

    // Persist the user's message to build conversation history for the AI service
    await prisma.chatMessage.create({
      data: {
        conversation_id: conversationId,
        user_id:         user.id,
        role:            'user',
        content:         message,
      },
    });

    // Retrieve all prior turns in this conversation (oldest first) for the AI prompt
    const history = await prisma.chatMessage.findMany({
      where:   { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
      select:  { role: true, content: true },
    });

    const job = await createJob(user.id, 'chat', {
      message,
      conversation_id: conversationId,
    });

    // Runner calls /ai/assistant with history, persists the reply, updates the job
    setImmediate(() => runChatJob(job.id, user.id, conversationId, history));

    return res.status(202).json({
      success: true,
      data: {
        job_id:          job.id,
        conversation_id: conversationId,
        status:          job.status,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { submitChat };
