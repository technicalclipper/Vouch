// SPDX-License-Identifier: Apache-2.0
//
// Capability discovery + load helpers.
//
// `loadCap(client, capId)` reads a single AgentCapability shared object and
// returns the off-chain fields the executor needs to build PTBs.
//
// `findDueCaps(client, agentAddress)` walks `CapabilityCreated` events from
// the deployed package, fetches each cap object, and filters down to the
// ones owned by *this* agent and currently due for execution.

import type { SuiClient } from "@mysten/sui/client";

import { CONFIG } from "../../shared/config.ts";

const PKG = CONFIG.vouchPackageId;

export interface CapState {
  capId: string;
  vaultId: string;
  owner: string;
  funder: string;
  agentPubkey: string;
  actionType: number;
  budgetTotal: bigint;
  budgetRemaining: bigint;
  perExecutionCap: bigint;
  poolScope: string[];
  executionsDone: bigint;
  executionsMax: bigint;
  nextExecutionAt: bigint;
  intervalMs: bigint;
  expiresAt: bigint;
  active: boolean;
  revoked: boolean;
}

export async function loadCap(
  client: SuiClient,
  capId: string,
): Promise<CapState> {
  const obj = await client.getObject({
    id: capId,
    options: { showContent: true, showType: true },
  });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") {
    throw new Error(`cap ${capId} not found or not a Move object`);
  }
  if (!content.type.endsWith("::capability::AgentCapability")) {
    throw new Error(`cap ${capId} has wrong type: ${content.type}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f: any = content.fields;
  return {
    capId,
    vaultId: f.vault_id,
    owner: f.owner,
    funder: f.funder,
    agentPubkey: f.agent_pubkey,
    actionType: Number(f.action_type),
    budgetTotal: BigInt(f.budget_total),
    budgetRemaining: BigInt(f.budget_remaining),
    perExecutionCap: BigInt(f.per_execution_cap),
    poolScope: f.pool_scope as string[],
    executionsDone: BigInt(f.executions_done),
    executionsMax: BigInt(f.executions_max),
    nextExecutionAt: BigInt(f.schedule.fields.next_execution_at),
    intervalMs: BigInt(f.schedule.fields.interval_ms),
    expiresAt: BigInt(f.expires_at),
    active: !!f.active,
    revoked: !!f.revoked,
  };
}

/** A capability is "executable now" if every assert_executable precondition holds. */
export function isDue(cap: CapState, now: bigint = BigInt(Date.now())): boolean {
  return (
    cap.active &&
    !cap.revoked &&
    now < cap.expiresAt &&
    now >= cap.nextExecutionAt &&
    cap.executionsDone < cap.executionsMax
  );
}

/**
 * Find every capability ever created by our package, filter to ones bound to
 * this agent and currently due. O(n) over all capabilities; fine for the
 * hackathon scale. Later: add a `registry` module or per-agent index.
 */
export async function findDueCaps(
  client: SuiClient,
  agentAddress: string,
): Promise<CapState[]> {
  const eventType = `${PKG}::capability::CapabilityCreated`;
  const ids = new Set<string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = null;
  for (let page = 0; page < 20; page++) {
    const res = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: 50,
      order: "descending",
    });
    for (const ev of res.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pj: any = ev.parsedJson;
      if (pj?.cap_id) ids.add(pj.cap_id as string);
    }
    if (!res.hasNextPage) break;
    cursor = res.nextCursor;
  }

  const due: CapState[] = [];
  for (const id of ids) {
    try {
      const cap = await loadCap(client, id);
      if (cap.agentPubkey !== agentAddress) continue;
      if (isDue(cap)) due.push(cap);
    } catch {
      // Skip caps we can't read (object may have been wrapped/deleted).
    }
  }
  return due;
}
