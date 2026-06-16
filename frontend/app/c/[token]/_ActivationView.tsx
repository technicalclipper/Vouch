"use client";

import { useState } from "react";
import type { Capability } from "../../_lib/types";
import { Card } from "../../_components/Card";
import { Button } from "../../_components/Button";
import { describeIntent } from "../../_lib/format";
import { activate } from "../../_lib/mockStore";
import { toast } from "../../_components/Toast";

// R1 → R2 in DESIGN.md §5.
// All copy passes the §6 mom-test guide: no jargon, second person, reassurance.
export function ActivationView({ cap }: { cap: Capability }) {
  const [step, setStep] = useState<"R1" | "signingIn" | "R2">("R1");

  async function signIn() {
    setStep("signingIn");
    // Mock zkLogin latency. Real wiring uses Enoki (CLAUDE.md §7.1).
    await new Promise((r) => setTimeout(r, 1400));
    setStep("R2");
  }

  function turnOn() {
    const fakeOwner =
      "0x" +
      Array.from({ length: 8 }, () =>
        Math.random().toString(16).slice(2, 10)
      ).join("");
    activate(cap.token, fakeOwner);
    toast("All set — your weekly buys are on.");
  }

  if (step === "R1") {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <p className="text-base font-semibold text-muted">
            {cap.funder_name} set something up for you.
          </p>
          <h1 className="mt-1 font-display text-3xl sm:text-[34px] font-extrabold leading-tight">
            A little SUI, every week.
          </h1>
        </header>

        <Card hero>
          <p className="text-[19px] leading-relaxed">
            {describeIntent(cap.intent, cap.funder_name)}
          </p>
        </Card>

        <Card fill="soft" className="!p-4">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-2xl leading-none">🔒</span>
            <p className="text-base">
              <strong className="font-semibold">Safe.</strong> You can stop
              whenever you want. {cap.funder_name} already paid for it; you
              won&apos;t be charged anything.
            </p>
          </div>
        </Card>

        <Button variant="primary" fullWidth onClick={signIn}>
          Sign in with Google to start
        </Button>

        <p className="text-center text-sm text-muted">
          No app to install. No password to remember.
        </p>
      </div>
    );
  }

  if (step === "signingIn") {
    return (
      <Card hero className="text-center">
        <div className="mx-auto h-12 w-12 nb-border rounded-full bg-soft animate-[pulse_1.2s_ease-in-out_infinite]" />
        <h1 className="mt-5 font-display text-2xl font-extrabold">
          Setting things up…
        </h1>
        <p className="mt-2 text-muted">This takes a few seconds.</p>
        <style>{`@keyframes pulse {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(0.9); }
        }`}</style>
      </Card>
    );
  }

  // R2 — just signed in
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold leading-tight">
          You&apos;re all set up.
        </h1>
        <p className="mt-2 text-muted">
          No app or password to remember.
        </p>
      </header>

      <Card hero>
        <p className="text-[19px] leading-relaxed">
          {describeIntent(cap.intent, cap.funder_name)}
        </p>
      </Card>

      <div className="flex flex-col gap-3">
        <Button variant="success" fullWidth onClick={turnOn}>
          Turn it on
        </Button>
        <button
          className="text-base font-medium text-muted underline underline-offset-4 self-center"
          onClick={() => history.back()}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
