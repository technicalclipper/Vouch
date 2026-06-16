"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Card } from "../../_components/Card";
import { Button } from "../../_components/Button";
import { StatusPill } from "../../_components/StatusPill";
import { BigNumber } from "../../_components/BigNumber";
import { ActivityItem } from "../../_components/ActivityItem";
import { Modal } from "../../_components/Modal";
import { ToastHost, toast } from "../../_components/Toast";
import { useCapabilityById } from "../../_components/useCapability";
import { revoke, runNow } from "../../_lib/mockStore";
import { formatNextBuy, formatSui, formatUsd } from "../../_lib/format";

// Drill-in view — creator-side mirror of recipient activity + revoke (DESIGN.md §5).
export default function CapabilityDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { cap, ready } = useCapabilityById(id);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  if (!ready) return null;
  if (!cap) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-12">
        <Card>
          <h1 className="text-2xl font-extrabold">Not found</h1>
          <Link href="/dashboard" className="mt-4 inline-block">
            <Button size="md" variant="ghost">
              Back to dashboard
            </Button>
          </Link>
        </Card>
      </main>
    );
  }

  const usedUsd = cap.budget_total - cap.budget_remaining;
  const events = [...cap.events].sort((a, b) => b.timestamp - a.timestamp);
  const isStopped = cap.status === "stopped";
  const isDone = cap.status === "done";

  return (
    <main
      data-flow="creator"
      className="mx-auto w-full max-w-3xl px-6 py-12"
    >
      <Link
        href="/dashboard"
        className="text-sm font-semibold text-muted underline underline-offset-4"
      >
        ← All delegations
      </Link>

      <header className="mt-3 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight">
            {cap.recipient_label ?? "Delegation"}
          </h1>
          <p className="mt-2 text-muted">
            Shared link:{" "}
            <Link
              className="underline underline-offset-4"
              href={`/c/${cap.token}`}
            >
              /c/{cap.token}
            </Link>
          </p>
        </div>
        <StatusPill status={cap.status} />
      </header>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <Card hero>
          <BigNumber
            label="SUI bought"
            value={formatSui(cap.total_sui_bought)}
            sub={
              <>
                <strong className="font-semibold text-ink">
                  {formatUsd(usedUsd)}
                </strong>{" "}
                of {formatUsd(cap.budget_total)} used
              </>
            }
          />
          {!isStopped && !isDone ? (
            <p className="mt-4 text-base text-muted">
              Next: {formatNextBuy(cap.next_execution_at)}
            </p>
          ) : null}
        </Card>

        <Card>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">
            Rules
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            <li className="text-base">
              At most{" "}
              <strong>{formatUsd(cap.intent.amount_per_execution)}</strong> per
              buy, hard-enforced on chain.
            </li>
            <li className="text-base">
              {cap.intent.total_executions} buys total, then it stops itself.
            </li>
            {cap.intent.risk_rules.map((r, i) => (
              <li key={i} className="text-base">
                {r.type === "price_drop"
                  ? `Pauses if SUI drops ${Math.abs(r.threshold_pct)}% in ${r.window_hours}h.`
                  : `Pauses if estimated slippage exceeds ${r.threshold_pct}%.`}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {!isStopped && !isDone ? (
        <Card fill="soft" className="mt-6 !p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">
            Demo controls
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="md"
              variant="primary"
              onClick={() => {
                runNow(cap.id);
                toast("Agent placed a buy.");
              }}
            >
              Run now
            </Button>
            <Button
              size="md"
              variant="ghost"
              onClick={() => {
                runNow(cap.id, { forceSkip: true });
                toast("Agent paused this week.", "info");
              }}
            >
              Force skip
            </Button>
            <Button
              size="md"
              variant="ghost"
              onClick={() => setConfirmRevoke(true)}
              className="!text-danger !bg-bg"
            >
              Revoke
            </Button>
          </div>
        </Card>
      ) : null}

      <section className="mt-8">
        <h2 className="text-2xl font-extrabold">Activity</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {events.map((e) => (
            <ActivityItem key={e.id} event={e} funderName={cap.funder_name} />
          ))}
        </ul>
      </section>

      <Modal
        open={confirmRevoke}
        onClose={() => setConfirmRevoke(false)}
        title="Revoke this delegation?"
      >
        <p className="text-base">
          The agent will be unable to execute another trade. Remaining{" "}
          {formatUsd(cap.budget_remaining)} returns to you. This can&apos;t be
          undone.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setConfirmRevoke(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              revoke(cap.id);
              setConfirmRevoke(false);
              toast("Revoked. Funds are on their way back.");
            }}
          >
            Revoke
          </Button>
        </div>
      </Modal>

      <ToastHost />
    </main>
  );
}
