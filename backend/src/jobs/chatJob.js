'use strict';

const prisma           = require('../services/prisma');
const { updateJob }    = require('../services/jobService');

/**
 * runChatJob — async job runner for POST /api/chat.
 *
 * Orchestration flow (contract §2, §4.3, §5.3):
 *   1. Mark job "processing"
 *   2. Call POST /ai/assistant with conversation_history → get reply
 *   3. Persist the assistant reply as a ChatMessage
 *   4. Mark job "complete" with { reply, conversation_id }
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {string} conversationId
 * @param {{ role: string, content: string }[]} history — full conversation so far (includes user turn just persisted)
 */
async function runChatJob(jobId, userId, conversationId, history) {
  try {
    await updateJob(jobId, { status: 'processing' });

    // ── Call /ai/assistant ─────────────────────────────────────────────────
    // TODO (Part 2): wire this up once the AI service is deployed.
    // const aiRes = await axios.post(`${process.env.AI_SERVICE_URL}/ai/assistant`, {
    //   message:              history[history.length - 1].content,
    //   conversation_history: history.slice(0, -1), // everything before the latest user turn
    // }, { headers: { 'X-Internal-Key': process.env.INTERNAL_API_KEY } });
    // const reply = aiRes.data.reply;
    const reply = '[AI assistant stub — wire /ai/assistant in Part 2]';

    // ── Persist the assistant reply ────────────────────────────────────────
    await prisma.chatMessage.create({
      data: {
        conversation_id: conversationId,
        user_id:         userId,
        role:            'assistant',
        content:         reply,
      },
    });

    await updateJob(jobId, {
      status:       'complete',
      result:       { reply, conversation_id: conversationId },
      completed_at: new Date(),
    });
  } catch (err) {
    console.error(`[chatJob] Job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: 'failed',
      error:  { code: 'AI_SERVICE_UNAVAILABLE', message: err.message },
    }).catch(() => {});
  }
}

module.exports = { runChatJob };
