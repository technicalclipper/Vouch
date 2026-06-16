# Vouch — Frontend Flow & Use Case

A plain-English walkthrough of what's built in `frontend/`, who uses it, and what happens at each step. Pair this with `claude.md` (the full spec) and `design.md` (the UX rules).

---

## 1. The use case in one paragraph

Alex is crypto-native. His mom isn't. Alex wants to gift her some SUI — but not all at once (volatile), and he doesn't want to teach her about wallets, gas, seed phrases, or exchanges. With Vouch, Alex sets up a **delegation**: "Every Monday for 8 weeks, buy $50 of SUI for Mom — and pause the buy if the market is crashing that hour." He funds it once, gets a shareable link, and texts it to her. Mom taps the link, signs in with Google, and from then on an AI agent makes the buys for her under hard on-chain limits. She sees a friendly dashboard. Either of them can stop it instantly; unused money goes back to Alex.

**The link is the whole product.** Everything else hangs off it.

---

## 2. Two sides, one app

There's one Next.js app under `frontend/`, but it serves two very different audiences:

| | Creator ("Alex") | Recipient ("Mom") |
|---|---|---|
| Routes | `/create`, `/create/share/:id`, `/dashboard`, `/dashboard/:id` | `/c/:token` |
| Device | Desktop, denser layout | Phone, big elements |
| Vocabulary | Crypto-fluent OK | Zero jargon — must pass the "mom test" |
| Decisions per screen | 1, sometimes 2 | Exactly 1 |

Same design system, same tokens. Just dialed differently. The `data-flow="recipient"` attribute on the recipient page bumps the base font-size to 18px; the creator pages run at 15px.

---

## 3. The creator flow (Alex)

### Screen C1 — `/create`  (set up a delegation)

What Alex sees:

- A big input: *"Describe what you want the agent to do."*
- Example chips like *"DCA $50/week into SUI for 8 weeks"* he can click to autofill.
- A **Parse with AI** button.
- A live **preview card** showing the parsed config in plain English — editable, with numeric fields for per-buy amount, number of buys, expiry, cadence dropdown.
- Risk-rule pills (currently fixed: pause on >5% drop in an hour, pause on >1% slippage).
- A line *"You'll deposit $400 USDC"* (auto-calculated from per-buy × count).
- One CTA: **Create link**.

What happens under the hood right now:

- `parse()` is a heuristic stub — it regex-extracts the dollar amount and the time window. **In Stage 5 of the spec, this is replaced by a real Claude/OpenAI call that returns a strict JSON intent, validated by Zod** (`claude.md §7.2`).
- `Create link` calls `createCapability()` in `app/_lib/mockStore.ts`, which writes a new `Capability` object into `localStorage` and redirects to `/create/share/:id`.

What will happen when wired to chain (Stage 5):

- The wallet adapter (Suiet / Sui Wallet) signs a single Programmable Transaction Block that does:
  1. `vault::create_vault(usdc_coin)` — locks Alex's funding.
  2. `capability::create_pending(...)` — creates the `AgentCapability` object with status = pending, holding only a hash of a one-time activation token.
- The link contains that token.

### Screen C2 — `/create/share/:id`  (link ready)

What Alex sees:

- Hero card with a big QR code + the shareable URL.
- **Copy link** button (toast feedback on success).
- **Preview as them** button — opens `/c/:token` so Alex can sanity-check what Mom will see.
- Helper text: *"Send this to the person you're setting it up for."*

Right now: the QR is rendered via `api.qrserver.com` (external call). Swapped for a local QR library before any offline demo — flagged in `progress.md`.

### Screen C3 — `/dashboard` (list)

What Alex sees:

- A row per delegation he's created.
- Each row: recipient nickname + status pill (`Active` / `Not turned on yet` / `Stopped` / `Done`) + budget used / total + next-buy time.
- Click a row → drill-in.

### Screen C3 drill-in — `/dashboard/:id`

What Alex sees:

- Same activity log the recipient sees (mirrors `ActionExecuted` / `ExecutionSkipped` events).
- A **Rules** card stating the hard limits the agent operates under (the bullets here are the actual on-chain assertions that will revert the executor's transaction if violated — `claude.md §4.1`).
- **Demo controls**: Run now, Force skip, Revoke. These let you demonstrate execution and revocation without waiting for the schedule.
- The **Revoke** button opens a confirm modal. On revoke, the demo updates the status to `Stopped`. On chain, revocation flips the `revoked` flag and refunds the vault to Alex in the same PTB.

---

## 4. The recipient flow (Mom)

This is the demo's emotional core. Every screen passes the §6 copy guide — no `wallet`, no `gas`, no `revoke`, no `capability`. One primary action.

### Screen R1 — `/c/:token` (just landed)

What Mom sees:

- Sender's name in the header: *"Alex set something up for you."*
- A short headline: *"A little SUI, every week."*
- A hero card with the deal in plain English: *"This will buy a small amount of SUI (a kind of digital currency) for you — about $50 worth every Monday for 8 weeks. Alex has already paid for it. You can stop anytime."*
- A soft reassurance row: *🔒 Safe. You can stop whenever you want.*
- **One button:** *"Sign in with Google to start."*
- Footnote: *"No app to install. No password to remember."*

That's it. No price chart, no terms wall, no wallet talk. The screen answers "what is this?" and "can I undo it?" before she has to ask.

### R1 → "Signing in…" interstitial

Friendly 1.4-second beat with a pulsing dot — *"Setting things up…"*. Real wiring uses **Enoki zkLogin** (`claude.md §7.1`): Google OAuth → zkLogin proof → Sui address derived. No mnemonic, no extension, no key visible to Mom.

### Screen R2 — just signed in

What Mom sees:

- *"You're all set up. No app or password to remember."*
- A restated summary card of what's about to happen.
- One CTA: **Turn it on** (teal — "this is a good thing").
- Ghost link: *"Not now"* (escape hatch).

When she taps **Turn it on**, the demo calls `activate(token, fakeAddress)` in the mock store and routes her to the dashboard. Real wiring: an **Enoki-sponsored** PTB calling `capability::activate` — she pays no gas.

### Screen R3 — dashboard (home from now on)

What Mom sees:

- Header: *"Your weekly SUI buys"* + a status pill (`Active`).
- **Hero card with the big number**: total SUI bought so far, with *"$X of $400 used"* underneath. Big-number-first is intentional — DESIGN.md §4 calls for the most important figure to be the largest thing on screen.
- A friendly countdown chip: *"Next buy: Monday"*. Not a ticking-clock anxiety device.
- **Activity log** — newest first. Each row is a bordered card with an icon and a plain-English line + relative time:
  - Bought → teal check, *"Bought 21.3 SUI for you ($50)"*
  - Skipped → coral pause, the agent's reason, e.g. *"SUI dropped 6.2% in the last hour, more than the 5% you allowed — we waited."*
  - Stopped → red square, *"You stopped this."*
- **Demo controls** card (Run now / Run with simulated price drop) so the agent can be triggered on demand during the live demo.
- **Stop anytime** button (ghost-red, requires confirm).
- Tiny footer: *"Set up by Alex."*

### Screen R4 — stop confirmation

Modal:

- *"Stop your weekly buys? Any unused money goes back to Alex. You can't undo this."*
- **Keep it going** (ghost, default focus — undoing destructive actions should be the easy path).
- **Yes, stop** (red).

After tap: status pill turns `Stopped`, the demo controls disappear, a row is appended to the activity log. On chain: the same `capability::revoke` flips the flag; any subsequent execution attempted by the agent will revert because every execution PTB starts with `assert_executable` — which now fails.

---

## 5. How the two sides connect

**The link is the contract.** When Alex creates a delegation:

1. `cap = createCapability(intent)` writes a new capability with a random `token`.
2. The share screen URL embeds that token: `/c/<token>`.
3. Mom opens that URL — `useCapabilityByToken(token)` reads it from the store.
4. If `status === "pending"` → activation view. Otherwise → dashboard.
5. Mom's actions (activate, run-now, revoke) mutate the same capability object.
6. Alex's dashboard subscribes to `vouch:store` events, so changes Mom makes appear live on Alex's side (and vice-versa). On chain this is the same mechanism — both sides read events off the same `cap_id`.

In the current mock, this is `localStorage` in the browser. **The interface mirrors the on-chain shape exactly** (`app/_lib/types.ts` matches `claude.md §4.1 AgentCapability`), so swapping the mock store for real Sui SDK reads is a localized change — none of the components need to know.

---

## 6. What's real now vs what comes later

| Piece | Now (Stage F1) | Will become |
|---|---|---|
| Capability state | localStorage mock | On-chain `AgentCapability` object via Sui SDK |
| Sign-in | 1.4s fake delay | Enoki zkLogin (Google) |
| Activation PTB | `activate()` mock | Enoki-sponsored on-chain PTB |
| Create PTB | `createCapability()` mock | Wallet-signed PTB: `vault::create_vault` + `capability::create_pending` |
| Intent parsing | regex stub | Claude/OpenAI call → Zod-validated JSON |
| Execution | `runNow()` mock with fake price | Executor backend signing a real Deepbook v3 trade |
| Skip reason | hard-coded sentence | Real LLM call against rule + market data + original intent |
| Activity log | events in store | `ActionExecuted` / `ExecutionSkipped` events from chain |
| Revoke | `revoke()` mock | On-chain `capability::revoke` + `vault::refund` in same PTB |
| QR code | external API | local lib (`qrcode`) |

---

## 7. Demo loop you can run right now

(localhost:3000 unless you set `PORT`)

1. `/` — pick a side.
2. `/create` — click an example chip, **Parse with AI**, tweak preview, **Create link**.
3. You land on `/create/share/<id>` — copy the URL or click **Preview as them**.
4. In a phone-sized viewport, open `/c/<token>` → R1 → **Sign in with Google** → R2 → **Turn it on**.
5. Now on R3 (dashboard). Tap **Run now** — a "Bought…" row appears immediately. Tap **Run with simulated price drop** — a coral "we paused" row appears.
6. Open `/dashboard/<id>` in another tab — same activity is mirrored on Alex's side.
7. On either side, tap **Stop** / **Revoke** → confirm → status flips, demo controls disappear, both sides reflect it.

This is the full v1 story end-to-end, against the same data shape the real chain will produce.

---

## 8. File map (for when you want to dig in)

```
frontend/app/
├── page.tsx                       Dev landing (links to both flows)
├── layout.tsx                     Fonts (Bricolage Grotesque + Inter), body bg
├── globals.css                    Tokens (colors, shadows, borders) + nb-* utilities
│
├── _components/                   Design system
│   ├── Button.tsx                 variants: primary/success/danger/ghost
│   ├── Card.tsx                   default + hero (bigger shadow)
│   ├── StatusPill.tsx             pending/active/paused/stopped/done
│   ├── ActivityItem.tsx           icon + plain-language event row
│   ├── BigNumber.tsx              hero figure with label + sub
│   ├── CountdownChip.tsx          "Next buy: Monday"
│   ├── Modal.tsx                  bordered, hard shadow, click-outside / esc to close
│   ├── Toast.tsx                  imperative toast(msg) + <ToastHost/>
│   └── useCapability.ts           hooks that subscribe to mock store
│
├── _lib/
│   ├── types.ts                   Capability / DCAIntent / ActivityEvent — mirror of claude.md §4.1
│   ├── mockStore.ts               localStorage CRUD: getByToken, activate, revoke, runNow, createCapability, subscribe
│   └── format.ts                  formatUsd / formatSui / formatNextBuy / describeIntent (mom-test copy)
│
├── c/[token]/
│   ├── page.tsx                   Router: pending → ActivationView; else Dashboard
│   ├── _ActivationView.tsx        R1 + R2 (sign-in interstitial)
│   └── _Dashboard.tsx             R3 + R4 (stop modal)
│
├── create/
│   ├── page.tsx                   C1 (NL + preview + create)
│   └── share/[id]/page.tsx        C2 (QR + share)
│
└── dashboard/
    ├── page.tsx                   C3 list
    └── [id]/page.tsx              C3 drill-in (mirror + revoke)
```

If something here doesn't match what you see on screen, the source of truth is `progress.md` — it gets updated every session.
