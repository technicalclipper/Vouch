# Vouch

> Shareable links that grant an AI agent a bounded, revocable capability to act on your behalf — enforced by Move, onboarded via zkLogin, settled on Deepbook.

**Sui Hackathon submission · Agentic Web track · Sub-track 2 (Autonomous Agent Wallet)**

- 🌐 Live demo: https://vouch-brown.vercel.app
- 🎤 Pitch deck: https://vouch-brown.vercel.app/deck
- 📦 Move package (testnet): [`0x8b8c8e7e…592c5`](https://suiscan.xyz/testnet/object/0x8b8c8e7e3b0db9aac8dd4e5d0d4a6e610c927a9775dec3bb86b02f6318e592c5)

---

## What it is

The agentic web has a delegation problem: AI agents either need a human signature for everything (no autonomy) or hold unbounded keys (no safety). Vouch's answer is the **capability object** — a Move object that encodes exactly what an agent may do (asset, per-trade cap, schedule, pool scope, risk rules, expiry), enforced by the Sui type system at execution time, not by the agent's good behavior.

The core security property: **the agent never custodies funds.** Funds live in a `Vault` object. The agent only ever *proposes* PTBs that the capability accepts iff every assertion passes. If the agent's key leaks, the attacker can only execute the exact configured strategy within the exact cap — and the user revokes to close the window.

## Five non-negotiable invariants

1. The agent **cannot exceed the budget.** Enforced by Move `assert!`.
2. The agent **cannot trade outside the scoped pool.**
3. The agent **cannot act after revocation or expiry.** On revocation, remaining funds return to the funder atomically.
4. **Every action is logged on-chain** — including skips.
5. The recipient **never needs a seed phrase.** zkLogin (Google sign-in) end-to-end, gas sponsored.

## The v1 demo: delegated DCA

Alex writes *"$50 a week into SUI for 8 weeks, skip if SUI drops 5%+ in the last hour"* in plain English. An LLM compiles it to strict JSON. Alex funds the vault from their wallet and shares a link.

Mom opens the link → "Sign in with Google" → Sui address materializes in 4 seconds. The agent now executes the DCA on her behalf. Before every trade, it reads live Pyth prices and Deepbook orderbook depth. If risk rules trigger, the agent **skips with an LLM-generated reason logged on-chain**: *"SUI dropped 6.2% in the last hour, exceeding your 5% threshold; deferring this week's buy."*

Either party taps **Revoke** → the next execution reverts on chain, remaining USDC returns to Alex.

## Architecture

```
┌──────────────────┐   ┌────────────────────┐
│ Creator Frontend │   │ Recipient Frontend │
│ (wallet, intent) │   │ (zkLogin, dash)    │
└────────┬─────────┘   └─────────┬──────────┘
         │ wallet-signed PTB     │ Enoki-sponsored PTB
         ▼                       ▼
┌────────────────────────────────────────────────┐
│            SUI TESTNET (Move)                   │
│  vouch::capability — AgentCapability + asserts  │
│  vouch::vault      — friend-gated USDC custody  │
│  Deepbook v3       — real orderbook trades      │
└────────────────────────────────────────────────┘
         ▲                       ▲
         │ execution PTB         │ event queries
         │ (agent-signed)        │
┌────────┴────────────────────────────────────┐
│ Executor (off-chain, holds agent key)        │
│ - poll due caps every 30s                    │
│ - read Pyth + Deepbook depth                 │
│ - risk eval → execute or skip + LLM reason   │
└──────────────────────────────────────────────┘
```

**Trust boundary:** if the executor disappears or goes hostile, funds remain safe because every consequential action requires an on-chain assertion that catches the bad case.

## Repo layout

```
contracts/       Move package — vouch::capability, vouch::vault
executor/        Node/TS service — poll, risk, PTB build, sign, HTTP API
frontend/        Next.js 16 app — creator + recipient flows, deck
scripts/         CLI integration tests, lifecycle, DBUSDC seeders
shared/          config.ts — all chain addresses in one place
claude.md        Full project spec (read this first)
design.md        Visual system + UX spec
SUBMISSION.md    Hackathon submission copy
progress.md      Living build log
```

## Stack

- **Move** — capability + vault modules, deployed and upgraded on Sui testnet
- **Executor** — Fastify + tsx, ed25519 keypair signing, Pyth + Deepbook integration
- **Frontend** — Next.js 16, React 19, Tailwind v4, dapp-kit (wallet), self-hosted zkLogin
- **LLM** — OpenAI for intent parsing + skip-reason generation
- **Auth** — Google OAuth id_token → Mysten prover → Sui address; sponsored gas via Enoki

## Quick start

### 1. Move package

Already deployed to testnet. To redeploy:

```bash
cd contracts
sui client publish --gas-budget 200000000
# copy package ID into shared/config.ts → vouchPackageId + vouchPackageLatest
```

### 2. Executor

```bash
cd executor
cp .env.example .env
# fill AGENT_PRIVATE_KEY (suiprivkey1...), OPENAI_API_KEY
npm install
npm run dev      # http://localhost:8787
```

`POST /run-now/:capId` triggers immediate execution (demo affordance).
`GET /health` returns `{ ok, agent }`.

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# fill NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_ENOKI_API_KEY,
# NEXT_PUBLIC_EXECUTOR_URL (omit for localhost:8787)
npm install
npm run dev      # http://localhost:3000
```

### 4. Lifecycle smoke test

```bash
cd scripts
tsx lifecycle.ts   # create → activate → execute → skip → revoke
```

## On-chain artifacts (testnet)

| | Object ID |
|---|---|
| **Move package (latest)** | `0x8b8c8e7e3b0db9aac8dd4e5d0d4a6e610c927a9775dec3bb86b02f6318e592c5` |
| **Move package (original)** | `0xbb7d414c3f94da7efd1496f9c2c390662beca4e0eabea3831e15bc22ab2bcffd` |
| **UpgradeCap** | `0x7d45468c33732c137a6d52fc34e1f58d71e1c84170986b717032970fee453e7c` |
| **Deepbook pool (DBUSDC/SUI)** | `0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c` |
| **Agent address** | `0xeff48ffbc87d1fbbd6d12f25297502f1758981df2f886109f171dc605533ac21` |

## The pitch in one line

> **Capability objects are how AI agents get permission to act, and Sui — with first-class objects, atomic PTBs, and zkLogin — is where this composes naturally.**

DCA is the demo. The primitive is general: gifts, allowances, treasury sub-accounts, agent-to-agent commerce.

## License

MIT
