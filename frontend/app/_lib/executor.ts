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

export type RunNowResult =
  | {
      action: "execute";
      digest: string;
      amountIn: string;
      amountOut: string;
    }
  | { action: "skip"; reason: string; digest: string };

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
