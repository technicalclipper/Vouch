// SPDX-License-Identifier: Apache-2.0
//
// Demo HTTP surface. CLAUDE.md §5 calls this out explicitly:
//   "POST /run-now/:capId so the demo can trigger an execution on command
//    rather than waiting for the schedule. Be transparent this is a demo
//    convenience."
//
// Also exposes /health for the frontends.

import Fastify from "fastify";
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { loadCap, isDue } from "./cap.ts";
import { executeOne } from "./execute.ts";
import { submitSkip } from "./skip.ts";
import { evaluate } from "./risk.ts";

export interface ServerDeps {
  client: SuiClient;
  kp: Ed25519Keypair;
}

export function buildServer({ client, kp }: ServerDeps) {
  const app = Fastify({ logger: { level: "info" } });

  app.get("/health", async () => ({
    ok: true,
    agent: kp.toSuiAddress(),
  }));

  // Hot path. Reads the cap, runs risk eval, then submits either an execute
  // PTB or a skip PTB. Returns the on-chain digest so the demo UI can show it.
  app.post<{ Params: { capId: string }; Querystring: { force?: string } }>(
    "/run-now/:capId",
    async (req, reply) => {
      const { capId } = req.params;
      const forceExecute = req.query.force === "execute";
      const forceSkip = req.query.force === "skip";

      const cap = await loadCap(client, capId);

      if (!isDue(cap)) {
        // Block early so we never burn gas on a tx the chain will reject.
        return reply.code(409).send({
          error: "cap not due",
          state: {
            active: cap.active,
            revoked: cap.revoked,
            nextExecutionAt: cap.nextExecutionAt.toString(),
            executionsDone: cap.executionsDone.toString(),
            executionsMax: cap.executionsMax.toString(),
            expiresAt: cap.expiresAt.toString(),
            now: Date.now().toString(),
          },
        });
      }

      if (forceSkip) {
        const reason =
          "Demo override: skipping this slot to show the risk-skip path.";
        const r = await submitSkip(client, kp, cap, reason);
        return { action: "skip", reason, digest: r.digest };
      }

      const decision = forceExecute ? { action: "execute" as const } : await evaluate(cap);
      if (decision.action === "skip") {
        const r = await submitSkip(client, kp, cap, decision.reason);
        return { action: "skip", reason: decision.reason, digest: r.digest };
      }

      const r = await executeOne(client, kp, cap);
      return {
        action: "execute",
        digest: r.digest,
        amountIn: r.amountInUsed.toString(),
        amountOut: r.amountOut.toString(),
      };
    },
  );

  return app;
}
