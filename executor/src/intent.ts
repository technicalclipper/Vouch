// SPDX-License-Identifier: Apache-2.0
//
// Natural-language → DCAIntent JSON parser (CLAUDE.md §7.2).
//
// The browser POSTs the user's freeform sentence here; we call OpenAI with a
// strict system prompt forcing JSON-only output, parse, and validate against
// the same Zod schema the frontend uses. One automatic retry with a
// clarifying prompt on schema failure, then we surface the error.
//
// Why this runs on the executor (not in the browser): keeps the OpenAI API
// key off-client. Same reasoning as the skip-reason call in llm.ts.

import { z } from "zod";
import OpenAI from "openai";

export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const RiskRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("price_drop"),
    window_hours: z.number().int().positive().max(168),
    // Negative number (e.g. -5 = "if it falls more than 5%").
    threshold_pct: z.number().lt(0).gte(-100),
  }),
  z.object({
    type: z.literal("slippage_cap"),
    threshold_pct: z.number().positive().max(50),
  }),
]);

export const DCAIntentSchema = z.object({
  action: z.literal("dca_buy"),
  asset_in: z.literal("USDC"),
  asset_out: z.literal("SUI"),
  amount_per_execution: z.number().positive().max(100_000),
  frequency: z.enum(["weekly", "daily", "monthly"]),
  day_of_week: z.enum(DAYS).optional(),
  total_executions: z.number().int().positive().max(520),
  risk_rules: z.array(RiskRuleSchema).max(4),
  expires_in_days: z.number().int().positive().max(730),
});

export type DCAIntent = z.infer<typeof DCAIntentSchema>;

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

const SYSTEM_PROMPT = `You convert a user's plain-English description of a recurring SUI purchase into a strict JSON object.

Output rules:
- Reply with ONLY a JSON object, no prose, no markdown fences, no comments.
- The object must match this exact shape:
  {
    "action": "dca_buy",
    "asset_in": "USDC",
    "asset_out": "SUI",
    "amount_per_execution": number,    // USDC per buy
    "frequency": "weekly" | "daily" | "monthly",
    "day_of_week"?: "monday".."sunday",  // only when frequency is "weekly"
    "total_executions": integer,       // how many buys total
    "risk_rules": [
      { "type": "price_drop", "window_hours": integer, "threshold_pct": negative number }
      | { "type": "slippage_cap", "threshold_pct": positive number }
    ],
    "expires_in_days": integer
  }

Defaults when unspecified:
- frequency: "weekly", day_of_week: "monday"
- total_executions: 8 (weekly), 30 (daily), 6 (monthly)
- risk_rules: [{"type":"price_drop","window_hours":1,"threshold_pct":-5},{"type":"slippage_cap","threshold_pct":1}]
- expires_in_days: enough to cover all executions with a small buffer.
- amount_per_execution: 50 if unstated.

Constraints:
- amount_per_execution > 0 and <= 100000.
- price_drop threshold_pct strictly negative (e.g. -5 means "drop more than 5%").
- slippage_cap threshold_pct strictly positive (e.g. 1 means "1%").
- total_executions integer.`;

export interface ParseSuccess {
  ok: true;
  intent: DCAIntent;
  used: "llm" | "fallback";
}

export interface ParseFailure {
  ok: false;
  error: string;
  details?: unknown;
}

export type ParseResult = ParseSuccess | ParseFailure;

export async function parseIntent(text: string): Promise<ParseResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY not configured" };
  }
  const client = new OpenAI({ apiKey });

  const attempt = async (
    extraSystem?: string,
    lastError?: string,
  ): Promise<ParseResult> => {
    const messages: { role: "system" | "user"; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT + (extraSystem ?? "") },
      { role: "user", content: text },
    ];
    if (lastError) {
      messages.push({
        role: "user",
        content: `Your previous reply did not validate: ${lastError}\nReturn a valid JSON object now, nothing else.`,
      });
    }
    let raw: string;
    try {
      const r = await client.chat.completions.create({
        model: MODEL,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages,
      });
      raw = r.choices[0]?.message?.content?.trim() ?? "";
    } catch (err) {
      return { ok: false, error: `OpenAI call failed: ${(err as Error).message}` };
    }
    if (!raw) return { ok: false, error: "empty model response" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        error: `model returned non-JSON: ${(err as Error).message}`,
        details: raw,
      };
    }
    const v = DCAIntentSchema.safeParse(parsed);
    if (v.success) return { ok: true, intent: v.data, used: "llm" };
    return {
      ok: false,
      error: v.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
      details: parsed,
    };
  };

  const first = await attempt();
  if (first.ok) return first;
  // One retry with the validation error fed back in.
  return attempt("", first.error);
}
