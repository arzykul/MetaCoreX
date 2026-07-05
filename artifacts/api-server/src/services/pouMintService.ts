import { ethers } from "ethers";
import { validateProofText, scorePayload, MIN_SCORE_TO_MINT } from "@workspace/pou-validator";
import { contractService } from "./contractService.js";
import { logger } from "../lib/logger.js";

/**
 * The ONLY place in the API server allowed to trigger an on-chain PoU mint.
 * Both the task-marketplace "complete" route and the dashboard "Submit Proof
 * of Use" route call this — never contractService.submitProofAsValidator
 * directly — so scoring can never be bypassed regardless of which HTTP route
 * a request comes in on.
 *
 * Flow: strict pre-check -> Gemini score -> (if score >= MIN_SCORE_TO_MINT)
 * validator wallet mints via submitProof -> validator transfers the reward
 * on to `recipient`. GEMINI_API_KEY and AGENT_PRIVATE_KEY are read only on
 * the server; the frontend never sees a score or signs a mint transaction.
 */

export interface PouMintResult {
  accepted: boolean;
  score: number;
  reasoning: string;
  rejectReason?: string;
  amountWei: string;
  rewardWei?: string;
  rewardArzyg?: string;
  mintTxHash?: string;
  transferTxHash?: string;
}

export async function validateScoreAndMint(params: {
  proofText: string;
  recipient: string;
  amountWei: bigint;
}): Promise<PouMintResult> {
  const { proofText, recipient, amountWei } = params;

  const preCheck = validateProofText(proofText);
  if (!preCheck.valid) {
    return {
      accepted: false,
      score: 0,
      reasoning: preCheck.reason ?? "Invalid proof",
      rejectReason: preCheck.reason,
      amountWei: amountWei.toString(),
    };
  }

  if (!contractService.connected) {
    throw new Error("Blockchain not connected");
  }

  const { score, reasoning } = await scorePayload(proofText);

  if (score < MIN_SCORE_TO_MINT) {
    return {
      accepted: false,
      score,
      reasoning,
      rejectReason: `PoU score ${score}/10 is below the minimum of ${MIN_SCORE_TO_MINT} required to mint`,
      amountWei: amountWei.toString(),
    };
  }

  await contractService.ensureValidatorRegistered();

  const proofOnChain = `PoU validation for ${recipient} — score ${score}/10 — ${reasoning}`.slice(0, 500);
  const mintResult = await contractService.submitProofAsValidator(proofOnChain, amountWei, score);

  if (!mintResult.accepted || !mintResult.reward) {
    logger.warn({ recipient, reason: mintResult.reason }, "pouMintService: on-chain submitProof rejected");
    return {
      accepted: false,
      score,
      reasoning,
      rejectReason: mintResult.reason ?? "On-chain mint was rejected",
      amountWei: amountWei.toString(),
      mintTxHash: mintResult.txHash,
    };
  }

  const rewardWei = BigInt(mintResult.reward);
  const transferTxHash = await contractService.transferFromValidator(recipient, rewardWei);

  return {
    accepted: true,
    score,
    reasoning,
    amountWei: amountWei.toString(),
    rewardWei: rewardWei.toString(),
    rewardArzyg: ethers.formatEther(rewardWei),
    mintTxHash: mintResult.txHash,
    transferTxHash,
  };
}
