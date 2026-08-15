'use strict';

const crypto           = require('crypto');
const prisma           = require('../services/prisma');
const { updateJob }    = require('../services/jobService');

/**
 * runEvidenceJob — async job runner for POST /api/evidence.
 *
 * Orchestration flow (contract §2, §4.4):
 *   1. Mark job "processing"
 *   2. SHA-256 hash the file buffer
 *   3. TODO (Part 2): Upload file to Supabase Storage → get file_ref
 *   4. Persist Evidence row (file_ref placeholder for now, hash populated)
 *   5. TODO (Part 2 — Vedant): Write hash to Sepolia evidence-ledger contract → get blockchain_tx_id
 *   6. Update Evidence row with blockchain_tx_id (or leave null and retry later per §6 BLOCKCHAIN_WRITE_FAILED)
 *   7. Mark job "complete" with evidence result shape
 *
 * @param {string} jobId
 * @param {string} userId
 * @param {string} type       — "screenshot" | "scan_report" | "audio" | "document"
 * @param {Buffer} fileBuffer — raw file bytes (from multer memoryStorage)
 */
async function runEvidenceJob(jobId, userId, type, fileBuffer) {
  let evidenceId = null;

  try {
    await updateJob(jobId, { status: 'processing' });

    // ── Step 2: Hash ───────────────────────────────────────────────────────
    const hash = 'sha256:' + crypto.createHash('sha256').update(fileBuffer).digest('hex');

    // ── Step 3: Supabase upload ────────────────────────────────────────────
    // TODO (Part 2): integrate Supabase Storage.
    // const { data, error } = await supabase.storage
    //   .from('evidence')
    //   .upload(`${userId}/${Date.now()}_${type}`, fileBuffer, { contentType: mimetype });
    // if (error) throw error;
    // const file_ref = data.path;
    const file_ref = `placeholder/${userId}/${type}/${Date.now()}`; // stub

    // ── Step 4: Persist evidence row ───────────────────────────────────────
    const evidence = await prisma.evidence.create({
      data: { user_id: userId, type, file_ref, hash, blockchain_tx_id: null },
    });
    evidenceId = evidence.id;

    // ── Step 5: Blockchain write ───────────────────────────────────────────
    // TODO (Part 2 — Vedant): write evidence.hash to the Sepolia evidence-ledger contract.
    // const tx = await evidenceLedger.submit(hash);
    // const blockchain_tx_id = tx.hash;
    let blockchain_tx_id = null;

    // ── Step 6: Update blockchain_tx_id once confirmed ────────────────────
    if (blockchain_tx_id) {
      await prisma.evidence.update({
        where: { id: evidence.id },
        data:  { blockchain_tx_id },
      });
    }

    // ── Step 7: Mark job complete ──────────────────────────────────────────
    await updateJob(jobId, {
      status:       'complete',
      result:       {
        evidence_id:      evidence.id,
        type,
        hash,
        blockchain_tx_id: blockchain_tx_id ?? null,
      },
      completed_at: new Date(),
    });
  } catch (err) {
    console.error(`[evidenceJob] Job ${jobId} failed:`, err);

    // Per contract §6: BLOCKCHAIN_WRITE_FAILED keeps the evidence row for retry;
    // other errors use INTERNAL_ERROR.
    const isBlockchainError = err.code === 'BLOCKCHAIN_WRITE_FAILED';
    await updateJob(jobId, {
      status: 'failed',
      error:  {
        code:    isBlockchainError ? 'BLOCKCHAIN_WRITE_FAILED' : 'INTERNAL_ERROR',
        message: err.message,
      },
    }).catch(() => {});
  }
}

module.exports = { runEvidenceJob };
