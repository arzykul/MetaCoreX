import { GoogleGenAI } from "@google/genai";

/**
 * Shared PoU (Proof of Usefulness) validation logic.
 *
 * This is the ONLY place that talks to Gemini to score an executor report.
 * Both the API server (website submission paths) and the standalone
 * `scripts/src/validator-agent.ts` demo script use this package, so there is
 * a single, auditable scoring path — no route or script may award a PoU
 * score on its own.
 *
 * Required env:
 *   GEMINI_API_KEY - Gemini API key (Secrets). Read lazily on first call to
 *   `scorePayload`, not at import time, so this package can be imported by
 *   code paths that never end up scoring anything.
 */

export const MODEL = "gemini-2.5-flash";

/** Minimum PoU score (out of 10) required before any mint is attempted. */
export const MIN_SCORE_TO_MINT = 7;

export interface PouScoreResult {
  score: number;
  reasoning: string;
}

export interface ProofValidationResult {
  valid: boolean;
  reason?: string;
}

const MIN_PROOF_LENGTH = 20;
const MIN_UNIQUE_CHARS = 5;

/**
 * Strict, deterministic sanity check applied BEFORE any Gemini call. Rejects
 * empty/missing text, too-short reports, and low-entropy "spam" (e.g. a
 * single character repeated, or short repeating patterns) up front. This is
 * cheap, can't be gamed by prompt-injecting the model, and keeps obviously
 * bad submissions from ever reaching (and burning quota on) the LLM call.
 */
export function validateProofText(text: unknown): ProofValidationResult {
  if (typeof text !== "string") {
    return { valid: false, reason: "proof must be a string" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: "proof must not be empty" };
  }
  if (trimmed.length < MIN_PROOF_LENGTH) {
    return { valid: false, reason: `proof must be at least ${MIN_PROOF_LENGTH} characters` };
  }
  const withoutWhitespace = trimmed.toLowerCase().replace(/\s+/g, "");
  const uniqueChars = new Set(withoutWhitespace).size;
  if (uniqueChars < MIN_UNIQUE_CHARS) {
    return { valid: false, reason: "proof looks like spam (too little variation in content)" };
  }
  return { valid: true };
}

// System instruction: turns the validator into a fact-checking "AI judge"
// that uses Google Search grounding to verify concrete claims (deployed a
// node, wrote an article, made a post, etc.) before awarding a high score.
const SYSTEM_INSTRUCTION = `Ты — строгий ИИ-Судья для MetaCoreX. Твоя задача — проверить отчет исполнителя. Если исполнитель утверждает, что развернул ноду, написал статью или сделал пост, используй инструмент Google Search, чтобы найти подтверждение в интернете. Выставляй высокий PoU Score (>=7) только если нашел реальные доказательства в сети. Если информации нет или это спам — ставь балл ниже 7.`;

function buildPrompt(payload: string): string {
  return `Score the following executor report on a "PoU Score" from 1 (useless/low-effort/unverifiable) to 10 (exceptional, high-impact, verified work).

Executor report:
"""
${payload}
"""

Respond with ONLY a compact JSON object, no markdown fences, in this exact shape:
{"score": <integer 1-10>, "reasoning": "<one short sentence explaining the score, mentioning what search evidence, if any, was found>"}`;
}

function extractJson(text: string): unknown {
  const fenced = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    // Search-grounded responses sometimes wrap the JSON in extra prose —
    // fall back to grabbing the first {...} block in the text.
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error(`Could not parse model response as JSON: ${text}`);
  }
}

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — cannot score PoU submissions");
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey });
  }
  return cachedClient;
}

/**
 * Scores a (already pre-validated) executor report via Gemini with Google
 * Search grounding. Throws if GEMINI_API_KEY is missing or the model
 * response can't be parsed — callers must not silently fall back to a
 * default score on failure.
 */
export async function scorePayload(payload: string): Promise<PouScoreResult> {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(payload),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = (response.text ?? "").trim();

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error(`Could not parse model response as JSON: ${text}`);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as PouScoreResult).score !== "number" ||
    typeof (parsed as PouScoreResult).reasoning !== "string"
  ) {
    throw new Error(`Unexpected response shape: ${text}`);
  }

  const result = parsed as PouScoreResult;
  // Clamp defensively — the contract enforces score <= 10 on-chain, but a
  // rejected/rounded tx there is a worse failure mode than clamping here.
  const clampedScore = Math.max(0, Math.min(10, Math.round(result.score)));
  return { score: clampedScore, reasoning: result.reasoning };
}
