// SPDX-License-Identifier: Apache-2.0
//
// Thin wrapper around the executor backend's HTTP surface (executor/src/server.ts).
// Demo-only path: the recipient dashboard triggers /run-now to drive a real
// Deepbook trade on stage rather than waiting for the schedule.

"use client";

const DEFAULT_URL = "http://localhost:8787";

function executorUrl(): string {
  return (
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_EXECUTOR_URL) ||
    DEFAULT_URL
  );
}

// Exposed for other modules (e.g. zklogin sponsor calls) that need to hit
// the executor on their own routes.
export function executorBaseUrl(): string {
  return executorUrl();
}

export type RunNowResult =
  | {
      action: "execute";
      digest: string;
      amountIn: string;
      amountOut: string;
    }
  | { action: "skip"; reason: string; digest: string };

// Thrown when the executor refuses because the cap isn't due yet (HTTP 409).
// We expose `nextExecutionAt` so callers can render a friendly "Next buy in Xh"
// instead of the raw JSON state blob.
export class CapNotDueError extends Error {
  nextExecutionAt: number;
  constructor(nextExecutionAt: number) {
    super("cap not due");
    this.name = "CapNotDueError";
    this.nextExecutionAt = nextExecutionAt;
  }
}

export async function runNowOnChain(
  capId: string,
  opts: { force?: "execute" | "skip" } = {},
): Promise<RunNowResult> {
  const qs = opts.force ? `?force=${opts.force}` : "";
  const res = await fetch(`${executorUrl()}/run-now/${capId}${qs}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 409) {
      try {
        const parsed = JSON.parse(body) as {
          error?: string;
          state?: { nextExecutionAt?: string };
        };
        if (parsed.error === "cap not due" && parsed.state?.nextExecutionAt) {
          throw new CapNotDueError(Number(parsed.state.nextExecutionAt));
        }
      } catch (e) {
        if (e instanceof CapNotDueError) throw e;
        // fall through to generic error
      }
    }
    throw new Error(`run-now ${res.status}: ${body}`);
  }
  return (await res.json()) as RunNowResult;
}

export async function executorHealth(): Promise<{
  ok: boolean;
  agent: string;
}> {
  const res = await fetch(`${executorUrl()}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as { ok: boolean; agent: string };
}

import type { DCAIntent } from "./types";

// Sends the user's freeform sentence to the executor, gets back a
// schema-validated DCAIntent. Throws with a friendly message on failure.
export async function parseIntent(text: string): Promise<DCAIntent> {
  const res = await fetch(`${executorUrl()}/intent/parse`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json()) as
    | { intent: DCAIntent }
    | { error: string; details?: unknown };
  if (!res.ok || !("intent" in body)) {
    throw new Error(
      "error" in body ? body.error : `intent parse ${res.status}`,
    );
  }
  return body.intent;
}
