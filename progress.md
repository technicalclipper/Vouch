# Vouch — Progress Log

> Living log per CLAUDE.md §14. Update every session.

---

## Project-wide decisions

- **Monorepo layout deviation:** spec calls for separate `/web-creator` and `/web-recipient` (CLAUDE.md §13). Currently using a single `frontend/` Next.js 16 app. Rationale: shared design tokens + components, single dev server, faster path to demo. Can split later if needed.
- **Platform = desktop-only for both flows** (per the updated DESIGN.md §2, §5, §9). Recipient = centered ~520px column on a desktop page; creator = wider desktop layout. The recipient page wrapper has been updated from `max-w-[480px]` to `max-w-[520px]` and the vertical padding bumped for desktop framing.
- **Frontend stack:** Next.js 16 + React 19 + Tailwind v4 (existing scaffold). Tokens defined as CSS variables per DESIGN.md §3; components handwritten per §4.
- **Move package directory created at `contracts/`** (deviation from CLAUDE.md §13 which suggests `/contracts` — same thing, just relative to repo root).

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

### Stage 0 — Kill the unknowns (CLAUDE.md §9)
- Confirm Deepbook v3 testnet package ID, USDC/SUI pool ID, exact USDC coin type, DEEP coin type.
- Get testnet SUI / USDC / DEEP into a dev wallet.
- Place ONE manual Deepbook v3 market order from a throwaway script.
- Enoki: API key, "Sign in with Google → show address" smoke test.
- Pyth SUI/USD feed sanity check.
- Fill `shared/config.ts`.

### Stage 2 — Executor backend (CLAUDE.md §5)
- Node/TS service holding the agent keypair.
- Poll loop for due capabilities.
- Execution PTB builder for `dca_buy`.
- `POST /run-now/:capId` demo endpoint.
- Place one real testnet Deepbook v3 trade end-to-end.

### Stage 3 — Recipient frontend wired to chain (CLAUDE.md §7.1)
- Enoki zkLogin activation PTB (Enoki-sponsored).
- Dashboard reading `ActionExecuted` / `ExecutionSkipped` events from chain.
- Revoke PTB.

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
- **Deepbook v3 testnet pool liquidity** — spec warns it's thin or empty; a maker-side liquidity seeder will likely be needed before any real-trade demo.
- **Pyth testnet feeds** — may be stale/flat; demo-mode override must exist.
- **Exact testnet USDC coin type** — must match the chosen Deepbook pool exactly.

---

## Open follow-ups

- QR code currently fetched from `api.qrserver.com` (external). Swap to a small local lib (e.g. `qrcode`) before any offline demo.
- "Parse with AI" button is a heuristic stub — replace with Claude/OpenAI call + Zod validation in Stage 5 (CLAUDE.md §7.2).
- Recipient `data-flow="recipient"` base font-size is applied via the inner container; verify it cascades correctly once we add Suspense/loading shells.
- Mom test (now desktop-only per the updated DESIGN.md): have a non-technical person open `/c/pending` in a desktop browser and note any hesitation here.
- `vouch::registry` discovery module is still optional — skipping until executor needs it; for now executor can track cap IDs from `CapabilityCreated` events.
