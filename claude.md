# CLAUDE.md — Vouch

> Operating instructions and full build spec for the **Vouch** project.
> Read this entire file before writing any code. This is the source of truth.

---

## 0. What you are building

**Vouch is a delegation primitive on Sui: shareable links that grant an AI agent a bounded, revocable capability to execute financial actions on behalf of a non-crypto recipient — enforced by Move, onboarded via zkLogin, settled on Deepbook.**

The v1 demo use case is **delegated DCA** (dollar-cost averaging): a crypto-native user funds and configures a recurring SUI purchase for a non-crypto recipient, who activates it with a Google login. An AI agent executes the strategy autonomously under hard on-chain limits, can defer based on market conditions, logs everything on-chain, and is revocable by either party at any time.

This is a hackathon submission for the **Sui "Agentic Web" track, Sub-track 2 (Autonomous Agent Wallet)**. Secondary fit: **DeFi & Payments track**.

### The one-sentence thesis
The agentic web has a delegation problem: agents either need a human signature for everything (no autonomy) or get unbounded keys (no safety). Vouch's answer is the **capability object** — a Move object that encodes exactly what an agent may do, enforced by the type system at execution time, not by the agent's good behavior.

---

## 1. Non-negotiable invariants

The whole system exists to make these five things provably true. If any becomes false, the project is broken. Every design decision defers to these.

1. **The agent cannot exceed the budget.** Enforced by a Move `assert!`, not by agent honesty. A trade exceeding the per-execution cap or remaining budget aborts the transaction.
2. **The agent cannot trade outside the scoped pool.** Pool ID must be in the capability's scope list, or the transaction aborts.
3. **The agent cannot act after revocation or expiry.** The `revoked` flag or expired timestamp causes every execution to abort. On revocation, remaining funds return to the funder.
4. **Every action is logged on-chain.** No execution exists that does not emit an event. This includes skips.
5. **The recipient never needs a seed phrase.** zkLogin (Google sign-in) from start to finish. The recipient never installs a wallet, never sees a mnemonic, never sources gas (gas is sponsored via Enoki).

The core security property: **the agent never custodies funds.** Funds live in a `Vault` object. The agent only ever *proposes* PTBs that the capability accepts if and only if every assertion passes. If the agent's key leaks, the attacker can only execute the exact configured strategy within the exact cap — and the user revokes to close the window.

---

## 2. Target environment

- **Chain:** Sui **testnet** (not mainnet). All trades are real on-chain Deepbook orders against testnet pools using testnet tokens. We trade fake money with real code.
- **Trading venue:** Deepbook **v3** (NOT v2 — the API differs significantly; reject any code sample that doesn't reference `BalanceManager`).
- **Oracle:** Pyth on Sui testnet (with a demo-mode override for reliable demos).
- **zkLogin + sponsored gas:** **Enoki** (Mysten's hosted service). Do not self-host salt management.
- **LLM:** Anthropic Claude or OpenAI (commodity; pick one and abstract behind an interface).

### Critical environment gotchas (read before building)
- Deepbook v3 testnet has a **different package ID** than mainnet. So does testnet USDC, so does DEEP.
- Multiple "USDC" tokens exist on testnet. Use the **exact coin type that the target Deepbook pool uses**, found in the pool config. Wrong type = wrong `Coin<T>` = won't compile/execute.
- Deepbook v3 charges fees in **DEEP**. You need testnet DEEP in the BalanceManager or whitelisted-pool handling.
- Testnet pool **liquidity is thin or empty**. Plan to **seed liquidity** with a second maker wallet posting limit orders on both sides before any demo.
- Testnet Pyth feeds can be **stale or flat**. Implement a **demo-mode price override** so the risk-skip behavior is reliably demonstrable.
- **All chain addresses must be configurable from a single config file.** Never hardcode package/pool/token IDs across the codebase. This is the #1 time-sink to avoid.

---

## 3. System architecture

Five components. Clear ownership, clear boundaries.

```
┌────────────────────┐         ┌──────────────────────┐
│ Creator Frontend   │         │ Recipient Frontend   │
│ (Alex, has wallet) │         │ (Mom, zkLogin only)  │
│ - NL intent input  │         │ - Activation page    │
│ - LLM parse        │         │ - zkLogin via Enoki  │
│ - preview + create │         │ - Dashboard + log    │
│ - link generation  │         │ - Revoke button      │
└─────────┬──────────┘         └──────────┬───────────┘
          │ PTB (wallet-signed)           │ PTB (Enoki-sponsored)
          ▼                               ▼
┌──────────────────────────────────────────────────────┐
│                  SUI TESTNET (Move)                    │
│  vouch::capability  — AgentCapability object + asserts │
│  vouch::vault       — Vault holding Coin<USDC>         │
│  vouch::registry    — events / discovery               │
│  Deepbook v3        — real orderbook trades            │
└──────────────────────────────────────────────────────┘
          ▲                               ▲
          │ execution PTB (agent-signed)  │ event queries
          │                               │
┌─────────┴───────────────────────────────────────────┐
│ Executor Backend (off-chain, holds agent key)        │
│ - poll for due capabilities                          │
│ - fetch Pyth price + Deepbook depth                  │
│ - evaluate risk rules → execute OR skip              │
│ - build + sign + submit PTBs                         │
│ - LLM call for human-readable skip reasoning         │
└──────────────────────────────────────────────────────┘
```

### On-chain vs off-chain split (the trust boundary)
- **On-chain (trust this):** capability rules + state, vault funds, all assertions, all events, revocation.
- **Off-chain (trust nothing):** scheduling, oracle fetching, risk evaluation, PTB construction, LLM calls, notifications.
- **Principle:** if the executor disappears, goes hostile, or runs duplicates, **funds remain safe** because every consequential action requires an on-chain assertion that catches the bad case.

---

## 4. The Move layer (build this first)

Three modules. Implement and deploy these before anything else; everything depends on stable interfaces.

### 4.1 `vouch::capability`

```move
module vouch::capability {
    // Core object — owned by the recipient after activation.
    struct AgentCapability has key {
        id: UID,
        owner: address,              // recipient (zkLogin addr); zero until activation
        funder: address,             // creator; can also revoke
        agent_pubkey: address,       // the executor address allowed to call execute fns
        vault_id: ID,                // linked Vault object
        action_type: u8,             // 0 = dca_buy (only one implemented in v1)
        budget_total: u64,
        budget_remaining: u64,
        per_execution_cap: u64,
        asset_in: TypeName,          // USDC
        asset_out: TypeName,         // SUI
        pool_scope: vector<ID>,      // allowed Deepbook pool IDs
        schedule: Schedule,
        risk_rules: vector<RiskRule>,
        executions_done: u64,
        executions_max: u64,
        expires_at: u64,             // ms epoch
        revoked: bool,
        activation_token_hash: vector<u8>, // hash of one-time token; cleared on activate
        active: bool,                // false until activated
    }

    struct Schedule has store, copy, drop {
        interval_ms: u64,
        next_execution_at: u64,      // ms epoch
    }

    struct RiskRule has store, copy, drop {
        rule_type: u8,               // 0 = price_drop, 1 = slippage_cap
        threshold_bps: u64,          // e.g. 500 = 5%
        window_ms: u64,              // for price_drop window
    }

    // --- Events (the on-chain activity log) ---
    struct CapabilityCreated has copy, drop { cap_id: ID, funder: address, budget_total: u64 }
    struct CapabilityActivated has copy, drop { cap_id: ID, owner: address }
    struct ActionExecuted has copy, drop {
        cap_id: ID, amount_in: u64, amount_out: u64, price_x18: u128,
        executions_done: u64, budget_remaining: u64, timestamp: u64
    }
    struct ExecutionSkipped has copy, drop { cap_id: ID, reason: vector<u8>, timestamp: u64 }
    struct CapabilityRevoked has copy, drop { cap_id: ID, revoked_by: address }

    // --- Lifecycle ---
    // Called by creator inside the create PTB. Capability starts inactive.
    public fun create_pending(/* config fields */, vault_id: ID, token_hash: vector<u8>, ctx: &mut TxContext): AgentCapability;

    // Called by recipient inside the activation PTB (Enoki-sponsored).
    // Verifies token, sets owner = sender, binds agent_pubkey, sets active = true, sets expires_at.
    public entry fun activate(cap: &mut AgentCapability, token: vector<u8>, agent_pubkey: address, clock: &Clock, ctx: &TxContext);

    // --- Execution guards (agent MUST call these; they revert on violation) ---
    public fun assert_executable(cap: &AgentCapability, clock: &Clock, ctx: &TxContext) {
        // assert sender == agent_pubkey
        // assert active && !revoked
        // assert now < expires_at
        // assert now >= schedule.next_execution_at
        // assert executions_done < executions_max
    }
    public fun reserve_budget(cap: &mut AgentCapability, amount: u64) {
        // assert amount <= per_execution_cap
        // assert amount <= budget_remaining
        // budget_remaining -= amount
    }
    public fun assert_pool_in_scope(cap: &AgentCapability, pool_id: ID) {
        // assert vector::contains(&pool_scope, &pool_id)
    }

    // --- Logging (advances schedule, increments counters, emits events) ---
    public fun log_action(cap: &mut AgentCapability, amount_in: u64, amount_out: u64, price_x18: u128, clock: &Clock);
    public fun log_skip(cap: &mut AgentCapability, reason: vector<u8>, clock: &Clock);
        // advances schedule, increments executions_done, does NOT touch budget

    // --- Revocation (owner or funder only) ---
    public entry fun revoke(cap: &mut AgentCapability, ctx: &TxContext);
        // assert sender == owner || sender == funder; set revoked = true; emit event
        // (vault refund handled in same PTB via vault::refund)
}
```

**Error codes** (use named constants): `ECapabilityRevoked`, `ECapabilityExpired`, `ETooEarly`, `EMaxExecutionsReached`, `EExceedsPerExecCap`, `EInsufficientBudget`, `EPoolNotInScope`, `EUnauthorized`, `ENotActive`, `EBadToken`, `EWrongAgent`.

### 4.2 `vouch::vault`

```move
module vouch::vault {
    struct Vault has key {
        id: UID,
        funder: address,
        balance: Balance<USDC>,      // use the EXACT testnet USDC type from the pool
    }

    public fun create_vault(c: Coin<USDC>, ctx: &mut TxContext): (Vault, ID);
    // Withdraw is gated: only callable within an execution PTB that has passed capability asserts.
    // Enforce by requiring a &mut AgentCapability proof OR by making withdraw a friend-only fn.
    public fun withdraw(vault: &mut Vault, amount: u64, ctx: &mut TxContext): Coin<USDC>;
    public entry fun refund(vault: &mut Vault, ctx: &TxContext);
        // returns all remaining balance to funder; called on revoke/complete
}
```

> Design note: prevent the vault from being drainable independently of a valid capability.
> Options: (a) `public(friend)` withdraw callable only by `capability` module, or (b) pass `&AgentCapability`
> into withdraw and re-assert. Pick (a) for cleanliness. Document the choice in progress.md.

### 4.3 `vouch::registry` (optional but recommended)
Thin module emitting discovery events so the executor can index active capabilities without scanning all objects. If time-constrained, skip and have the executor track capability IDs from creation events.

### Move build/test requirements
- `Move.toml` uses a `[addresses]` block with named addresses; never hardcode.
- Write CLI integration test scripts (TypeScript via SDK, or `sui client` calls) that exercise: create → activate → execute → skip → revoke. These double as the executor's reference implementation.
- Deploy to testnet, record all object/package IDs into `config.ts` (see §8).

---

## 5. The Executor backend (build second)

A persistent Node/TypeScript service holding the **agent keypair**.

### Responsibilities
1. **Poll loop** (e.g. every 30s): query Sui for capabilities where `agent_pubkey == ours && active && !revoked`, find those where `now >= next_execution_at`.
2. **Risk evaluation** per due capability (see §6).
3. **Execute** (build + sign + submit the execution PTB) OR **skip** (submit a `log_skip` tx with an LLM-generated reason).
4. **Demo affordance:** expose a `POST /run-now/:capId` endpoint so the demo can trigger an execution on command rather than waiting for the schedule. Be transparent this is a demo convenience.

### The execution PTB (the heart of the system)
```
PTB execute_dca(cap, vault, pool, balanceManager):
  1. capability::assert_executable(cap, clock)          // reverts if not allowed
  2. capability::reserve_budget(cap, amount)            // reverts if over cap/budget
  3. capability::assert_pool_in_scope(cap, pool_id)     // reverts if wrong pool
  4. usdc = vault::withdraw(vault, amount)              // friend-gated
  5. deepbook::balance_manager::deposit(bm, usdc)
  6. (sui_out, _) = deepbook::pool::place_market_order(pool, bm, BUY, amount, ...)
  7. sui_coin = deepbook::balance_manager::withdraw_all(bm)
  8. transfer::public_transfer(sui_coin, cap.owner)
  9. capability::log_action(cap, amount, sui_amount, price, clock)  // emits ActionExecuted
```
Atomic. Any failure reverts everything. The agent cannot half-execute.

### Tech notes
- Use `@mysten/sui` SDK `Transaction` builder.
- Sign with the agent keypair (env var, never committed).
- Handle Deepbook v3 `BalanceManager` lifecycle correctly (deposit/withdraw, DEEP fees).
- Abstract the LLM behind a `generateSkipReason(rule, marketData, originalIntent)` interface.

---

## 6. The risk layer (build third — the differentiator)

This is what makes the project NOT a cron job. It MUST be real and MUST be demoable live.

### Two independent rule types, each able to BLOCK execution
1. **Price-drop rule** (Pyth): fetch SUI/USD at `now` and `now - window`. If pct change < `-threshold`, the rule triggers → skip.
2. **Slippage-cap rule** (Deepbook): read the target pool's orderbook depth, estimate execution price for the trade size, compute slippage vs. mid. If estimated slippage > threshold, the rule triggers → skip.

### On skip
- Call the LLM with the triggered rule + market data + the user's original natural-language intent.
- Generate a one-sentence human-readable reason, e.g. *"SUI dropped 6.2% in the last hour, exceeding your 5% threshold; deferring this week's buy."*
- Submit `capability::log_skip(cap, reason)`. This emits `ExecutionSkipped`, advances the schedule, consumes the slot, leaves budget untouched.

### Demo-mode price override
- Provide an env/flag override that injects a synthetic price (or synthetic prior price) so the skip path fires reliably on demand during the demo.
- Be transparent in the pitch: *"For the demo we simulate a price drop; the same code reads live Pyth in production."*

> The LLM-generated reason MUST be a real model call, not an f-string template. The difference is small in code, large in the pitch ("the agent explains itself"). Keep the call tiny and out of the hot path.

---

## 7. The frontends (build fourth)

> **Platform: DESKTOP ONLY.** Both frontends are desktop web apps — there is no mobile/phone build. The recipient app is a centered narrow column on a desktop page; the creator app is a wider desktop layout. See DESIGN.md for the full UI/UX spec (warm neobrutalism). For the demo, the recipient flow runs in a separate desktop browser window/profile, not a phone.

### 7.1 Recipient Frontend (higher priority — owns the demo's "wow")
- Reads activation token from URL (`/c/:token`), queries the capability, renders a plain-English summary.
- **"Sign in with Google to activate"** → Enoki zkLogin flow → Sui address derived (~4s, no wallet install).
- Activation: Enoki-**sponsored** PTB calling `capability::activate`. Recipient pays no gas.
- **Dashboard:** budget remaining, next execution countdown, activity log (rendered from `ActionExecuted` / `ExecutionSkipped` events), big **Revoke** button.

### 7.2 Creator Frontend
- Connect Sui wallet (Suiet / Sui Wallet via wallet adapter).
- Single NL text input → LLM intent compiler → structured JSON validated against a strict schema (Zod).
- Preview card showing the parsed config in plain English; user confirms.
- Create PTB: `vault::create_vault` + `capability::create_pending` + emit creation event. Wallet-signed.
- Generate shareable link + QR. Creator dashboard mirrors the activity log; creator can also revoke.

### Intent schema (LLM output target)
```json
{
  "action": "dca_buy",
  "asset_in": "USDC",
  "asset_out": "SUI",
  "amount_per_execution": 50,
  "frequency": "weekly",
  "day_of_week": "monday",
  "total_executions": 8,
  "risk_rules": [
    { "type": "price_drop", "window_hours": 1, "threshold_pct": -5 },
    { "type": "slippage_cap", "threshold_pct": 1 }
  ],
  "expires_in_days": 56
}
```
- System prompt must force JSON-only output, no prose, no markdown fences.
- Validate against schema; on failure, retry with a clarifying prompt.

---

## 8. Configuration (do this on day 0)

Single source of truth. Example `config.ts`:
```ts
export const CONFIG = {
  network: "testnet",
  rpcUrl: "https://fullnode.testnet.sui.io",
  vouchPackageId: "0x...",      // filled after deploy
  deepbook: {
    packageId: "0x...",          // v3 testnet
    usdcSuiPoolId: "0x...",
    usdcType: "0x...::usdc::USDC",// EXACT type the pool uses
    suiType: "0x2::sui::SUI",
    deepType: "0x...::deep::DEEP",
  },
  pyth: { suiUsdFeedId: "0x...", endpoint: "https://..." },
  enoki: { apiKey: process.env.ENOKI_API_KEY },
  agent: { address: "0x...", keypairEnv: "AGENT_PRIVATE_KEY" },
  demoMode: { forcePriceDrop: false, syntheticPriceUsd: null },
};
```
All chain-specific values come from here. No exceptions.

---

## 9. Build order (with stop points)

Each stage is independently demoable. Stop where time runs out; what you have works.

**Stage 0 — Kill the unknowns (day 0, 4–6h):**
Read docs. Get testnet SUI/USDC/DEEP. Find Deepbook v3 testnet package + pool IDs + exact USDC type. Place ONE manual Deepbook market order via a script. Set up Enoki, get an API key, render a throwaway "sign in with Google → show address" page. Confirm Pyth SUI/USD feed returns sane data. Fill `config.ts`.

**Stage 1 — Move spine (sets up everything):**
`capability` + `vault` modules, deployed to testnet, with CLI integration tests for create/activate/execute/skip/revoke.

**Stage 2 — Executor (proves end-to-end on-chain):**
Polling, due-detection, execution PTB construction, agent signing. Place ONE real testnet Deepbook trade from the executor end-to-end.

**Stage 3 — Recipient flow (the demo moment):**
Enoki zkLogin activation + dashboard reading events. Full loop: create (via script) → activate (zkLogin) → execute → revoke.

**Stage 4 — Risk layer (the differentiator):**
Pyth + Deepbook depth rules, skip transactions, LLM skip reasons, demo-mode price override.

**Stage 5 — Creator frontend (polish):**
NL intent parsing, preview, link generation, creator dashboard, refund-on-revoke wiring.

**Stage 6 — Bonus (only if everything above ships):**
Capability templates ("Recipes"), Walrus storage for reasoning logs, multi-recipient, notifications.

### What you can drop and still satisfy Sub-track 2 (in drop order)
1. Intent-parsing LLM call → replace with a form
2. LLM skip reasons → templated strings
3. Live Pyth → mocked price source
4. Creator dashboard → creation via script

### What you CANNOT drop (these ARE the project)
- Capability Move object with working assertions
- Executor placing REAL Deepbook orders
- zkLogin activation flow
- Live revocation demo (execution reverting on-chain after revoke)
- Activity log readable on the recipient dashboard

---

## 10. The demo (build TO this; reverse-engineer from it)

90 seconds, six tentpole moments, one closing line.
1. **(0:00)** Creator dashboard empty. "This is the creator side."
2. **(0:10)** Type NL intent → parsed preview → create → link.
3. **(0:25)** Second browser window (the recipient): open link → "Sign in with Google" → address materializes (no wallet) → activate.
4. **(0:50)** Trigger executor → show tx on explorer → Deepbook order filled → dashboard updates. "This trade was placed by an AI agent under hard on-chain limits."
5. **(1:10)** Toggle simulated price drop → trigger → agent SKIPS → reason logged in plain English. "Not a schedule — it reads market state and decides."
6. **(1:30)** Tap Revoke → trigger execution → tx FAILS on-chain → vault refunds to creator. "The agent's authority is the capability object; without it, it can't act."
7. **(1:45)** Close: "DCA is the demo. The primitive is general — gifts, allowances, treasury sub-accounts, agent-to-agent commerce. Capability objects are how AI agents get permission to act, and Sui is where this composes naturally."

### Demo survival rules
- Record a backup video the night before.
- Never demo on conference WiFi; hotspot.
- Have local fallbacks for every network call.
- The three moments that MUST land: zkLogin onboarding, risk skip with reason, revocation killing the agent.

---

## 11. Defensive answers (internalize these)

- **"Couldn't this be a cron job?"** → Execution is gated by a schedule AND a live risk evaluator (orderbook depth + oracle price). A cron buys regardless; ours buys iff risk rules pass and writes the reason on-chain when they don't. Plus the primitive is bounded delegation, not DCA specifically — the agent could be any strategy.
- **"What if the agent key is compromised?"** → Capability bounds the blast radius: attacker can only run the exact configured strategy within the exact cap. User revokes to close the window. Funds never leave the vault except via a passing assertion.
- **"Why Sui not Ethereum?"** → First-class capability objects (vs. a custom contract per strategy on EVM); atomic PTBs (assert→withdraw→trade→log); zkLogin onboarding in 4s with no extension. Sui makes it natural; EVM makes it possible.
- **"Why Deepbook?"** → Track requires it; and the CLOB gives pre-trade depth our risk layer reads to estimate slippage (an AMM hides this in the curve). On-chain CLOBs are uneconomical elsewhere; Sui's throughput makes them viable.
- **"How does the recipient get USDC?"** → They don't. The funder pre-deposits. The recipient only receives SUI. Non-crypto users can't source stablecoins but can absolutely receive value.
- **"Testnet or real?"** → Real Deepbook orders on real testnet pools; same code points at mainnet via config. We trade fake money with real code.

---

## 12. Coding conventions & guardrails

- **TypeScript** for executor + frontends; **Move** for contracts.
- All chain addresses from `config.ts` / `Move.toml` named addresses. NEVER hardcode inline.
- Secrets (agent key, Enoki key, LLM key) via env vars; never commit.
- Deepbook = **v3 only**. If a snippet lacks `BalanceManager`, it's v2 — discard it.
- Agree Move module signatures BEFORE frontend work; frontends mock against fixed interfaces. Don't change signatures after Stage 2 without a team sync.
- Validate every LLM output against a schema before use.
- Prefer one task (DCA) done perfectly over many tasks done partially. `action_type` enum is wired for future strategies but only `dca_buy` is implemented.
- Build the day-0 throwaway transaction BEFORE the real project. Do not skip it.

---

## 13. Repo layout (suggested)

```
/contracts            Move package (capability, vault, registry) + Move.toml
/executor             Node/TS executor service (poll, risk, PTB build, sign)
/web-creator          Creator frontend (wallet connect, intent, create, link)
/web-recipient        Recipient frontend (zkLogin activate, dashboard, revoke)
/shared               config.ts, types, intent schema, ABI helpers
/scripts              day-0 throwaway tx, liquidity seeder, CLI integration tests
CLAUDE.md             this file
progress.md           living progress log (see §14)
```

---

## 14. PROGRESS TRACKING — MANDATORY

**At every working session, you MUST maintain `progress.md` in the repo root.**

Whatever you plan or do — before you start a task, while you work, and when you finish — record full context in `progress.md` so that you (or any other agent or teammate) can resume with zero loss of context. Specifically:

1. **Before starting work:** write down what you are about to do and why, and which part of this spec it maps to (e.g. "Stage 1 — capability module assertions").
2. **As you work:** note key decisions and their rationale (e.g. "chose `public(friend)` withdraw over passing `&AgentCapability` because…"), any addresses/IDs discovered, and any deviations from this spec.
3. **When you finish a task:** mark it done with a one-line summary of what now works and how it was verified (which test, which tx hash on testnet).
4. **Always keep three live sections up to date:**
   - `## Done` — completed tasks, each with verification evidence.
   - `## In progress` — what is currently being worked on, current state, next concrete step.
   - `## Not yet started` — remaining tasks from the build order in §9, with any blockers noted.
5. **Record blockers and unknowns explicitly** (e.g. "testnet USDC type still unconfirmed", "Deepbook pool has no liquidity — need seeder"), so they are never silently lost.
6. **Never let `progress.md` go stale.** If you do anything that changes the state of the project, update it in the same session. Treat updating `progress.md` as part of the task, not an afterthought.

If `progress.md` does not exist yet, create it at the start of your first session using the section structure above, seeded from the build order in §9.