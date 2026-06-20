// SPDX-License-Identifier: Apache-2.0
//
// Stage 3 sanity page. Reads our seeded testnet capability live and
// renders the raw projected shape so we can confirm the chain layer
// works before swapping the real recipient/creator pages over.

"use client";

import { useState } from "react";

import { useChainCapabilityById } from "../../_lib/useChainCapability";

// Cap seeded for executor testing (scripts/dca-seed.ts run).
const DEFAULT_CAP =
  "0xd61dcc6d2fdbb047f7e7dba17dec374d4f7f092f30ce21a0f936f9046e9da1d0";

export default function ChainDevPage() {
  const [capId, setCapId] = useState(DEFAULT_CAP);
  const { cap, ready } = useChainCapabilityById(capId);

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10 font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">chain reads — dev</h1>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 border border-ink/40 px-2 py-1 rounded"
          value={capId}
          onChange={(e) => setCapId(e.target.value.trim())}
          spellCheck={false}
        />
      </div>
      {!ready && <p>loading…</p>}
      {ready && !cap && <p>not found</p>}
      {cap && (
        <pre className="whitespace-pre-wrap break-all bg-soft/40 p-3 rounded border border-ink/20">
          {JSON.stringify(cap, null, 2)}
        </pre>
      )}
    </div>
  );
}
