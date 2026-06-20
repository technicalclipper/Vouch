// SPDX-License-Identifier: Apache-2.0
//
// Executor entrypoint. Boots:
//   1. the Fastify HTTP server (health + /run-now/:capId)
//   2. the poll loop (every POLL_INTERVAL_MS, find due caps → risk → execute|skip)
//
// The poll loop can be disabled with DISABLE_POLL=true. During the live demo
// we usually want this — the operator drives executions via /run-now so the
// timing is predictable on stage.

import { SuiClient } from "@mysten/sui/client";

import { CONFIG } from "../../shared/config.ts";
import { loadAgentKeypair } from "./keypair.ts";
import { findDueCaps, type CapState } from "./cap.ts";
import { evaluate } from "./risk.ts";
import { executeOne } from "./execute.ts";
import { submitSkip } from "./skip.ts";
import { buildServer } from "./server.ts";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "30000");
const DISABLE_POLL = process.env.DISABLE_POLL === "true";
const PORT = Number(process.env.PORT ?? "8787");

async function processOne(
  client: SuiClient,
  kp: ReturnType<typeof loadAgentKeypair>,
  cap: CapState,
) {
  try {
    const decision = await evaluate(cap);
    if (decision.action === "skip") {
      const r = await submitSkip(client, kp, cap, decision.reason);
      console.log(
        `[skip] cap=${cap.capId.slice(0, 10)}… reason="${decision.reason}" digest=${r.digest}`,
      );
      return;
    }
    const r = await executeOne(client, kp, cap);
    console.log(
      `[execute] cap=${cap.capId.slice(0, 10)}… in=${r.amountInUsed} out=${r.amountOut} digest=${r.digest}`,
    );
  } catch (err) {
    console.error(
      `[error] cap=${cap.capId.slice(0, 10)}…`,
      (err as Error).message,
    );
  }
}

async function pollOnce(
  client: SuiClient,
  kp: ReturnType<typeof loadAgentKeypair>,
) {
  const me = kp.toSuiAddress();
  const due = await findDueCaps(client, me);
  if (due.length === 0) return;
  console.log(`[poll] ${due.length} cap(s) due`);
  // Sequentially so two PTBs don't race on the same shared BalanceManager.
  for (const cap of due) {
    await processOne(client, kp, cap);
  }
}

async function main() {
  const kp = loadAgentKeypair();
  const client = new SuiClient({ url: CONFIG.rpcUrl });

  console.log(`vouch executor`);
  console.log(`  package:  ${CONFIG.vouchPackageId}`);
  console.log(`  agent:    ${kp.toSuiAddress()}`);
  console.log(`  network:  ${CONFIG.network}`);
  console.log(`  poll:     ${DISABLE_POLL ? "DISABLED" : `${POLL_INTERVAL_MS}ms`}`);

  const app = buildServer({ client, kp });
  await app.listen({ host: "0.0.0.0", port: PORT });

  if (!DISABLE_POLL) {
    // Fire once immediately, then on interval.
    pollOnce(client, kp).catch((e) =>
      console.error("[poll error]", (e as Error).message),
    );
    setInterval(() => {
      pollOnce(client, kp).catch((e) =>
        console.error("[poll error]", (e as Error).message),
      );
    }, POLL_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
