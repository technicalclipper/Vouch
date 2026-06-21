// SPDX-License-Identifier: Apache-2.0
//
// Demo HTTP surface. CLAUDE.md §5 calls this out explicitly:
//   "POST /run-now/:capId so the demo can trigger an execution on command
//    rather than waiting for the schedule. Be transparent this is a demo
//    convenience."
//
// Also exposes /health for the frontends.

import Fastify from "fastify";
import cors from "@fastify/cors";
import type { SuiClient } from "@mysten/sui/client";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

import { loadCap, isDue } from "./cap.ts";
import { executeOne } from "./execute.ts";
import { submitSkip } from "./skip.ts";
import { evaluate } from "./risk.ts";
import {
  prepareActivate,
  prepareRevoke,
  submitActivate,
  submitRevoke,
} from "./sponsor.ts";
import { parseIntent } from "./intent.ts";

export interface ServerDeps {
  client: SuiClient;
  kp: Ed25519Keypair;
}

export function buildServer({ client, kp }: ServerDeps) {
  const app = Fastify({ logger: { level: "info" } });

  // Permissive CORS so the recipient/creator frontends (different origin in
  // dev, different domain in prod) can hit /health + /run-now from the
  // browser. Demo-grade — tighten before any real deployment.
  app.register(cors, { origin: true });

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
        // Demo path: flip the price-drop override on for THIS call only so
        // evaluate() trips the price_drop rule and produces a real LLM-written
        // reason. Restore the previous env value afterwards.
        const prev = process.env.DEMO_FORCE_PRICE_DROP;
        process.env.DEMO_FORCE_PRICE_DROP = "true";
        let decision;
        try {
          decision = await evaluate(client, cap);
        } finally {
          if (prev === undefined) delete process.env.DEMO_FORCE_PRICE_DROP;
          else process.env.DEMO_FORCE_PRICE_DROP = prev;
        }
        if (decision.action !== "skip") {
          // Override didn't trip (shouldn't happen) — fall back to a string.
          decision = {
            action: "skip" as const,
            reason: "Demo override: deferring this slot to show the risk path.",
            market: decision.market,
          };
        }
        const r = await submitSkip(client, kp, cap, decision.reason);
        return {
          action: "skip",
          reason: decision.reason,
          digest: r.digest,
          market: decision.market,
        };
      }

      const decision = forceExecute
        ? ({ action: "execute" as const, market: undefined } as const)
        : await evaluate(client, cap);
      if (decision.action === "skip") {
        const r = await submitSkip(client, kp, cap, decision.reason);
        return {
          action: "skip",
          reason: decision.reason,
          digest: r.digest,
          market: decision.market,
        };
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

  // ---- Sponsored zkLogin activation -------------------------------------
  // Recipient zkLogin address pays no gas. We build the PTB and pre-sign as
  // sponsor; the client signs the same bytes with the zkLogin sig and posts
  // back to /submit. See sponsor.ts for the full flow.

  app.post<{
    Body: { capId: string; token: string; userAddress: string };
  }>("/sponsor/activate/prepare", async (req, reply) => {
    const { capId, token, userAddress } = req.body ?? {};
    if (!capId || !token || !userAddress) {
      return reply.code(400).send({
        error: "capId, token, userAddress required",
      });
    }
    try {
      const r = await prepareActivate(client, kp, capId, token, userAddress);
      return r;
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.post<{
    Body: { txBytes: string; userSig: string; sponsorSig: string };
  }>("/sponsor/activate/submit", async (req, reply) => {
    const { txBytes, userSig, sponsorSig } = req.body ?? {};
    if (!txBytes || !userSig || !sponsorSig) {
      return reply
        .code(400)
        .send({ error: "txBytes, userSig, sponsorSig required" });
    }
    try {
      const r = await submitActivate(client, { txBytes, userSig, sponsorSig });
      return r;
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // ---- Sponsored zkLogin revoke -----------------------------------------
  // Recipient (cap owner) revokes from the dashboard. Same dual-sig pattern
  // as activate. Funder-side revoke goes through the wallet adapter directly.

  app.post<{
    Body: { capId: string; vaultId: string; userAddress: string };
  }>("/sponsor/revoke/prepare", async (req, reply) => {
    const { capId, vaultId, userAddress } = req.body ?? {};
    if (!capId || !vaultId || !userAddress) {
      return reply.code(400).send({
        error: "capId, vaultId, userAddress required",
      });
    }
    try {
      const r = await prepareRevoke(client, kp, capId, vaultId, userAddress);
      return r;
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.post<{
    Body: { txBytes: string; userSig: string; sponsorSig: string };
  }>("/sponsor/revoke/submit", async (req, reply) => {
    const { txBytes, userSig, sponsorSig } = req.body ?? {};
    if (!txBytes || !userSig || !sponsorSig) {
      return reply
        .code(400)
        .send({ error: "txBytes, userSig, sponsorSig required" });
    }
    try {
      const r = await submitRevoke(client, { txBytes, userSig, sponsorSig });
      return r;
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  // ---- Intent parser (NL → DCAIntent JSON) ------------------------------
  // CLAUDE.md §7.2: the creator types a freeform sentence, OpenAI returns
  // strict JSON, we validate it against the Zod schema, browser previews it.
  app.post<{ Body: { text: string } }>("/intent/parse", async (req, reply) => {
    const text = req.body?.text?.trim();
    if (!text) return reply.code(400).send({ error: "text required" });
    if (text.length > 1000) {
      return reply.code(400).send({ error: "text too long" });
    }
    const r = await parseIntent(text);
    if (!r.ok) {
      return reply.code(422).send({ error: r.error, details: r.details });
    }
    return { intent: r.intent };
  });

  return app;
}
