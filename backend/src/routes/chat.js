'use strict';

const { z }        = require('zod');
const express      = require('express');
const authenticate = require('../middleware/auth');
const validate     = require('../middleware/validate');
const chatCtrl     = require('../controllers/chatController');

const router = express.Router();

// POST /api/chat
// Contract §4.3 — message required; conversation_id optional (backend generates one if omitted).
const chatSchema = z.object({
  message:         z.string().min(1, 'message must be a non-empty string'),
  conversation_id: z.string().uuid('conversation_id must be a UUID').optional(),
});

router.post('/', authenticate, validate(chatSchema), chatCtrl.submitChat);

module.exports = router;
