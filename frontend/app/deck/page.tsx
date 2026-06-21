"use client";

// Hackathon pitch deck — neobrutalist style, matches the rest of the app
// (DESIGN.md §3 tokens, hard offset shadows, no gradients). Single page
// with vertical scroll-snap; one slide per viewport.

import { useEffect, useState } from "react";
import Link from "next/link";

const SLIDES = [
  "hero",
  "what",
  "problem",
  "solution",
  "how",
  "example",
  "wow",
  "architecture",
  "demo",
] as const;

type SlideKey = (typeof SLIDES)[number];

export default function DeckPage() {
  const [active, setActive] = useState<SlideKey>("hero");

  // Sync the active dot with the slide most in-view via IntersectionObserver.
  useEffect(() => {
    const sections = SLIDES.map((k) =>
      document.getElementById(`slide-${k}`),
    ).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const key = visible.target.id.replace("slide-", "") as SlideKey;
          setActive(key);
        }
      },
      { threshold: [0.4, 0.6, 0.8] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  // Arrow-key navigation — nice for presenting.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "PageDown" && e.key !== "PageUp") return;
      const i = SLIDES.indexOf(active);
      const next =
        e.key === "ArrowDown" || e.key === "PageDown"
          ? Math.min(i + 1, SLIDES.length - 1)
          : Math.max(i - 1, 0);
      const el = document.getElementById(`slide-${SLIDES[next]}`);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <div
      className="h-screen w-screen overflow-y-scroll snap-y snap-mandatory"
      style={{ scrollBehavior: "smooth" }}
    >
      <SideRail active={active} />

      <Hero />
      <What />
      <Problem />
      <Solution />
      <How />
      <Example />
      <Wow />
      <Architecture />
      <Demo />
    </div>
  );
}

/* ---------------- Layout primitives ---------------- */

function Slide({
  id,
  children,
  className = "",
}: {
  id: SlideKey;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={`slide-${id}`}
      className={`relative snap-start h-screen w-full overflow-hidden ${className}`}
    >
      <div className="mx-auto h-full w-full max-w-7xl px-8 sm:px-14 py-10 sm:py-14 flex flex-col">
        {children}
      </div>
    </section>
  );
}

function SlideNumber({ n, total = SLIDES.length }: { n: number; total?: number }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.25em] text-muted">
      {String(n).padStart(2, "0")} / {String(total).padStart(2, "0")} · Vouch
    </p>
  );
}

function Decor() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none nb-border nb-shadow absolute right-[-32px] top-[80px] h-24 w-24 bg-accent rotate-[10deg]"
      />
      <span
        aria-hidden
        className="pointer-events-none nb-border nb-shadow absolute left-[-28px] bottom-[120px] h-16 w-16 bg-accent-2 rounded-full rotate-[-12deg]"
      />
      <span
        aria-hidden
        className="pointer-events-none nb-border nb-shadow absolute right-[80px] bottom-[64px] h-10 w-10 bg-warn rotate-[20deg]"
      />
    </>
  );
}

function SideRail({ active }: { active: SlideKey }) {
  return (
    <nav
      aria-label="Slide navigation"
      className="fixed right-4 sm:right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2.5"
    >
      {SLIDES.map((k) => (
        <a
          key={k}
          href={`#slide-${k}`}
          aria-label={`Go to slide ${k}`}
          className={`h-3.5 w-3.5 nb-border rounded-full transition-all ${
            active === k ? "bg-ink scale-110" : "bg-surface"
          }`}
        />
      ))}
    </nav>
  );
}

/* ---------------- Slides ---------------- */

function Hero() {
  return (
    <Slide id="hero">
      <Decor />
      <header className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 nb-border rounded-full bg-soft px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
          <span className="inline-block h-2 w-2 rounded-full bg-accent-2" />
          Sui testnet · Agentic Web track
        </span>
        <Link
          href="/"
          className="text-sm font-semibold underline underline-offset-4 text-muted hover:text-ink"
        >
          ← back to app
        </Link>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        <h1
          className="font-display font-extrabold leading-[0.82] tracking-[-0.04em]
                     text-[120px] sm:text-[200px] md:text-[260px] lg:text-[320px]"
          style={{
            textShadow:
              "6px 6px 0 var(--ink), 14px 14px 0 var(--accent)",
          }}
        >
          Vouch.
        </h1>

        <p className="mt-10 font-display text-3xl sm:text-5xl font-bold leading-[1.05] max-w-4xl">
          Shareable links that let an{" "}
          <span className="text-accent">AI agent</span> act on your behalf —
          <br className="hidden sm:block" />
          <span className="text-accent-2">bounded by Move,</span>{" "}
          <span className="underline decoration-[3px] underline-offset-[6px]">
            revoked in one tap
          </span>
          .
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4 text-base text-muted">
          <span className="nb-border rounded-full bg-surface px-4 py-1.5 font-semibold">
            Move capabilities
          </span>
          <span className="nb-border rounded-full bg-surface px-4 py-1.5 font-semibold">
            zkLogin onboarding
          </span>
          <span className="nb-border rounded-full bg-surface px-4 py-1.5 font-semibold">
            Deepbook v3 settlement
          </span>
          <span className="nb-border rounded-full bg-surface px-4 py-1.5 font-semibold">
            Pyth-aware risk rules
          </span>
        </div>
      </div>

      <footer className="text-sm text-muted flex justify-between">
        <span>↓ scroll · arrow keys to navigate</span>
        <span>01 / {SLIDES.length}</span>
      </footer>
    </Slide>
  );
}

function What() {
  return (
    <Slide id="what">
      <SlideNumber n={2} />
      <div className="flex-1 grid gap-10 lg:grid-cols-[1.3fr_1fr] items-center">
        <div>
          <h2
            className="font-display text-6xl sm:text-7xl md:text-8xl font-extrabold leading-[0.9] tracking-tight"
            style={{ textShadow: "5px 5px 0 var(--accent-2)" }}
          >
            What is Vouch?
          </h2>

          <p className="mt-8 text-2xl sm:text-3xl font-display font-bold leading-tight max-w-3xl">
            A <span className="text-accent">delegation primitive</span> on Sui:
            a shareable link that grants an AI agent a tight, revocable
            capability to execute on someone&apos;s behalf.
          </p>

          <p className="mt-6 text-lg text-muted max-w-3xl leading-relaxed">
            Think Venmo-link simplicity for non-crypto users, but the link
            carries <em>permission to act</em> — a Move object encoding
            exactly what the agent may do, enforced at execution time.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <Pill tone="accent" label="01 · The link">
            One URL. No app to install. No seed phrase.
          </Pill>
          <Pill tone="accent-2" label="02 · The agent">
            Runs a strategy on the recipient&apos;s behalf, under hard caps.
          </Pill>
          <Pill tone="warn" label="03 · The capability">
            A Move object — the agent&apos;s authority. No capability, no
            action.
          </Pill>
        </div>
      </div>
    </Slide>
  );
}

function Problem() {
  return (
    <Slide id="problem">
      <SlideNumber n={3} />
      <div className="flex-1 flex flex-col justify-center">
        <h2
          className="font-display text-6xl sm:text-7xl md:text-8xl font-extrabold leading-[0.9]"
          style={{ textShadow: "5px 5px 0 var(--warn)" }}
        >
          The agentic web has a
          <br />
          <span className="text-warn">delegation problem.</span>
        </h2>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <BadOption tone="warn" title="Sign every action">
            Agents that need a human signature for every step have{" "}
            <strong>no autonomy</strong>. The whole point dies.
          </BadOption>
          <BadOption tone="danger" title="Hand over the keys">
            Agents with unbounded wallet access have{" "}
            <strong>no safety</strong>. One bad prompt drains everything.
          </BadOption>
        </div>

        <p className="mt-10 font-display text-2xl sm:text-3xl font-bold max-w-4xl leading-snug">
          Either way, users lose. There&apos;s no <em>middle</em> — no way to
          say <span className="underline decoration-[3px] underline-offset-[6px]">&ldquo;you can do this much, this often, until I say stop.&rdquo;</span>
        </p>
      </div>
    </Slide>
  );
}

function Solution() {
  return (
    <Slide id="solution">
      <SlideNumber n={4} />
      <div className="flex-1 grid gap-10 lg:grid-cols-[1fr_1.2fr] items-center">
        <div>
          <h2
            className="font-display text-6xl sm:text-7xl md:text-8xl font-extrabold leading-[0.9]"
            style={{ textShadow: "5px 5px 0 var(--accent)" }}
          >
            The <span className="text-accent">capability</span> object.
          </h2>
          <p className="mt-8 text-xl sm:text-2xl text-muted max-w-2xl leading-relaxed">
            A Move object that encodes <em>exactly</em> what the agent may
            do. Enforced by the type system at execution time — not by the
            agent&apos;s good behavior.
          </p>
          <p className="mt-6 text-lg max-w-2xl leading-relaxed">
            If the agent&apos;s key leaks, the attacker can only execute the
            exact configured strategy within the exact cap. The user revokes
            to close the window.
          </p>
        </div>

        <div className="grid gap-4">
          <Invariant n="01" tone="accent" title="Cannot exceed the budget">
            Every trade asserts <code className="font-mono nb-border bg-bg px-1.5 py-0.5 rounded text-sm">amount ≤ per_execution_cap</code> and
            <code className="font-mono nb-border bg-bg px-1.5 py-0.5 rounded text-sm ml-1">amount ≤ budget_remaining</code>.
          </Invariant>
          <Invariant n="02" tone="accent-2" title="Cannot trade outside scope">
            Pool ID must be in <code className="font-mono nb-border bg-bg px-1.5 py-0.5 rounded text-sm">pool_scope</code>. Wrong pool aborts the PTB.
          </Invariant>
          <Invariant n="03" tone="warn" title="Cannot act after revoke">
            <code className="font-mono nb-border bg-bg px-1.5 py-0.5 rounded text-sm">revoked</code> flag short-circuits every assertion. Funds refund to the funder atomically.
          </Invariant>
          <Invariant n="04" tone="accent" title="Every action logged on-chain">
            No execution exists that does not emit an event — including skips, with a human-readable reason.
          </Invariant>
        </div>
      </div>
    </Slide>
  );
}

function How() {
  return (
    <Slide id="how">
      <SlideNumber n={5} />
      <div className="flex-1 flex flex-col justify-center">
        <h2
          className="font-display text-6xl sm:text-7xl md:text-8xl font-extrabold leading-[0.9]"
          style={{ textShadow: "5px 5px 0 var(--accent-2)" }}
        >
          How it works.
        </h2>

        <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Step n="1" tone="accent" title="Configure">
            Creator types intent in plain English. LLM compiles to a strict
            JSON schema. Wallet signs the create PTB → funded Vault +
            pending Capability.
          </Step>
          <Step n="2" tone="accent-2" title="Share">
            One URL goes out. Carries a one-time activation token; the chain
            stores only its sha256 hash.
          </Step>
          <Step n="3" tone="warn" title="Activate">
            Recipient taps link → <strong>Sign in with Google</strong>{" "}
            (zkLogin) → Sui address materializes in 4s. Sponsored gas. No
            wallet, no seed phrase.
          </Step>
          <Step n="4" tone="accent" title="Execute">
            Off-chain agent polls due caps, reads Pyth + Deepbook depth,
            decides <em>execute</em> or <em>skip</em>, then submits a PTB
            that on-chain assertions accept — or reject.
          </Step>
        </ol>
      </div>
    </Slide>
  );
}

function Example() {
  return (
    <Slide id="example">
      <SlideNumber n={6} />
      <div className="flex-1 grid gap-10 lg:grid-cols-[1.1fr_1fr] items-center">
        <div>
          <h2
            className="font-display text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95]"
            style={{ textShadow: "5px 5px 0 var(--accent)" }}
          >
            One sentence in.
            <br />
            <span className="text-accent">A real on-chain agent out.</span>
          </h2>

          <div className="mt-10 nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              Creator types
            </p>
            <p className="mt-3 font-display text-2xl sm:text-3xl font-bold leading-snug">
              &ldquo;$10 a day into SUI for the next month, skip if price
              drops more than 6% in the last hour.&rdquo;
            </p>
          </div>

          <div className="mt-6 nb-border rounded-[var(--radius-lg)] bg-soft p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              Becomes
            </p>
            <pre className="mt-2 overflow-x-auto font-mono text-sm leading-relaxed">{`{
  action: "dca_buy",
  amount_per_execution: 10,
  frequency: "daily",
  total_executions: 30,
  risk_rules: [
    { type: "price_drop", window_hours: 1, threshold_pct: -6 }
  ],
}`}</pre>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">
            Use cases — same primitive
          </p>
          <UseCase emoji="🎁" title="A monthly gift">
            Grandparents fund a recurring SUI buy for a grandchild who
            doesn&apos;t own a wallet.
          </UseCase>
          <UseCase emoji="💼" title="Treasury sub-accounts">
            A DAO grants a bounded buy-back capability to an agent, capped
            per week, revocable by multisig.
          </UseCase>
          <UseCase emoji="🤖" title="Agent-to-agent commerce">
            One agent delegates a tight spend to another to subscribe to a
            data feed. No keys exchanged.
          </UseCase>
          <UseCase emoji="💸" title="Programmable allowances">
            Parents fund a teen&apos;s weekly DCA. The teen only sees the
            outcome — never sources stablecoins.
          </UseCase>
        </div>
      </div>
    </Slide>
  );
}

function Wow() {
  return (
    <Slide id="wow" className="bg-soft/40">
      <SlideNumber n={7} />
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-warn">
          The wow factor
        </p>
        <h2
          className="mt-3 font-display text-6xl sm:text-7xl md:text-8xl font-extrabold leading-[0.9]"
          style={{ textShadow: "5px 5px 0 var(--warn)" }}
        >
          The agent <span className="text-warn">explains itself.</span>
        </h2>

        <p className="mt-8 text-xl sm:text-2xl max-w-4xl text-muted leading-relaxed">
          Every execution is gated by a live risk evaluator: Pyth price
          history + Deepbook orderbook depth. When a rule trips, the agent
          skips — and the LLM writes a one-sentence reason that lands{" "}
          <strong className="text-ink">on chain</strong>.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr] items-stretch">
          <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="h-10 w-10 grid place-items-center nb-border rounded-full bg-warn text-2xl"
              >
                ⏸
              </span>
              <p className="text-sm font-bold uppercase tracking-widest text-muted">
                Today&apos;s buy was paused
              </p>
            </div>
            <p className="mt-4 font-display text-2xl sm:text-3xl font-bold leading-snug">
              &ldquo;SUI dropped 6.2% in the last hour, exceeding your 5%
              threshold — deferring today&apos;s buy.&rdquo;
            </p>
            <dl className="mt-6 grid grid-cols-3 gap-3 text-sm">
              <Stat label="rule" value="price_drop" />
              <Stat label="window" value="1h" />
              <Stat label="observed" value="-6.2%" />
            </dl>
            <p className="mt-5 text-xs text-muted">
              Logged via{" "}
              <code className="font-mono">capability::log_skip</code> —
              budget untouched, slot consumed, recipient sees it on the
              dashboard.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <BoldClaim color="accent">
              Not a cron job. The agent reads market state and decides.
            </BoldClaim>
            <BoldClaim color="accent-2">
              LLM reason is a real model call, validated against a schema
              before it hits chain.
            </BoldClaim>
            <BoldClaim color="warn">
              Slippage cap reads live Deepbook depth — VWAP for our trade
              size, on-chain CLOB makes this trivial.
            </BoldClaim>
          </div>
        </div>
      </div>
    </Slide>
  );
}

function Architecture() {
  return (
    <Slide id="architecture">
      <SlideNumber n={8} />
      <div className="flex-1 flex flex-col">
        <h2
          className="font-display text-5xl sm:text-6xl md:text-7xl font-extrabold leading-[0.95]"
          style={{ textShadow: "5px 5px 0 var(--accent)" }}
        >
          Architecture.
        </h2>
        <p className="mt-3 text-lg text-muted max-w-3xl">
          Trust boundary: anything consequential is an on-chain assertion.
          If the off-chain executor disappears, goes hostile, or runs
          duplicates — funds stay safe.
        </p>

        <div className="mt-8 flex-1 grid gap-4 lg:grid-cols-3">
          {/* Off-chain column */}
          <Box tone="surface" label="Off-chain · creator" emoji="💻">
            <p className="font-semibold">Creator frontend</p>
            <ul className="mt-2 text-sm text-muted flex flex-col gap-1">
              <li>NL → LLM intent compile</li>
              <li>Wallet-signed create PTB</li>
              <li>Share link / QR</li>
            </ul>
          </Box>

          <Box tone="surface" label="Off-chain · recipient" emoji="📱">
            <p className="font-semibold">Recipient frontend</p>
            <ul className="mt-2 text-sm text-muted flex flex-col gap-1">
              <li>zkLogin (Google)</li>
              <li>Sponsored activate / revoke PTBs</li>
              <li>Reads chain events live</li>
            </ul>
          </Box>

          <Box tone="surface" label="Off-chain · executor" emoji="🤖">
            <p className="font-semibold">Agent service</p>
            <ul className="mt-2 text-sm text-muted flex flex-col gap-1">
              <li>Polls due capabilities</li>
              <li>Reads Pyth + Deepbook depth</li>
              <li>Signs + submits PTBs</li>
            </ul>
          </Box>

          {/* On-chain row */}
          <div className="lg:col-span-3 nb-border nb-shadow rounded-[var(--radius-lg)] bg-accent/10 p-5 sm:p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-accent">
              Sui testnet · the trust root
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ChainBox title="vouch::capability">
                AgentCapability object · all asserts · all events
              </ChainBox>
              <ChainBox title="vouch::vault">
                Vault&lt;USDC&gt; · friend-gated withdraw · revoke refunds
              </ChainBox>
              <ChainBox title="Deepbook v3">
                CLOB pool · market orders · depth read pre-trade
              </ChainBox>
              <ChainBox title="Pyth">
                SUI/USD feed · price-drop window comparison
              </ChainBox>
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-muted text-center">
          Creator wallet ↔ create · Recipient zkLogin ↔ activate / revoke ·
          Agent keypair ↔ execute / skip · all three meet at the capability
          object.
        </p>
      </div>
    </Slide>
  );
}

function Demo() {
  return (
    <Slide id="demo" className="bg-ink text-bg">
      <SlideNumber n={9} />
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="font-display text-3xl sm:text-4xl font-bold text-bg/70">
          Enough slides.
        </p>
        <h2
          className="mt-4 font-display font-extrabold leading-[0.85] tracking-tight text-[100px] sm:text-[180px] md:text-[240px] lg:text-[280px]"
          style={{
            color: "var(--bg)",
            textShadow: "6px 6px 0 var(--accent), 14px 14px 0 var(--accent-2)",
          }}
        >
          Demo.
        </h2>

        <div className="mt-12 grid gap-3 sm:grid-cols-3 max-w-5xl w-full">
          <DemoBeat n="1" color="accent">
            Type intent → create link → wallet signs.
          </DemoBeat>
          <DemoBeat n="2" color="accent-2">
            Recipient: Google sign-in → activate → real testnet trade fires.
          </DemoBeat>
          <DemoBeat n="3" color="warn">
            Simulate price drop → agent skips with reason → revoke kills it.
          </DemoBeat>
        </div>

        <div className="mt-12 flex flex-wrap gap-3 justify-center">
          <Link
            href="/create"
            className="nb-border bg-accent text-bg px-6 py-3 rounded-[var(--radius)] font-display font-extrabold text-lg nb-shadow"
          >
            Create a delegation →
          </Link>
          <Link
            href="/"
            className="nb-border bg-bg text-ink px-6 py-3 rounded-[var(--radius)] font-display font-extrabold text-lg nb-shadow"
          >
            Open the app
          </Link>
        </div>

        <p className="mt-12 text-sm text-bg/50">
          Sui testnet · Agentic Web track, Sub-track 2 · Autonomous Agent
          Wallet
        </p>
      </div>
    </Slide>
  );
}

/* ---------------- Small UI helpers ---------------- */

type ToneAccent = "accent" | "accent-2" | "warn" | "danger";

function toneBg(t: ToneAccent): string {
  return t === "accent"
    ? "bg-accent text-bg"
    : t === "accent-2"
      ? "bg-accent-2 text-ink"
      : t === "warn"
        ? "bg-warn text-ink"
        : "bg-danger text-bg";
}

function Pill({
  tone,
  label,
  children,
}: {
  tone: ToneAccent;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-5">
      <div className="flex items-center gap-3">
        <span
          className={`nb-border rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-bold uppercase tracking-widest ${toneBg(tone)}`}
        >
          {label}
        </span>
      </div>
      <p className="mt-3 text-lg leading-snug">{children}</p>
    </div>
  );
}

function BadOption({
  tone,
  title,
  children,
}: {
  tone: "warn" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className={`nb-border rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${
            tone === "warn" ? "bg-warn text-ink" : "bg-danger text-bg"
          }`}
        >
          ✗ The trap
        </span>
      </div>
      <h3 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight">
        {title}
      </h3>
      <p className="mt-3 text-lg leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function Invariant({
  n,
  tone,
  title,
  children,
}: {
  n: string;
  tone: ToneAccent;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius)] bg-surface p-4 sm:p-5 flex items-start gap-4">
      <span
        className={`shrink-0 nb-border rounded-[var(--radius-sm)] ${toneBg(tone)} font-display text-xl font-extrabold px-3 py-1.5`}
      >
        {n}
      </span>
      <div>
        <p className="font-display text-xl font-extrabold leading-tight">{title}</p>
        <p className="mt-1 text-base text-muted leading-snug">{children}</p>
      </div>
    </div>
  );
}

function Step({
  n,
  tone,
  title,
  children,
}: {
  n: string;
  tone: ToneAccent;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-5">
      <span
        className={`inline-grid place-items-center h-10 w-10 nb-border rounded-full ${toneBg(tone)} font-display text-xl font-extrabold`}
      >
        {n}
      </span>
      <h3 className="mt-4 font-display text-xl font-extrabold leading-tight">
        {title}
      </h3>
      <p className="mt-2 text-base text-muted leading-snug">{children}</p>
    </li>
  );
}

function UseCase({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-border rounded-[var(--radius)] bg-surface p-4 flex items-start gap-3">
      <span aria-hidden className="text-2xl leading-none">
        {emoji}
      </span>
      <div>
        <p className="font-display text-lg font-extrabold leading-tight">
          {title}
        </p>
        <p className="mt-1 text-sm text-muted leading-snug">{children}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="nb-border rounded-[var(--radius-sm)] bg-bg px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm font-bold">{value}</p>
    </div>
  );
}

function BoldClaim({
  color,
  children,
}: {
  color: ToneAccent;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`nb-border nb-shadow rounded-[var(--radius)] p-5 ${toneBg(color)}`}
    >
      <p className="font-display text-lg sm:text-xl font-extrabold leading-tight">
        {children}
      </p>
    </div>
  );
}

function Box({
  tone,
  label,
  emoji,
  children,
}: {
  tone: "surface";
  label: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`nb-border nb-shadow rounded-[var(--radius-lg)] p-5 ${
        tone === "surface" ? "bg-surface" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {emoji}
        </span>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">
          {label}
        </p>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function ChainBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-border rounded-[var(--radius)] bg-surface p-3">
      <p className="font-mono text-sm font-extrabold">{title}</p>
      <p className="mt-1 text-xs text-muted leading-snug">{children}</p>
    </div>
  );
}

function DemoBeat({
  n,
  color,
  children,
}: {
  n: string;
  color: ToneAccent;
  children: React.ReactNode;
}) {
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-bg text-ink p-4 sm:p-5 text-left">
      <span
        className={`inline-grid place-items-center h-9 w-9 nb-border rounded-full ${toneBg(color)} font-display text-lg font-extrabold`}
      >
        {n}
      </span>
      <p className="mt-3 font-display text-base sm:text-lg font-bold leading-snug">
        {children}
      </p>
    </div>
  );
}
