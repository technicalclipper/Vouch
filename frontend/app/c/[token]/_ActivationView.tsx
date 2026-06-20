"use client";

import { useState } from "react";
import type { Capability } from "../../_lib/types";
import { Card } from "../../_components/Card";
import { Button } from "../../_components/Button";
import { describeIntent } from "../../_lib/format";
import { activate } from "../../_lib/mockStore";
import { toast } from "../../_components/Toast";
import { useZkLogin } from "../../_lib/zklogin/useZkLogin";
import { startSignIn } from "../../_lib/zklogin/session";

// R1 → R2 in DESIGN.md §5.
// `chainMode=true` swaps the mock activate() / fake latency for the real
// self-hosted zkLogin redirect. After Google returns to /auth/callback the
// session is persisted and the view re-renders into R2.
export function ActivationView({
  cap,
  chainMode = false,
}: {
  cap: Capability;
  chainMode?: boolean;
}) {
  const { session, ready: sessionReady } = useZkLogin();
  const [step, setStep] = useState<"R1" | "signingIn" | "R2">(
    chainMode && session ? "R2" : "R1",
  );

  // For chain mode, once a session is detected we jump to R2.
  if (chainMode && sessionReady && session && step === "R1") {
    setStep("R2");
  }

  async function signIn() {
    if (chainMode) {
      setStep("signingIn");
      try {
        // Round-trip to Google; this navigates away from the page.
        await startSignIn(window.location.pathname + window.location.search);
      } catch (err) {
        toast(`Sign-in didn't start: ${(err as Error).message}`, "info");
        setStep("R1");
      }
      return;
    }
    setStep("signingIn");
    // Mock zkLogin latency for the existing mockStore demo path.
    await new Promise((r) => setTimeout(r, 1400));
    setStep("R2");
  }

  function turnOn() {
    if (chainMode) {
      // Real activation PTB is the next chunk — it needs the session to
      // sign `capability::activate(cap, token, clock)`. For now surface
      // that honestly.
      toast(
        "Wallet ready. Activation PTB lands in the next chunk.",
        "info",
      );
      return;
    }
    const fakeOwner =
      "0x" +
      Array.from({ length: 8 }, () =>
        Math.random().toString(16).slice(2, 10),
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
            <span aria-hidden className="text-2xl leading-none">
              🔒
            </span>
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
          {chainMode ? "Redirecting to Google…" : "Setting things up…"}
        </h1>
        <p className="mt-2 text-muted">This takes a few seconds.</p>
        <style>{`@keyframes pulse {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(0.9); }
        }`}</style>
      </Card>
    );
  }

  // R2 — signed in (either mock-instant or real zkLogin round-trip).
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-extrabold leading-tight">
          You&apos;re all set up.
        </h1>
        <p className="mt-2 text-muted">No app or password to remember.</p>
      </header>

      {chainMode && session ? (
        <Card fill="soft" className="!p-4">
          <div className="flex items-center gap-3">
            {session.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.picture}
                alt=""
                className="h-9 w-9 rounded-full nb-border"
              />
            ) : null}
            <div className="text-sm">
              <p className="font-semibold">
                Signed in as {session.name ?? session.email ?? "you"}
              </p>
              <p className="text-muted font-mono">
                {session.address.slice(0, 10)}…{session.address.slice(-6)}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

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
