# Vouch — Submission Description

> Copy-paste-ready. Three variants: short (140 chars), medium (1 paragraph), long (full description).

---

## Short (tagline / 140 chars)

Vouch is a Sui delegation primitive: shareable links that grant an AI agent a bounded, revocable capability to act on your behalf — enforced by Move, not by the agent's good behavior.

---

## Medium (1 paragraph — for a "summary" field)

Vouch turns AI-agent delegation into a first-class Sui object. A user funds and configures a capability once, shares a link, and the recipient activates it with a Google login (zkLogin — no wallet, no seed phrase, no gas). An AI agent then executes on their behalf under hard on-chain limits: per-trade caps, total budget, pool scope, schedule, and risk rules — every assertion enforced by Move at execution time. Every action and every skipped action is logged on chain. Either party revokes in one tap, and remaining funds return to the funder atomically. The v1 demo is delegated DCA settled on Deepbook v3, but the primitive is general: gifts, allowances, treasury sub-accounts, agent-to-agent commerce.

---

## Long (full description field)

**Vouch is a delegation primitive on Sui: shareable links that grant an AI agent a bounded, revocable capability to execute financial actions on behalf of a non-crypto recipient — enforced by Move, onboarded via zkLogin, settled on Deepbook v3.**

### The problem

The agentic web has a delegation problem. AI agents that need to act on someone's behalf face a binary choice today: require a human signature for every action (no autonomy, no scale), or hold unbounded keys (no safety, no trust). Neither is acceptable. There is no clean primitive for *"this agent may do exactly this much, for exactly this long, and I can take it back instantly."*

### The solution

Vouch's answer is the **capability object** — a Move object that encodes exactly what an agent may do (asset, amount cap, schedule, pool scope, risk rules, expiry), enforced by the Sui type system at execution time, not by the agent's good behavior.

The architectural insight: **the agent never custodies funds.** Funds live in a `Vault` object. The agent only ever *proposes* a Programmable Transaction Block that the capability accepts if and only if every assertion passes. If the agent's key leaks, the attacker can only execute the exact configured strategy within the exact cap — and the user revokes to close the window.

### Five non-negotiable invariants (every assertion enforced by Move)

1. **The agent cannot exceed the budget.** Enforced by `assert!`, not by honesty.
2. **The agent cannot trade outside the scoped pool.** Pool ID must be in the capability's scope list.
3. **The agent cannot act after revocation or expiry.** A single flag causes every execution to abort.
4. **Every action is logged on-chain.** No execution exists without an event — including skips.
5. **The recipient never needs a seed phrase.** zkLogin (Google sign-in) start-to-finish, gas sponsored.

### The v1 demo: delegated DCA

A crypto-native user (Alex) wants to onboard a non-crypto recipient (their mom) to SUI. Alex writes natural language — *"$50 a week into SUI for the next two months, skip if SUI drops more than 5% in the last hour"* — which an LLM compiles into a strict JSON config. Alex funds the vault from their wallet and shares a link.

Mom opens the link, signs in with Google (4 seconds, no wallet install, no gas), and a Sui address materializes. The agent now executes the DCA on her behalf. Before every trade, the agent reads live Pyth oracle prices and Deepbook orderbook depth, evaluates the user's risk rules, and either executes the trade or skips with an LLM-generated one-sentence reason logged on-chain: *"SUI dropped 6.2% in the last hour, exceeding your 5% threshold; deferring this week's buy."*

Mom can tap **Revoke** anytime. The next execution attempt reverts on chain, remaining funds return to Alex atomically. The agent's authority is the capability object — without it, it cannot act.

### Why this is not a cron job

A cron buys regardless of conditions. Vouch's executor evaluates two independent risk rules every cycle: (a) Pyth price-drop over a configurable window, (b) Deepbook orderbook-depth-derived slippage estimate. When a rule triggers, the agent calls an LLM to generate a human-readable explanation and submits a `log_skip` transaction. The schedule advances, the slot is consumed, the budget is untouched, and the recipient sees *why* the agent paused in plain English.

### Why Sui

- **Capability objects** as first-class citizens — every other chain forces you to invent a custom contract per strategy.
- **Atomic PTBs** — assert → withdraw → trade → log in one transaction. Any failure reverts everything; the agent cannot half-execute.
- **zkLogin via Enoki** — Google sign-in to a Sui address in ~4 seconds, sponsored gas, no wallet install. The single most important onboarding unlock for non-crypto users.
- **Deepbook v3** — a real on-chain CLOB whose pre-trade depth our risk layer reads to estimate slippage. AMMs hide this in the curve. On-chain CLOBs are uneconomical elsewhere; Sui's throughput makes them viable.

### What's on chain

- **Move package (testnet):** `0x8b8c8e7e3b0db9aac8dd4e5d0d4a6e610c927a9775dec3bb86b02f6318e592c5` (latest, upgraded from original `0xbb7d414c3f94da7efd1496f9c2c390662beca4e0eabea3831e15bc22ab2bcffd`)
- **Modules:** `vouch::capability` (the capability object + assertions + events), `vouch::vault` (friend-gated USDC custody)
- **Events:** `CapabilityCreated`, `CapabilityActivated`, `ActionExecuted`, `ExecutionSkipped`, `CapabilityRevoked` — every dashboard view is reconstructed from these.
- **Trading venue:** Deepbook v3 testnet, DBUSDC/SUI pool `0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c`

### Stack

- **Move:** capability + vault modules, deployed and upgraded on Sui testnet
- **Executor (Node/TS):** Fastify HTTP server + 30s poll loop. Holds the agent ed25519 keypair. Reads Pyth + Deepbook depth, evaluates risk rules per capability, builds + signs + submits execution PTBs.
- **Frontend (Next.js 16 + Tailwind v4):** wallet-connect creator dashboard, zkLogin recipient flow, live chain reads via Sui RPC, warm-neobrutalist design system.
- **LLM:** OpenAI for both natural-language → intent JSON parsing and skip-reason generation.
- **Auth:** Self-hosted zkLogin (Google OAuth id_token → Mysten prover → Sui address), sponsored gas via Enoki.

### Beyond DCA

DCA is the demo. The primitive is general:
- **Allowances** — a teen's monthly budget with merchant-scope rules
- **Treasury sub-accounts** — a CFO grants their ops agent a bounded weekly spend
- **Recurring gifts** — a grandparent funds a recurring SUI gift
- **Agent-to-agent commerce** — agents granting each other bounded purchase authority

Capability objects are how AI agents get permission to act, and Sui — with first-class objects, atomic PTBs, and zkLogin — is where this composes naturally.

---

## Tech / Links

- **Track:** Agentic Web — Sub-track 2 (Autonomous Agent Wallet)
- **Network:** Sui testnet
- **Live demo:** https://vouch-brown.vercel.app
- **Pitch deck:** https://vouch-brown.vercel.app/deck
- **Repo:** https://github.com/technicalclipper/Vouch
- **Move package (latest):** https://suiscan.xyz/testnet/object/0x8b8c8e7e3b0db9aac8dd4e5d0d4a6e610c927a9775dec3bb86b02f6318e592c5
