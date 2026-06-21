// SPDX-License-Identifier: Apache-2.0
//
// One-sentence human-readable skip reason. Real LLM call (OpenAI), with a
// template fallback when OPENAI_API_KEY is absent so demos still work offline.
//
// CLAUDE.md §6:
//   "The LLM-generated reason MUST be a real model call, not an f-string
//    template. The difference is small in code, large in the pitch ('the agent
//    explains itself'). Keep the call tiny and out of the hot path."
//
// We call this only on the skip path (not every poll), and we cap the
// response to a single short sentence.

import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export interface SkipContext {
  ruleType: "price_drop" | "slippage_cap";
  market: {
    suiUsdNow?: number;
    suiUsdPrior?: number;
    pctChange?: number; // for price_drop
    estimatedSlippageBps?: number; // for slippage_cap
  };
  threshold: {
    // Mirrors the rule shape on chain (CLAUDE.md §4.1).
    pct?: number; // price_drop: e.g. -5
    bps?: number; // slippage_cap: e.g. 100 = 1%
    windowMs?: number; // price_drop window
  };
  originalIntent: string; // human-readable summary of what the funder asked for
}

export async function generateSkipReason(ctx: SkipContext): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return templateReason(ctx);
  }
  try {
    const client = new OpenAI({ apiKey });
    const system =
      "You are an autonomous DCA agent explaining why you deferred a scheduled buy. " +
      "Reply with EXACTLY one short, plain-English sentence (max ~22 words). " +
      "No emoji, no markdown, no preamble. Speak in first person. " +
      "Reference the concrete trigger and what you'll do next.";
    const user = JSON.stringify(ctx);
    const r = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 80,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = r.choices[0]?.message?.content?.trim();
    if (!text) return templateReason(ctx);
    // Take only the first sentence and strip trailing whitespace.
    const firstSentence = text.split(/(?<=[.!?])\s/, 1)[0]?.trim();
    return firstSentence || text;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[llm] OpenAI call failed, falling back to template:", err);
    return templateReason(ctx);
  }
}

function templateReason(ctx: SkipContext): string {
  if (ctx.ruleType === "price_drop") {
    const pct = ctx.market.pctChange ?? 0;
    const thr = ctx.threshold.pct ?? 0;
    const hrs = Math.round((ctx.threshold.windowMs ?? 0) / 3_600_000);
    return `SUI dropped ${Math.abs(pct).toFixed(1)}% in the last ${hrs}h, exceeding the ${Math.abs(thr)}% threshold; deferring this slot.`;
  }
  const bps = ctx.market.estimatedSlippageBps ?? 0;
  const thrBps = ctx.threshold.bps ?? 0;
  return `Orderbook is too thin right now — estimated slippage ${(bps / 100).toFixed(2)}% exceeds the ${(thrBps / 100).toFixed(2)}% cap; deferring this slot.`;
}
