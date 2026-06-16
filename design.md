# DESIGN.md — Vouch UX & UI Spec

> Design system and UX rules for the Vouch frontends.
> Style: **warm neobrutalism**. Goal: **a non-crypto person (think: someone's mom) can use the recipient flow with zero help.**
> **Platform: DESKTOP ONLY.** Both the recipient and creator flows are desktop web apps. There is no mobile/phone build. Design for a desktop browser viewport throughout.
> Read alongside CLAUDE.md §7 (frontends). This file governs all visual and interaction decisions.

---

## 1. Design principles (in priority order)

1. **Mom-legible first.** The recipient flow must be usable by someone who has never touched crypto, without assistance. Clarity beats cleverness every time.
2. **One decision per screen.** Never present two primary actions. The recipient always knows the single next thing to do.
3. **No jargon, ever, in the recipient flow.** Banned words on recipient-facing surfaces: capability, PTB, vault, zkLogin, wallet, gas, token, mint, on-chain, hash, address (show truncated only when unavoidable). Use human language instead (see §6 copy guide).
4. **Reassurance is a feature.** Money apps make people anxious. Every screen should answer "is this safe?" and "can I undo this?" before the user has to ask.
5. **Loud but warm.** Neobrutalist boldness for confidence and legibility; warm palette and friendly copy so it never feels cold or alarming.
6. **Status is always visible.** The recipient should always see what's happening, what happened, and what's next — no hidden state.

---

## 2. The two audiences (dial the same system differently)

| | Recipient ("Mom") | Creator ("Alex") |
|---|---|---|
| Device | **Desktop** | **Desktop** |
| Crypto knowledge | None | Native |
| Density | Low — big elements, lots of breathing room | Higher — data tables, more controls |
| Tone | Warm, reassuring, plain | Direct, capable |
| Jargon | None | OK in moderation |
| Primary actions per screen | Exactly one | One, occasionally two |

Both flows are **desktop web apps** — same tokens, same components, same vibe. The difference is density and tone, not platform. Recipient = bigger, simpler, calmer, centered narrow column (max-width ~520px) on a desktop page. Creator = denser, more informational, wider layout.

---

## 3. Design tokens

### Color (warm neobrutalism — not cold black/white)
```
--bg:            #FFF7EC   /* warm cream — main background */
--surface:       #FFFFFF   /* cards */
--ink:           #1A1A1A   /* near-black — text + borders */
--accent:        #4F46E5   /* indigo — primary actions */
--accent-2:      #00C2A8   /* teal — success / positive */
--warn:          #FF6B4A   /* coral — skips / caution (friendly, not red-alarm) */
--danger:        #E5484D   /* red — revoke / stop only */
--muted:         #6B6B6B   /* secondary text */
--soft:          #FBE8C8   /* soft fill for info panels */
```
Use saturated flat fills. No gradients. No blur. Color carries meaning: indigo = the main action, teal = good outcome, coral = the agent paused, red = stop/revoke.

### Borders & shadows (the neobrutalist signature)
```
--border:        2.5px solid var(--ink);
--radius:        12px;                       /* friendly, not 0px-harsh */
--shadow:        4px 4px 0 var(--ink);       /* hard offset, NO blur */
--shadow-lg:     6px 6px 0 var(--ink);       /* hero elements */
--shadow-press:  2px 2px 0 var(--ink);       /* pressed state */
```

### Typography (chunky, geometric, readable)
```
Headings:  "Bricolage Grotesque" or "Archivo" or "Space Grotesk", weight 700–800
Body:      "Inter" or system-ui, weight 500
Recipient body size: 18px minimum (older eyes; legibility-first)
Creator body size:   15–16px
Headings: large and confident (28–40px on key screens)
```
Generous line-height (1.4–1.6). Never small grey text for anything that matters.

### Spacing & layout
- Generous padding inside cards (20–28px).
- Big click targets: minimum 56px height for any recipient button.
- **Desktop layout for both flows.** Recipient = a single centered column (max-width ~520px) on a desktop page, with plenty of surrounding whitespace so it stays calm and focused — one thing at a time. Creator = wider multi-column / table-capable desktop layout.
- Lots of whitespace on recipient screens — one thing at a time.

---

## 4. Core components (neobrutalist)

All components share: solid 2.5px ink border, hard offset shadow (no blur), 12px radius, flat fill.

### Button (primary)
- Filled `--accent`, white text, bold, `--shadow`.
- **Press interaction:** on `:active`, translate `+2px,+2px` and shrink shadow to `--shadow-press` — looks physically pressed. This feedback is important for non-technical users.
- Min height 56px (recipient), full-width within the centered column.
- Variants: primary (indigo), success (teal), danger (red, revoke only), ghost (cream fill, ink border).

### Card
- White surface, ink border, `--shadow`. The default container for everything.
- Hero cards use `--shadow-lg`.

### Status pill
- Small bordered pill with flat fill. States: `Active` (teal), `Paused this week` (coral), `Stopped` (red), `Done` (muted).

### Activity log item
- Each event = a bordered row card. Icon + plain-language line + timestamp.
  - Bought → teal check icon, "Bought 32 SUI for you"
  - Skipped → coral pause icon, the human reason
  - Stopped → red icon, "You stopped this"

### Big number display
- Budget remaining / SUI bought shown as a large chunky figure in a bordered card. Make the important number the biggest thing on screen.

### Countdown chip
- "Next buy: Monday" in a bordered chip with the soft fill. Friendly, not a ticking-clock anxiety device.

### Toast / inline confirmation
- Bordered, hard shadow, slides in. Used for "Done!" feedback after activation or a trade.

---

## 5. Screen-by-screen UX

### RECIPIENT FLOW (desktop, the demo's emotional core)
> Centered narrow column (~520px) on a desktop page. Calm, big, one decision per screen.

**Screen R1 — Activation landing** (`/c/:token`)
- Top: sender's first name + a friendly line: *"Alex set something up for you."*
- One hero card, plain-English summary:
  > *"This will buy a small amount of SUI (a kind of digital currency) for you — about $50 worth every Monday for 8 weeks. Alex has already paid for it. You can stop anytime."*
- Reassurance row: 🔒 *"Safe — you can stop whenever you want."*
- ONE button: **"Sign in with Google to start"** (primary, full width, big).
- Nothing else. No wallet talk, no addresses.

**Screen R2 — Just signed in**
- Brief friendly confirmation: *"You're all set up — no app or password to remember."*
- Restate what's about to happen in one card.
- ONE button: **"Turn it on"** (success/teal).
- Small ghost link: *"Not now"*.

**Screen R3 — Dashboard** (the home screen after activation)
- Header: *"Your weekly SUI buys"* + status pill (`Active`).
- Hero card — the big number: total SUI bought so far, with *"$X of $400 used"* underneath.
- Countdown chip: *"Next buy: Monday"*.
- Activity log: list of bordered rows, newest first. Buys (teal), skips with reasons (coral).
- Footer: **"Stop anytime"** button (danger/red, but not screaming — bordered ghost-red, requires a confirm).
- Tiny, de-emphasized: *"Set up by Alex"*.

**Screen R4 — Stop confirmation**
- Card: *"Stop your weekly buys? Any unused money goes back to Alex. You can't undo this."*
- Two buttons: **"Yes, stop"** (red) and **"Keep it going"** (ghost). Stop is NOT the default focus.

### CREATOR FLOW (desktop, denser)

**Screen C1 — Create**
- Big heading: *"Set up a delegation."*
- One large text field: *"Describe what you want the agent to do."* with example chips below (e.g. *"DCA $50/week into SUI for 8 weeks"*).
- As they type and submit → the parsed **preview card** appears beside/below: structured config in plain English, editable fields, risk rules shown as bordered pills.
- Funding line: *"You'll deposit 400 USDC."*
- Button: **"Create link"** (primary).

**Screen C2 — Link ready**
- Hero card with the shareable link + a big QR code in a bordered frame.
- Copy button (with pressed-state feedback) + "Share" affordances.
- Helper: *"Send this to the person you're setting it up for."*

**Screen C3 — Creator dashboard**
- Table/list of delegations created, each a bordered row: recipient, status pill, budget used, next run.
- Click into one → same activity log as recipient sees, plus a **Revoke** action (red, confirm-gated).
- This is where the demo shows the creator-side mirror of activity + the revoke path.

---

## 6. Copy guide (recipient-facing translations)

| Don't say | Say |
|---|---|
| Activate capability | Turn it on |
| zkLogin / connect wallet | Sign in with Google |
| Execute trade / swap | Buy SUI for you |
| Skipped execution (risk rule) | Paused this week — the price dropped a lot, so we waited |
| Revoke | Stop |
| Budget remaining | Money left ($X of $400) |
| On-chain activity log | What's happened so far |
| Funder / owner | Alex set this up |
| Vault | (don't mention — just "the money Alex deposited") |
| Gas fee | (don't mention — it's sponsored) |

Tone: warm, short sentences, second person ("you", "your"), no exclamation overload. Reassure, don't hype.

---

## 7. Interaction & motion

- **Press feedback on every button** (shadow collapse + translate). Non-negotiable — it's how non-technical users know a click registered.
- **Optimistic, then confirmed:** after activation/stop, show immediate friendly feedback, then confirm when the chain settles. Never leave the user staring at a frozen screen.
- **Loading states are friendly, not technical.** "Setting things up…" not "Submitting transaction 0x…". A simple bordered card with a chunky animated element.
- **Keep motion minimal and purposeful.** Neobrutalism is about solidity; avoid bouncy/excessive animation. Press feedback + slide-in toasts are enough.

---

## 8. Accessibility (also a pitch point)

- All text ≥ 18px on recipient screens; never rely on color alone (pair color with icon + label).
- Contrast: ink-on-cream and white-on-indigo both pass WCAG AA. Verify.
- Click targets ≥ 56px on recipient flow.
- Every status communicated in words, not just color (e.g. "Paused this week" text, not just a coral dot).

---

## 9. Implementation notes for Claude

- React + Tailwind. Define the tokens in §3 as CSS variables / Tailwind theme extensions; build the components in §4 once and reuse.
- **Desktop layout for both** `/web-recipient` and `/web-creator`. Recipient = centered narrow column (~520px); creator = wider layout. Same component library, same tokens. No mobile build.
- Fonts: load Bricolage Grotesque / Archivo / Space Grotesk for headings, Inter for body (Google Fonts).
- Read the frontend-design skill (`/mnt/skills/public/frontend-design/SKILL.md`) before building components, and respect this file's tokens where they conflict with defaults.
- Hard rule: the recipient flow must pass the "mom test" — show it to someone non-technical; if they hesitate or ask "what does this mean?", the copy or layout failed. Note such failures in progress.md and fix.

> Remember to update `progress.md` (CLAUDE.md §14) as UI work proceeds — which screens are built, which pass the mom test, and any copy/UX decisions made.