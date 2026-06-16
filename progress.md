# Vouch — Progress Log

> Living log per CLAUDE.md §14. Update every session.

---

## Project-wide decisions

- **Monorepo layout deviation:** spec calls for separate `/web-creator` and `/web-recipient` (CLAUDE.md §13). Currently using a single `frontend/` Next.js 16 app with route groups `(recipient)` and `(creator)`. Rationale: shared design tokens + components, single dev server, faster path to demo. Can split later if needed.
- **No Move/executor/shared dirs yet.** Frontend is being built against mocked capability data first so design + UX risk is retired early. Move contracts (CLAUDE.md §4) and executor (§5) come next.
- **Frontend stack:** Next.js 16 + React 19 + Tailwind v4 (existing scaffold). Tokens defined as CSS variables per DESIGN.md §3; components handwritten per §4.

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

---

## In progress

_(none — F1 complete, awaiting next session to start Stage 0 unknowns)_

---

## Not yet started

### Stage 0 — Kill the unknowns (CLAUDE.md §9)
- Confirm Deepbook v3 testnet package ID, USDC/SUI pool ID, exact USDC coin type, DEEP coin type.
- Get testnet SUI / USDC / DEEP into a dev wallet.
- Place ONE manual Deepbook v3 market order from a throwaway script.
- Enoki: API key, "Sign in with Google → show address" smoke test.
- Pyth SUI/USD feed sanity check.
- Fill `shared/config.ts`.

### Stage 1 — Move spine (CLAUDE.md §4)
- `vouch::capability` module with assertions + events.
- `vouch::vault` module (`public(friend)` withdraw — per CLAUDE.md §4.2 design note).
- (Optional) `vouch::registry` discovery events.
- CLI integration tests covering create → activate → execute → skip → revoke.
- Deploy to testnet; record package + object IDs into config.

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

- **Sui toolchain availability** on this machine — not yet confirmed. Needed before Stage 1.
- **Deepbook v3 testnet pool liquidity** — spec warns it's thin or empty; a maker-side liquidity seeder will likely be needed before any real-trade demo.
- **Pyth testnet feeds** — may be stale/flat; demo-mode override must exist.
- **Exact testnet USDC coin type** — must match the chosen Deepbook pool exactly.

---

## Open follow-ups from F1

- QR code currently fetched from `api.qrserver.com` (external). Swap to a small local lib (e.g. `qrcode`) before any offline demo.
- "Parse with AI" button is a heuristic stub — replace with Claude/OpenAI call + Zod validation in Stage 5 (CLAUDE.md §7.2).
- Recipient `data-flow="recipient"` base font-size is applied via the inner container; verify it cascades correctly once we add Suspense/loading shells.
- Mom test: have a non-technical person run `/c/pending` on a phone and note any hesitation here.
