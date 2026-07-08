import { db, verificationRequestsTable, type VerificationRequest } from "@workspace/db";
import { eq, and, or, isNull, lte, lt } from "drizzle-orm";
import { validateProofText, scorePayload } from "@workspace/pou-validator";
import { contractService } from "./contractService.js";
import { logger } from "../lib/logger.js";

// Background worker that turns `ready_to_score` rows into on-chain
// `recordVerification` calls. Mirrors pouMintService.ts's trust model: this
// is the ONLY code path allowed to call contractService.recordVerificationAsOracle
// — no HTTP route may trigger a scoring write directly (see task-4 "out of
// scope": exposing a public endpoint that itself posts a score).
//
// Also owns the operational policy for the one on-chain edge case the
// contract itself has no answer for: a request whose report text never
// arrives via the API. There is no refund path in ReportVerification.sol —
// the fee is escrowed the moment requestVerification() is called — so an
// abandoned request would otherwise sit in Status.Requested forever. After
// a grace period this worker posts a score of 0 on its behalf so the
// standard finalize() flow can eventually release the escrowed fee.

const POLL_INTERVAL_MS = 20_000;
const CONNECT_WAIT_MS = 3_000;
const BATCH_LIMIT = 5;
const MAX_ATTEMPTS = 5;
const BASE_RETRY_MS = 30_000; // 30s, doubles per attempt
const MAX_RETRY_MS = 30 * 60_000; // cap at 30 minutes
const STALE_SCORING_MS = 5 * 60_000; // reclaim a claim left dangling by a crash mid-score
const AWAITING_TEXT_GRACE_DAYS = 3;

class VerificationScorer {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  async start(): Promise<void> {
    await this._waitForChainConnection();

    await this._tick();
    this.pollTimer = setInterval(() => {
      this._tick().catch((err) => logger.warn({ err }, "verificationScorer: periodic tick failed"));
    }, POLL_INTERVAL_MS);

    logger.info("verificationScorer: started (polling every 20s)");
  }

  private async _waitForChainConnection(): Promise<void> {
    while (!contractService.reportVerificationConnected) {
      await new Promise((r) => setTimeout(r, CONNECT_WAIT_MS));
    }
  }

  private async _tick(): Promise<void> {
    if (this.ticking) return; // coalesce overlapping ticks
    this.ticking = true;
    try {
      await this._reclaimStale();
      await this._autoScoreAbandoned();
      await this._scoreReady();
    } finally {
      this.ticking = false;
    }
  }

  /** A crash mid-score can leave a row claimed (status='scoring') forever — release it back for retry. */
  private async _reclaimStale(): Promise<void> {
    const staleCutoff = new Date(Date.now() - STALE_SCORING_MS);
    const reclaimed = await db
      .update(verificationRequestsTable)
      .set({ status: "ready_to_score" })
      .where(and(eq(verificationRequestsTable.status, "scoring"), lt(verificationRequestsTable.updatedAt, staleCutoff)))
      .returning({ id: verificationRequestsTable.id });

    if (reclaimed.length > 0) {
      logger.warn({ count: reclaimed.length }, "verificationScorer: reclaimed stale in-flight scoring rows");
    }
  }

  /**
   * Standard-tier requests whose report text never arrived within the grace
   * period get posted a score of 0 so the fee can eventually be finalized —
   * see the file-level comment. Premium tier is intentionally excluded: it
   * has no auto-scoring path here at all (ships admin-disabled; when
   * enabled, only triggerPremiumOracle/Chainlink ever score it).
   */
  private async _autoScoreAbandoned(): Promise<void> {
    const cutoff = new Date(Date.now() - AWAITING_TEXT_GRACE_DAYS * 24 * 60 * 60 * 1000);
    const abandoned = await db
      .select()
      .from(verificationRequestsTable)
      .where(
        and(
          eq(verificationRequestsTable.status, "awaiting_text"),
          eq(verificationRequestsTable.tier, "standard"),
          lt(verificationRequestsTable.createdAt, cutoff)
        )
      )
      .limit(BATCH_LIMIT);

    for (const row of abandoned) {
      const claimed = await this._claim(row.id, "awaiting_text");
      if (!claimed) continue;

      await this._postScore(claimed, 0, "No report text received within the grace period — auto-scored 0.");
    }
  }

  private async _scoreReady(): Promise<void> {
    const now = new Date();
    const ready = await db
      .select()
      .from(verificationRequestsTable)
      .where(
        and(
          eq(verificationRequestsTable.status, "ready_to_score"),
          eq(verificationRequestsTable.tier, "standard"),
          or(isNull(verificationRequestsTable.nextRetryAt), lte(verificationRequestsTable.nextRetryAt, now))
        )
      )
      .orderBy(verificationRequestsTable.createdAt)
      .limit(BATCH_LIMIT);

    for (const row of ready) {
      const claimed = await this._claim(row.id, "ready_to_score");
      if (!claimed) continue;

      await this._scoreAndPost(claimed);
    }
  }

  /** Optimistic claim — only succeeds if the row is still in `fromStatus`. */
  private async _claim(id: number, fromStatus: string): Promise<VerificationRequest | null> {
    const [claimed] = await db
      .update(verificationRequestsTable)
      .set({ status: "scoring" })
      .where(and(eq(verificationRequestsTable.id, id), eq(verificationRequestsTable.status, fromStatus)))
      .returning();
    return claimed ?? null;
  }

  private async _scoreAndPost(row: VerificationRequest): Promise<void> {
    try {
      const preCheck = validateProofText(row.reportText);
      let score: number;
      let reasoning: string;

      if (!preCheck.valid) {
        score = 0;
        reasoning = preCheck.reason ?? "Report failed strict pre-check";
      } else {
        const result = await scorePayload(row.reportText as string);
        score = result.score;
        reasoning = result.reasoning;
      }

      await this._postScore(row, score, reasoning);
    } catch (err) {
      await this._handleFailure(row, err);
    }
  }

  /** Posts a score on-chain via the oracle wallet and marks the row posted. Throws on failure. */
  private async _postScore(row: VerificationRequest, score: number, reasoning: string): Promise<void> {
    try {
      if (row.onchainRequestId == null) {
        throw new Error("Cannot post a score before the on-chain request has been indexed");
      }
      const { txHash } = await contractService.recordVerificationAsOracle(BigInt(row.onchainRequestId), score);

      await db
        .update(verificationRequestsTable)
        .set({ status: "posted", score, reasoning, recordTxHash: txHash, lastError: null })
        .where(eq(verificationRequestsTable.id, row.id));

      logger.info(
        { requestId: row.onchainRequestId, score, txHash },
        "verificationScorer: score posted on-chain"
      );
    } catch (err) {
      await this._handleFailure(row, err);
    }
  }

  private async _handleFailure(row: VerificationRequest, err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = row.scoringAttempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      await db
        .update(verificationRequestsTable)
        .set({ status: "failed", scoringAttempts: attempts, lastError: message })
        .where(eq(verificationRequestsTable.id, row.id));
      logger.error({ requestId: row.id, attempts, err: message }, "verificationScorer: giving up after max attempts");
      return;
    }

    const backoffMs = Math.min(BASE_RETRY_MS * 2 ** row.scoringAttempts, MAX_RETRY_MS);
    await db
      .update(verificationRequestsTable)
      .set({
        status: "ready_to_score",
        scoringAttempts: attempts,
        lastError: message,
        nextRetryAt: new Date(Date.now() + backoffMs),
      })
      .where(eq(verificationRequestsTable.id, row.id));
    logger.warn({ requestId: row.id, attempts, backoffMs, err: message }, "verificationScorer: scoring attempt failed, will retry");
  }
}

export const verificationScorer = new VerificationScorer();
