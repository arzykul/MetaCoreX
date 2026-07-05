import { GoogleGenAI } from "@google/genai";

/**
 * MetaCoreX PoU validator agent.
 *
 * Takes an executor's report (a plain-text payload describing completed
 * work) and asks Gemini to score it 1-10 on the "PoU Score" quality metric
 * used across the MetaCoreX proof-of-usefulness system. Prints the result
 * and exits.
 *
 * Run: pnpm --filter @workspace/scripts run agent:validator
 */

const MODEL = "gemini-2.5-flash";

const TEST_PAYLOAD = `Executor report:
Task: "ETH Market Analysis"
Summary: Pulled the last 24h of ETH/USD price and volume data, computed
short-term volatility, and flagged a possible breakout above $3,800 with
supporting on-chain volume evidence. Delivered as a 1-page markdown report
with a chart reference and three actionable recommendations.`;

interface PouScoreResult {
  score: number;
  reasoning: string;
}

function buildPrompt(payload: string): string {
  return `You are a strict PoU (Proof-of-Usefulness) quality evaluator for the MetaCoreX network.
Score the following executor report on a "PoU Score" from 1 (useless/low-effort) to 10 (exceptional, high-impact work).

Executor report:
"""
${payload}
"""

Respond with ONLY a compact JSON object, no markdown fences, in this exact shape:
{"score": <integer 1-10>, "reasoning": "<one short sentence explaining the score>"}`;
}

async function scorePayload(ai: GoogleGenAI, payload: string): Promise<PouScoreResult> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(payload),
  });

  const text = (response.text ?? "").trim();
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
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

  return parsed as PouScoreResult;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Missing GEMINI_API_KEY. Set it in Secrets before running this script.");
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });

  console.log(`Scoring payload with ${MODEL}...\n`);
  console.log(TEST_PAYLOAD);
  console.log("");

  const result = await scorePayload(ai, TEST_PAYLOAD);

  console.log("PoU Score result:");
  console.log(`  Score: ${result.score}/10`);
  console.log(`  Reasoning: ${result.reasoning}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Validator agent failed:", error);
  process.exit(1);
});
