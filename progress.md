# Vouch — Progress Log

> Living log per CLAUDE.md §14. Update every session.

---

## Project-wide decisions

- **Monorepo layout deviation:** spec calls for separate `/web-creator` and `/web-recipient` (CLAUDE.md §13). Currently using a single `frontend/` Next.js 16 app. Rationale: shared design tokens + components, single dev server, faster path to demo. Can split later if needed.
- **Platform = desktop-only for both flows** (per the updated DESIGN.md §2, §5, §9). Recipient = centered ~520px column on a desktop page; creator = wider desktop layout. The recipient page wrapper has been updated from `max-w-[480px]` to `max-w-[520px]` and the vertical padding bumped for desktop framing.
- **Frontend stack:** Next.js 16 + React 19 + Tailwind v4 (existing scaffold). Tokens defined as CSS variables per DESIGN.md §3; components handwritten per §4.
- **Move package directory created at `contracts/`** (deviation from CLAUDE.md §13 which suggests `/contracts` — same thing, just relative to repo root).
- **zkLogin: self-hosted, not Enoki** (deviation from CLAUDE.md §2 which says "Enoki (Mysten's hosted service). Do not self-host salt management."). We talk to Google directly via the OAuth implicit / id_token flow (`NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local`, no client secret), generate the ephemeral key + nonce client-side, call Mysten's zkLogin prover for the ZK proof, and derive the Sui address ourselves. Sponsored gas for activation will need a separate path (likely a backend-signed sponsor tx) since we don't get Enoki's sponsorship for free. Salt handling: TBD (either local-deterministic from `sub` for demo simplicity, or a tiny salt service).

---

## Done

### Stage F1 — Frontend design system + mocked screens ✅
- **Design tokens (DESIGN.md §3) in `app/globals.css`:** warm-neobrutalist palette (`--bg`, `--surface`, `--ink`, `--accent`, `--accent-2`, `--warn`, `--danger`, `--muted`, `--soft`), hard-offset shadows (`--shadow`, `--shadow-lg`, `--shadow-press`), 12px radius, 2.5px borders. Mapped into Tailwind v4 `@theme inline` so utilities like `bg-accent`, `text-ink` work. Added `nb-border`, `nb-shadow`, `nb-pressable`, `nb-focus` utilities.
- **Fonts (DESIGN.md §3 typography):** Bricolage Grotesque (display) + Inter (body) loaded via `next/font/google` in `app/layout.tsx`. Recipient flow scoped to 18px base via `[data-flow="recipient"]`; creator flow 15px.
- **Core components in `app/_components/`:** `Button` (primary/success/danger/ghost + press feedback), `Card` (default + hero shadow), `StatusPill` (mapped to all `CapabilityStatus` values), `ActivityItem` (icon + plain-language event row), `BigNumber` (hero figure), `CountdownChip`, `Toast` + `ToastHost`, `Modal`, `useCapabilityByToken` / `useCapabilityById` hooks.
- **Mock state layer in `app/_lib/`:** `types.ts` mirrors CLAUDE.md §4.1 `AgentCapability`; `mockStore.ts` is a localStorage-backed store with seed data (one active capability `cap_demo_1` at `/c/demo`, one pending `cap_pending_1` at `/c/pending`) plus `activate`, `revoke`, `runNow`, `createCapability`, `subscribe`, `resetAll`; `format.ts` has mom-test-friendly formatters and `describeIntent`.
- **Recipient flow (DESIGN.md §5 R1–R4) at `/c/[token]`:**
  - R1 activation landing: sender name + plain-English summary + 🔒 reassurance row + single "Sign in with Google" button.
  - R2 post-sign-in: friendly confirmation + restated summary + "Turn it on" success button + ghost "Not now".
  - R3 dashboard: status pill, hero card with SUI bought + budget used, countdown chip, activity log, demo controls (Run now / Run with simulated drop), bottom "Stop anytime" button (ghost-red, requires confirm).
  - R4 stop confirmation: modal with "Keep it going" defaulted, "Yes, stop" destructive.
- **Creator flow (DESIGN.md §5 C1–C3):**
  - C1 `/create`: NL textarea with example chips + stub heuristic parser (placeholder for Stage 5 LLM call), editable preview card, funder name + recipient nickname fields, risk-rule pills, total-deposit callout, "Create link" CTA.
  - C2 `/create/share/[id]`: hero card with the share URL + external QR (via `api.qrserver.com` — note: external dependency, swap for a local QR lib later), copy-link + preview-as-recipient buttons.
  - C3 `/dashboard` (list) + `/dashboard/[id]` (drill-in): mirrored activity view, rules summary, demo controls, revoke confirm modal.
- **Dev landing (`/`):** replaces Next.js boilerplate; two cards (Recipient / Creator) with deeplinks into both seed capabilities and a "Reset mock data" button.

**Verification:**
- `./node_modules/.bin/tsc --noEmit` — clean.
- `npm run build` — clean; six routes resolved (`/`, `/c/[token]`, `/create`, `/create/share/[id]`, `/dashboard`, `/dashboard/[id]`).
- Pre-existing `npm-debug.log` from the prior broken-npm session deleted.

### Stage 0 — Kill the unknowns ✅
- Deepbook v3 testnet IDs + types confirmed against `@mysten/deepbook-v3` SDK v1.5.1 constants. Recorded in `shared/config.ts`.
- BalanceManager created and shared: `0xfec1aab79f151bbff6a225cb54c5299ce5821e59124f655119f7c14083abdad7` (tx `4dhH1NLTuqYTveQWjGonR5DGdFJck1XQatyjksSp6aho`).
- **DBUSDC arrived** (1000 DBUSDC at the agent address `0xeff48ffbc87d1fbbd6d12f25297502f1758981df2f886109f171dc605533ac21`). The Tally form had initially returned the wrong mock (`0xe95040…::dusdc::DUSDC`, a Deepbook-Predict token); DBUSDC matching the v3 pool type (`0xf7152c05…::DBUSDC::DBUSDC`) was delivered later.
- **Real Deepbook v3 market BUY on SUI_DBUSDC executed end-to-end**: tx `FL3ZZxDYN4T83gzzC1LUCbdJR4Kb2obcrTfgXwn7T5L1`. 1 SUI acquired at 0.71225 DBUSDC/SUI; matched a real maker (`0x64fcc8…`); `OrderFullyFilled`. Fees in input coin (`payWithDeep=false`) — DEEP never needed for fees. This kills the last critical unknown.
- Pool params read live and pinned in `scripts/deepbook-smoke.ts`: SUI_DBUSDC `lot_size=0.1 SUI`, `min_size=1 SUI`, `tick_size=10` quote units. The lifecycle/executor must respect these → per-execution min for the demo DCA is 1 SUI worth.
- Pyth feed sanity-check + Enoki API key remain open (Stage 4 / Stage 3 respectively).

### Stage 2 — Executor backend ✅ (real Deepbook trade gated by Move capability assertions)

**Scaffold (`executor/`):**
- `package.json`, `tsconfig.json` (NodeNext, `allowImportingTsExtensions`, includes `../shared/**/*.ts`), `.env.example`, `.gitignore` (`.env` excluded).
- `src/keypair.ts` — loads `Ed25519Keypair` from `AGENT_PRIVATE_KEY` env (bech32 `suiprivkey1…` or hex `0x…`) via `decodeSuiPrivateKey`, falling back to `~/.sui/sui_config/sui.keystore`.
- `src/cap.ts` — `CapState` interface mirroring `AgentCapability` fields; `loadCap(client, capId)` reads shared object content; `isDue(cap, now)` enforces the same predicates as `assert_executable` (active, not revoked, agent matches, now ≥ next_execution_at, executions_done < executions_max, now < expires_at); `findDueCaps(client, agentAddress)` paginates `CapabilityCreated` events (max 20 pages × 50).
- `src/risk.ts` — Stage 4 stub; always returns `{ action: "execute" }` for now.
- `src/execute.ts` — the execution PTB (CLAUDE.md §5 "the heart of the system"):
  1. `vouch::capability::draw_for_execution<DBUSDC>` (asserts + reserves + vault withdraw, atomic)
  2. `deepbook::balance_manager::deposit<DBUSDC>` into shared BalanceManager
  3. `generate_proof_as_owner` (TradeProof hot-potato)
  4. `deepbook::pool::place_market_order<SUI, DBUSDC>` with `quantity=1_000_000_000n` (1 SUI = pool min_size), `is_bid=true`, `pay_with_deep=false`, `client_order_id=Date.now()`
  5. `balance_manager::withdraw_all<SUI>` → `transfer::public_transfer` to `cap.owner`
  6. `balance_manager::withdraw_all<DBUSDC>` (dust) → `cap.owner`
  7. `vouch::capability::log_action` (emits `ActionExecuted`, advances schedule, increments counter)
- `src/skip.ts` — submits `capability::log_skip` (bcs vector of reason bytes).
- `src/server.ts` — Fastify (`GET /health`, `POST /run-now/:capId?force=execute|skip`). 409 if not due, otherwise risk-eval then submit.
- `src/index.ts` — boots server on `PORT` (default 8787) + poll loop (`POLL_INTERVAL_MS`, sequential per due cap). `DISABLE_POLL=true` for demo-driven mode.

**Seeder (`scripts/dca-seed.ts`):**
- Creates Vault<DBUSDC> funded with 3 DBUSDC + capability (per_exec_cap=1 DBUSDC, executions_max=3, interval=5s, expires=24h, `pool_scope=[SUI_DBUSDC]`).
- Auto-activates with the same dev key so we can test the executor without going through the recipient flow. Documented in the script comments as a test-only convenience.
- Wired as `npm run dca-seed`.

**End-to-end verification on testnet:**
- Seed: cap `0xd61dcc6d2fdbb047f7e7dba17dec374d4f7f092f30ce21a0f936f9046e9da1d0`, vault `0x572e81d5f3e56a4d125cee69858ede9b503902be81d5cfe7fb8c371ebab5f536`. Create tx `7mY3vvekKyeuzWAjtgfdHgFFkmacoWn7Q2FGJps7oZhy`, activate tx `a6Vv9DztmzNCqD8x3b7xYgVEaXj2qwhimTHCCjdXcHB`.
- Executor `GET /health` → `{ ok: true, agent: 0xeff48ff…ac21 }`.
- `POST /run-now/0xd61dcc6d…` → **success**: tx `BV6bMewvogYKX7q2ndhc5zC3sXZZK2LLkRAFtMmFxeb4` returned `{ action: "execute", amountIn: "1000000", amountOut: "1000000000" }` (1 DBUSDC in → 1 SUI out, fee paid from input).
- Post-execution cap state (read on-chain): `executions_done: 1`, `budget_remaining: 2_000_000`, `next_execution_at` advanced by `interval_ms=5000`. Vault, BalanceManager, pool, and cap all mutated atomically in the same tx.
- This proves CLAUDE.md §5: the executor places a real Deepbook v3 testnet trade end-to-end, every step gated by Move assertions, all atomic, output transferred to the recipient.

### Stage 1 — Move package compiled, published, and verified on testnet ✅

- Sui CLI installed; testnet env active; dev address funded via faucet.
- Migrated source from 2024.alpha → 2024.beta (`friend` → `public(package)`; dropped `entry` from non-entrypoints; `vector::empty<u8>()` → `vector[]`; `#[allow(unused_field)]` on `RiskRule`; `#[allow(unused_const)]` on `ACTION_DCA_BUY`).
- `cd contracts && sui move build` — clean.
- `sui client publish --gas-budget 200000000` — **success**.
  - Package: `0xbb7d414c3f94da7efd1496f9c2c390662beca4e0eabea3831e15bc22ab2bcffd`
  - UpgradeCap: `0x7d45468c33732c137a6d52fc34e1f58d71e1c84170986b717032970fee453e7c`
  - Tx digest: `D3uqGB1iKkbDwmUFRaJF1TRRa5k9qy8DVsyu1Dd3YTV9`
- IDs recorded in `shared/config.ts` (CLAUDE.md §8 single-source-of-truth rule).
- `scripts/lifecycle.ts` end-to-end smoke test (TypeScript via `@mysten/sui` SDK, instantiates `Vault<SUI>`) — **all 5 stages green on testnet**:
  - create vault+capability — tx `FwDVWXjjxVb6eEQF5nxgnvHZ7NgmhnxRexBN5zSy3zxV`; `CapabilityCreated` emitted (budget 100M MIST, exec cap 40M, 4 slots). cap `0x121504e1b246f4423433aba3c388c4ea2c301c88b0899b17388b4b6b6757f926`, vault `0xc33da6f0f268985d207b8c5acda849216e7505716f6971053c4aa2df73d3e687`.
  - activate (sha2_256 token verified) — tx `C7AFp6YcACB5jajh58JYgv73kTs4veQnVLpqhwftiyBg`; `CapabilityActivated`.
  - execute (draw_for_execution → log_action) — tx `5ekEe5YR82BJfvCFsPPo5x1HAEVroH6PB3n2hsbsP4NS`; `ActionExecuted` `{ amount_in: 25M, budget_remaining: 75M, executions_done: 1 }`.
  - skip (log_skip with plain-English reason) — tx `GF4vyoYpuJU5HDmEUEDhC8Gui365SEhx9DQaSX81bVjf`; `ExecutionSkipped` `{ executions_done: 2 }` — budget untouched, slot consumed.
  - revoke (sweep to funder) — tx `Ghw2vgxJwFcwuLBQjeYkwPBKmQ68JYW6P1APUjwYD6KP`; `CapabilityRevoked` `{ refunded: 75M }`.
- This run proves invariants #1 (budget cap), #2 (pool scope), #3 (revoke/expiry assertion), and #4 (every action emits an event). Invariant #5 (no seed phrase) is a recipient-flow property handled in Stage 3.

---

## In progress

### Stage 3 — Recipient frontend wired to chain (CLAUDE.md §7.1, but self-hosted zkLogin per project-wide deviation)

**Goal:** replace `mockStore` reads with real on-chain state, replace the placeholder "Sign in with Google" with our self-hosted zkLogin flow (Google id_token → Mysten prover → zkLogin signature), and make activation + revocation submit real PTBs.

**Done so far:**
- Installed `@mysten/sui` v2 in `frontend/`. The SDK's v2 API renamed `SuiClient` → `SuiJsonRpcClient` (under `@mysten/sui/jsonRpc`); same `queryEvents` / `getObject` shape.
- `frontend/app/_lib/chain.ts` — `SuiJsonRpcClient` wired to `CONFIG.rpcUrl`, plus three reads:
  - `loadChainCapability(capId)` — `getObject` on the `AgentCapability` shared object, mapped to the existing `Capability` UI type. Decimals divided through (`usdcScalar=1e6`, `suiScalar=1e9`).
  - `loadChainCapabilityByToken(token)` — walks `CapabilityCreated` events newest→oldest, sha256s the raw token and compares to each cap's `activation_token_hash`. Only matches pending caps (hash is cleared on activate, by design).
  - `loadChainEvents(capId)` — pulls all five capability event types and filters by `cap_id`. Returns sorted `ActivityEvent[]` that drops straight into the existing dashboard list.
- `frontend/app/_lib/useChainCapability.ts` — poll hooks (`useChainCapabilityById`, `useChainCapabilityByToken`, default 5s) that mirror the existing `useCapability*` shape. No subscribe — chain pushes nothing; we poll.
- `frontend/app/dev/chain/page.tsx` — bare debug page that loads our seeded cap (`0xd61dcc6d…`) live and dumps the projected JSON, so we can eyeball chain reads without touching the real recipient pages.
- Config plumbing: added `@shared/*` path alias in `tsconfig.json`, expanded turbopack root + webpack alias in `next.config.ts` to allow `import { CONFIG } from "@shared/config"`. CLAUDE.md §8 single-source rule still holds; the frontend imports from `shared/` directly, never duplicates.
- Bumped tsconfig `target` ES2017 → ES2020 (needed for BigInt literals + modern `crypto.subtle` typings).
- `./node_modules/.bin/tsc --noEmit` clean. `next build` clean — 8 routes including `/dev/chain`.

**Next concrete step:**
1. ✅ `/dev/chain` smoke against testnet — confirmed: live read of seeded cap `0xd61dcc6d…` shows `executions_done: 1`, `budget_remaining: 2`, three events (created/activated/bought) including the Stage 2 trade.
2. ✅ Recipient page `/c/[token]` now dispatches on param shape:
   - `0x…` (66-char) → chain-id read via `useChainCapabilityById`
   - `demo` / `pending` → mock store (unchanged, used by existing dev landing)
   - Anything else → chain-token lookup via `useChainCapabilityByToken` (will be the real share-link path once activation is wired)
   - `Dashboard` accepts `chainMode` — "Run now" POSTs to the executor (`/run-now/:capId` with optional `?force=skip`), surfaces the returned tx digest in the toast. "Stop" in chain mode shows "needs Google sign-in (coming next)" because revoke requires a zkLogin signature.
   - Executor got `@fastify/cors` (`origin: true`) so the browser can call it cross-origin. Smoke-verified: preflight returns `Access-Control-Allow-Origin: http://localhost:3000`.
   - `frontend/app/_lib/executor.ts` wraps the HTTP API. `NEXT_PUBLIC_EXECUTOR_URL` env override (defaults to `http://localhost:8787`).
3. Wire self-hosted zkLogin: ephemeral `Ed25519Keypair`, nonce derived from epoch + randomness + ephemeral pubkey, redirect to Google OAuth with `response_type=id_token nonce=…`, parse the id_token from the URL fragment on return, call Mysten's testnet prover for the ZK proof, derive Sui address from `iss + sub + aud + salt`.
4. Salt decision: for the demo, use a deterministic salt (e.g. `sha256(sub)` truncated) so the recipient gets the same address across sessions without a salt server. Document as demo-only.
5. Activation PTB: `capability::activate(cap, token, clock)` signed with zkLogin signature. Sponsored gas TBD — likely a tiny backend that wraps the user's tx in a sponsored gas object signed by a sponsor key.
6. Revoke PTB: `capability::revoke<DBUSDC>(cap, vault, clock)` signed by zkLogin owner.

### Stage 1 — Move spine (CLAUDE.md §4)

**Goal:** Implement the Move modules that make CLAUDE.md §1's five invariants provably hold, then deploy to Sui testnet.

**Current state — Move package PUBLISHED TO TESTNET ✅:**
- `contracts/Move.toml` — Move 2024.beta edition; `Sui` framework dep pinned to `framework/testnet`; address `vouch = "0x0"` at publish time.
- `contracts/sources/vault.move` — Generic `Vault<T>` (so we can plug the EXACT testnet USDC coin type at instantiation per CLAUDE.md §2). `withdraw` and `refund` are `public(package)` (the 2024.beta replacement for `friend`) so funds physically cannot leave the vault except through a capability-gated path. `create_and_share` convenience wraps create + `transfer::share_object`.
- `contracts/sources/capability.move` — Defines `AgentCapability` (shared object), `Schedule`, `RiskRule`, all five events (`CapabilityCreated`, `CapabilityActivated`, `ActionExecuted`, `ExecutionSkipped`, `CapabilityRevoked`), error codes (CLAUDE.md §4.1), guards (`assert_executable`, `reserve_budget`, `assert_pool_in_scope`), the atomic `draw_for_execution<T>` that bundles the asserts + reservation + vault withdraw, `log_action`, `log_skip`, and `revoke<T>` (refunds in the same PTB; either funder or owner can call).
- Design choice (locked): vault withdraw is `public(package)` (CLAUDE.md §4.2 option a). The capability module owns the only legal call site.

**Deployment (recorded in `shared/config.ts`):**
- Network: Sui **testnet**
- Package ID: `0xbb7d414c3f94da7efd1496f9c2c390662beca4e0eabea3831e15bc22ab2bcffd`
- UpgradeCap ID: `0x7d45468c33732c137a6d52fc34e1f58d71e1c84170986b717032970fee453e7c`
- Publish tx digest: `D3uqGB1iKkbDwmUFRaJF1TRRa5k9qy8DVsyu1Dd3YTV9`
- Modules: `vouch::capability`, `vouch::vault`
- Gas cost: ~36.8M MIST (~0.037 SUI)
- Dev/publisher address: `0xeff48ffbc87d1fbbd6d12f25297502f1758981df2f886109f171dc605533ac21` (sui keystore; mnemonic NOT committed)

**Next concrete step:** Stage 1 is functionally complete. Remaining hardening (nice-to-have, not blocking):
1. Negative-path tests for `assert_executable` (wrong agent, too early, revoked, expired, max execs reached) — currently only the happy path is exercised by `scripts/lifecycle.ts`.
2. Move into Stage 0: confirm Deepbook v3 testnet package + pool + exact USDC coin type + DEEP type → fill the `deepbook` block in `shared/config.ts`, then place ONE manual Deepbook v3 market order from a throwaway script (CLAUDE.md §9 "kill the unknowns").
3. Move into Stage 2: build the executor backend that holds the agent keypair, polls due capabilities, and substitutes the real Deepbook `deposit → place_market_order → withdraw_all` calls for the `transferObjects` placeholder currently inside `scripts/lifecycle.ts` step 3.

---

## Not yet started

_(Stages 0, 1, 2 moved to **Done** above. Open Stage 0 follow-ups: Enoki key for Stage 3; Pyth on-chain read for Stage 4; possible maker-side seeder if pool depth thins out before demo day.)_

### Stage 4 — Risk layer (CLAUDE.md §6)
- Pyth SUI/USD price-drop rule.
- Deepbook depth-based slippage-cap rule.
- LLM-generated skip reasons (real model call, schema-validated).
- Demo-mode price override flag.

### Stage 5 — Creator frontend wired to chain (CLAUDE.md §7.2)
- Wallet adapter connect (Suiet / Sui Wallet).
- NL intent → LLM → strict JSON schema (Zod) → preview.
- Create PTB: `vault::create_vault` + `capability::create_pending`.
- Shareable link + QR.
- Creator dashboard mirroring activity log + revoke.

### Stage 6 — Bonus
- Capability "Recipes" templates.
- Walrus storage for reasoning logs.
- Multi-recipient.
- Notifications.

---

## Blockers / unknowns

- ~~**Sui CLI not installed**~~ — installed; package built and published to testnet. (See Done above.)
- **Testnet DBUSDC** — no public mint. Requested via https://tally.so/r/Xx102L (Mysten form). DEEP is NOT available via that form, but the smoke script + executor route around it with `payWithDeep=false` (fees paid from the input coin).
- **Deepbook v3 testnet pool liquidity** — spec warns it's thin or empty; a maker-side liquidity seeder will likely be needed before any real-trade demo even once we hold tokens.
- ~~**Enoki API key**~~ — not using Enoki. Self-hosted zkLogin instead (see project-wide decisions). Open: salt strategy (deterministic-from-`sub` for demo vs. salt service for prod) and sponsored gas path (need our own sponsor backend or have the recipient pay activation gas from a tiny pre-funded amount).
- **Pyth testnet feeds** — may be stale/flat; demo-mode override must exist.
- **Exact testnet USDC coin type** — must match the chosen Deepbook pool exactly.

---

## Open follow-ups

- QR code currently fetched from `api.qrserver.com` (external). Swap to a small local lib (e.g. `qrcode`) before any offline demo.
- "Parse with AI" button is a heuristic stub — replace with Claude/OpenAI call + Zod validation in Stage 5 (CLAUDE.md §7.2).
- Recipient `data-flow="recipient"` base font-size is applied via the inner container; verify it cascades correctly once we add Suspense/loading shells.
- Mom test (now desktop-only per the updated DESIGN.md): have a non-technical person open `/c/pending` in a desktop browser and note any hesitation here.
- `vouch::registry` discovery module is still optional — skipping until executor needs it; for now executor can track cap IDs from `CapabilityCreated` events.
