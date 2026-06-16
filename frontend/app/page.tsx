"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "./_components/Card";
import { Button } from "./_components/Button";
import { resetAll } from "./_lib/mockStore";

export default function DevLanding() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <main className="relative mx-auto w-full max-w-6xl px-6 py-10 sm:py-14">
      {/* Decorative neobrutalist shapes — flat fills, hard offset shadows, no gradients. */}
      <DecorShape
        className="hidden sm:block absolute right-[-28px] top-[60px] h-20 w-20 bg-accent rotate-[8deg]"
      />
      <DecorShape
        className="hidden sm:block absolute left-[-32px] top-[260px] h-14 w-14 bg-accent-2 rotate-[-12deg] rounded-full"
      />
      <DecorShape
        className="hidden md:block absolute right-[40px] top-[300px] h-10 w-10 bg-warn rotate-[20deg]"
      />

      {/* ---------- HERO ---------- */}
      <section className="relative">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 nb-border rounded-full bg-soft px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
            <span className="inline-block h-2 w-2 rounded-full bg-accent-2" />
            Sui testnet · agentic web track
          </span>
        </div>

        <h1
          className="mt-6 font-display font-extrabold leading-[0.85] tracking-[-0.04em]
                     text-[96px] sm:text-[160px] md:text-[220px] lg:text-[260px]"
          style={{
            // Layered offset text-shadow gives the brutalist "stamped" feel.
            textShadow:
              "6px 6px 0 var(--ink), 12px 12px 0 var(--accent)",
          }}
        >
          Vouch.
        </h1>

        <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr] md:items-end">
          <p className="font-display text-3xl sm:text-4xl font-bold leading-tight max-w-2xl">
            Delegate to an AI agent.
            <br />
            <span className="text-accent">Bounded</span> by Move.{" "}
            <span className="text-accent-2">Revoked</span> in one tap.
          </p>

          <Card fill="soft" className="!p-5">
            <p className="text-base leading-relaxed">
              Shareable links that grant an agent a tight, revocable capability
              to execute on someone&apos;s behalf — onboarded with a Google
              login, settled on Deepbook.
            </p>
          </Card>
        </div>
      </section>

      {/* ---------- WHAT TO DEMO ---------- */}
      <section className="mt-16 sm:mt-20">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
            Pick a side to demo
          </h2>
          <p className="hidden sm:block text-sm text-muted">
            Data is mocked client-side · reset anytime
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* RECIPIENT */}
          <Card hero className="relative overflow-hidden">
            <Sticker tone="accent-2">📱  Mobile</Sticker>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              For the recipient
            </p>
            <h3 className="mt-2 font-display text-3xl sm:text-[34px] font-extrabold leading-tight">
              Open a shared link
            </h3>
            <p className="mt-3 text-base text-muted leading-relaxed">
              The mobile-first flow someone non-technical sees when they tap
              the link Alex sent. Pass the &ldquo;mom test&rdquo; or it failed.
            </p>

            <div className="mt-6 grid gap-3">
              <Link href="/c/pending" className="block">
                <Button variant="primary" fullWidth>
                  First-time activation →
                </Button>
              </Link>
              <Link href="/c/demo" className="block">
                <Button variant="ghost" fullWidth>
                  Already-active dashboard
                </Button>
              </Link>
            </div>

            <ul className="mt-6 flex flex-col gap-2 text-sm text-muted">
              <Bullet>Sign in with Google — no wallet, no seed phrase</Bullet>
              <Bullet>Watch the agent buy, pause with a reason, or stop</Bullet>
            </ul>
          </Card>

          {/* CREATOR */}
          <Card hero className="relative overflow-hidden">
            <Sticker tone="accent">💻  Desktop</Sticker>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">
              For the creator
            </p>
            <h3 className="mt-2 font-display text-3xl sm:text-[34px] font-extrabold leading-tight">
              Set up a delegation
            </h3>
            <p className="mt-3 text-base text-muted leading-relaxed">
              Natural-language intent → strict JSON preview → fund once → share
              the link. Mirror the activity. Revoke anytime.
            </p>

            <div className="mt-6 grid gap-3">
              <Link href="/create" className="block">
                <Button variant="primary" fullWidth>
                  Create a delegation →
                </Button>
              </Link>
              <Link href="/dashboard" className="block">
                <Button variant="ghost" fullWidth>
                  Open creator dashboard
                </Button>
              </Link>
            </div>

            <ul className="mt-6 flex flex-col gap-2 text-sm text-muted">
              <Bullet>Hard per-execution cap, enforced by Move</Bullet>
              <Bullet>See every buy and skip — revoke refunds the vault</Bullet>
            </ul>
          </Card>
        </div>
      </section>

      {/* ---------- INVARIANTS STRIP ---------- */}
      <section className="mt-16">
        <p className="text-xs font-bold uppercase tracking-widest text-muted mb-3">
          Non-negotiables
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Invariant n="01" tone="accent">
            The agent <strong>cannot</strong> exceed the budget.
          </Invariant>
          <Invariant n="02" tone="accent-2">
            Every action is <strong>logged on-chain</strong>.
          </Invariant>
          <Invariant n="03" tone="warn">
            Revocation <strong>kills</strong> the agent in one tap.
          </Invariant>
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="mt-16 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t-[2.5px] border-ink/15 pt-6">
        <p className="text-sm text-muted">
          Mock store key:{" "}
          <code className="font-mono nb-border bg-bg px-1.5 py-0.5 rounded text-xs">
            vouch.mock.v1
          </code>{" "}
          in <code className="font-mono">localStorage</code>
        </p>
        <Button
          variant="ghost"
          size="md"
          onClick={() => {
            if (!mounted) return;
            resetAll();
            window.location.reload();
          }}
        >
          Reset mock data
        </Button>
      </footer>
    </main>
  );
}

/* ---------- Local presentational helpers (used only on this page) ---------- */

function DecorShape({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none nb-border nb-shadow ${className}`}
    />
  );
}

function Sticker({
  tone,
  children,
}: {
  tone: "accent" | "accent-2";
  children: React.ReactNode;
}) {
  const bg = tone === "accent" ? "bg-accent text-white" : "bg-accent-2 text-ink";
  return (
    <span
      className={`absolute right-5 top-5 nb-border rounded-full ${bg} px-3 py-1 text-xs font-bold tracking-wide rotate-[6deg] nb-shadow-press`}
    >
      {children}
    </span>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className="mt-[7px] inline-block h-2 w-2 rounded-full bg-ink shrink-0"
      />
      <span>{children}</span>
    </li>
  );
}

function Invariant({
  n,
  tone,
  children,
}: {
  n: string;
  tone: "accent" | "accent-2" | "warn";
  children: React.ReactNode;
}) {
  const bg =
    tone === "accent"
      ? "bg-accent text-white"
      : tone === "accent-2"
        ? "bg-accent-2 text-ink"
        : "bg-warn text-ink";
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius)] bg-surface p-4 flex items-start gap-3">
      <span
        className={`shrink-0 nb-border rounded-[var(--radius-sm)] ${bg} font-display text-lg font-extrabold px-2.5 py-1`}
      >
        {n}
      </span>
      <p className="text-base leading-snug">{children}</p>
    </div>
  );
}
