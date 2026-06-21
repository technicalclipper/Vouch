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
import { runNowOnChain, CapNotDueError } from "../../_lib/executor";
import { toast } from "../../_components/Toast";
import { useZkLogin } from "../../_lib/zklogin/useZkLogin";
import { revokeCapability } from "../../_lib/zklogin/revoke";

// Friendly relative timestamp for "next buy" copy. Sub-minute → "in a moment".
function formatUntil(at: number): string {
  const ms = at - Date.now();
  if (ms <= 0) return "now";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "in a moment";
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h}h`;
  const d = Math.round(h / 24);
  return `in ${d}d`;
}

// R3 + R4 in DESIGN.md §5.
// `chainMode=true` swaps mock actions for real executor + chain-state reads.
export function Dashboard({
  cap,
  chainMode = false,
}: {
  cap: Capability;
  chainMode?: boolean;
}) {
  const [confirmStop, setConfirmStop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const { session } = useZkLogin();
  const isStopped = cap.status === "stopped";
  const isDone = cap.status === "done";

  async function handleRunNow(force?: "execute" | "skip") {
    if (busy) return;
    setBusy(true);
    try {
      if (chainMode) {
        const r = await runNowOnChain(cap.id, force ? { force } : {});
        if (r.action === "execute") {
          toast(`Agent placed a buy. (${r.digest.slice(0, 10)}…)`);
        } else {
          toast(`Agent paused: ${r.reason}`, "info");
        }
      } else {
        runNow(cap.id, { forceSkip: force === "skip" });
        toast(
          force === "skip"
            ? "Agent paused this week."
            : "Agent placed a buy.",
          force === "skip" ? "info" : "success",
        );
      }
    } catch (err) {
      if (err instanceof CapNotDueError) {
        toast(`Not due yet — next buy ${formatUntil(err.nextExecutionAt)}.`, "info");
      } else {
        toast(`Run failed: ${(err as Error).message}`, "info");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    if (chainMode) {
      if (!session) {
        toast("Sign in with Google first to stop this.", "info");
        return;
      }
      if (!cap.vault_id) {
        toast("Missing vault id — can't revoke. Reload the page.", "info");
        return;
      }
      setStopping(true);
      try {
        toast("Stopping…", "info");
        const { digest } = await revokeCapability(
          session,
          cap.id,
          cap.vault_id,
        );
        toast(`Stopped. ${digest.slice(0, 10)}…`);
        setConfirmStop(false);
        // Refund + status change is on chain; reload to pull fresh state.
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        toast(`Stop failed: ${(err as Error).message}`, "info");
      } finally {
        setStopping(false);
      }
      return;
    }
    revoke(cap.id);
    setConfirmStop(false);
    toast("Stopped. Any unused money is on its way back.");
  }

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

      {/* Execution controls — collapsed by default so the dashboard stays
          clean for normal users. Operator/demo expands to trigger manually. */}
      {!isStopped && !isDone ? (
        <Card fill="soft" className="!p-4">
          <button
            type="button"
            onClick={() => setControlsOpen((v) => !v)}
            aria-expanded={controlsOpen}
            className="w-full flex items-center justify-between gap-3 text-left nb-focus"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              More
            </p>
            <span
              aria-hidden
              className={`text-ink transition-transform ${
                controlsOpen ? "rotate-90" : ""
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          {controlsOpen ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="md"
                variant="primary"
                disabled={busy}
                onClick={() => handleRunNow()}
              >
                {busy ? "Running…" : "Run now"}
              </Button>
              <Button
                size="md"
                variant="ghost"
                disabled={busy}
                onClick={() => handleRunNow("skip")}
              >
                Run with simulated price drop
              </Button>
            </div>
          ) : null}
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
            disabled={stopping}
            onClick={handleStop}
          >
            {stopping ? "Stopping…" : "Yes, stop"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
