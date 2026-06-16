"use client";

import { useState } from "react";
import type { Capability } from "../../_lib/types";
import { Card } from "../../_components/Card";
import { Button } from "../../_components/Button";
import { StatusPill } from "../../_components/StatusPill";
import { CountdownChip } from "../../_components/CountdownChip";
import { BigNumber } from "../../_components/BigNumber";
import { ActivityItem } from "../../_components/ActivityItem";
import { Modal } from "../../_components/Modal";
import { formatSui, formatUsd } from "../../_lib/format";
import { revoke, runNow } from "../../_lib/mockStore";
import { toast } from "../../_components/Toast";

// R3 + R4 in DESIGN.md §5.
export function Dashboard({ cap }: { cap: Capability }) {
  const [confirmStop, setConfirmStop] = useState(false);
  const isStopped = cap.status === "stopped";
  const isDone = cap.status === "done";

  const usedUsd = cap.budget_total - cap.budget_remaining;
  const events = [...cap.events].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[26px] sm:text-3xl font-extrabold leading-tight">
          Your weekly SUI buys
        </h1>
        <StatusPill status={cap.status} />
      </header>

      <Card hero>
        <BigNumber
          label="SUI bought so far"
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
        <div className="mt-5">
          {!isStopped && !isDone ? (
            <CountdownChip at={cap.next_execution_at} />
          ) : (
            <p className="text-base text-muted">
              {isStopped
                ? "You stopped this — no more buys."
                : "All buys are done."}
            </p>
          )}
        </div>
      </Card>

      {/* Demo-only execution controls. Hidden from real users but useful for
          showing the agent in action during the live demo (CLAUDE.md §5 §6). */}
      {!isStopped && !isDone ? (
        <Card fill="soft" className="!p-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">
            Demo controls
          </p>
          <p className="mt-1 text-sm text-muted">
            Trigger the agent without waiting for the schedule.
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
              Run with simulated price drop
            </Button>
          </div>
        </Card>
      ) : null}

      <section>
        <h2 className="text-xl font-extrabold">What&apos;s happened so far</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {events.map((e) => (
            <ActivityItem key={e.id} event={e} funderName={cap.funder_name} />
          ))}
        </ul>
      </section>

      {!isStopped ? (
        <div className="pt-4">
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setConfirmStop(true)}
            className="!text-danger !bg-bg"
          >
            Stop anytime
          </Button>
        </div>
      ) : null}

      <p className="pt-2 text-center text-sm text-muted">
        Set up by {cap.funder_name}
      </p>

      <Modal
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title="Stop your weekly buys?"
      >
        <p className="text-base">
          Any unused money goes back to {cap.funder_name}. You can&apos;t undo
          this.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <Button
            variant="ghost"
            fullWidth
            onClick={() => setConfirmStop(false)}
          >
            Keep it going
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              revoke(cap.id);
              setConfirmStop(false);
              toast("Stopped. Any unused money is on its way back.");
            }}
          >
            Yes, stop
          </Button>
        </div>
      </Modal>
    </div>
  );
}
