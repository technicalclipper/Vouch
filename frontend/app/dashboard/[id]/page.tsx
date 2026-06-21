"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Card } from "../../_components/Card";
import { Button } from "../../_components/Button";
import { StatusPill } from "../../_components/StatusPill";
import { BigNumber } from "../../_components/BigNumber";
import { ActivityItem } from "../../_components/ActivityItem";
import { Modal } from "../../_components/Modal";
import { ToastHost, toast } from "../../_components/Toast";
import { useCapabilityById } from "../../_components/useCapability";
import { useChainCapabilityById } from "../../_lib/useChainCapability";
import { revoke, runNow } from "../../_lib/mockStore";
import { getCapLabel } from "../../_lib/capLabels";
import { runNowOnChain, CapNotDueError } from "../../_lib/executor";
import { revokeCapabilityOnChain } from "../../_lib/chain/revokeCapability";
import { formatNextBuy, formatSui, formatUsd } from "../../_lib/format";

function looksLikeCapId(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

// Drill-in view — creator-side mirror of recipient activity + revoke (DESIGN.md §5).
// `id` shape decides chain vs mock, same dispatch as the recipient page.
export default function CapabilityDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const chainMode = looksLikeCapId(id);
  const mock = useCapabilityById(chainMode ? "" : id);
  const chain = useChainCapabilityById(chainMode ? id : "");
  const base = chainMode ? chain.cap : mock.cap;
  const ready = chainMode ? chain.ready : mock.ready;
  // Overlay creator-private metadata (nickname / funder name / token) saved
  // at create. The token isn't on chain (only sha2_256(token) is), so the
  // share URL is unrecoverable without the localStorage entry.
  const cap = base
    ? chainMode
      ? (() => {
          const meta = getCapLabel(base.id);
          return {
            ...base,
            recipient_label: base.recipient_label ?? meta?.label,
            funder_name: meta?.funderName ?? base.funder_name,
            token: base.token || meta?.token || "",
          };
        })()
      : base
    : undefined;
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  async function handleChainRevoke() {
    if (!cap || revoking) return;
    if (!account) {
      toast("Connect your wallet to revoke.", "info");
      return;
    }
    if (!cap.vault_id) {
      toast("Missing vault id — reload the page.", "info");
      return;
    }
    setRevoking(true);
    try {
      toast("Revoking…", "info");
      const r = await revokeCapabilityOnChain({
        capId: cap.id,
        vaultId: cap.vault_id,
        userAddress: account.address,
        signAndExecute,
      });
      toast(`Revoked. ${r.digest.slice(0, 10)}…`);
      setConfirmRevoke(false);
      // Status change + refund are on chain; reload so the poller re-reads.
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[creator-revoke]", err);
      toast(`Revoke failed: ${(err as Error).message}`, "info");
    } finally {
      setRevoking(false);
    }
  }

  async function handleRunNow(force?: "execute" | "skip") {
    if (!cap || busy) return;
    if (!chainMode) {
      runNow(cap.id, { forceSkip: force === "skip" });
      toast(
        force === "skip" ? "Agent paused this week." : "Agent placed a buy.",
        force === "skip" ? "info" : "success",
      );
      return;
    }
    setBusy(true);
    try {
      const r = await runNowOnChain(cap.id, force ? { force } : {});
      if (r.action === "execute") {
        toast(`Agent placed a buy. (${r.digest.slice(0, 10)}…)`);
      } else {
        toast(`Agent paused: ${r.reason}`, "info");
      }
    } catch (err) {
      if (err instanceof CapNotDueError) {
        const ms = err.nextExecutionAt - Date.now();
        const hrs = Math.max(1, Math.round(ms / 3_600_000));
        toast(`Not due yet — next buy in ~${hrs}h.`, "info");
      } else {
        toast(`Run failed: ${(err as Error).message}`, "info");
      }
    } finally {
      setBusy(false);
    }
  }
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
            On chain:{" "}
            <a
              className="underline underline-offset-4 font-mono text-sm"
              href={`https://suiscan.xyz/testnet/object/${cap.id}`}
              target="_blank"
              rel="noreferrer"
            >
              {cap.id.slice(0, 10)}…{cap.id.slice(-6)}
            </a>
          </p>
        </div>
        <StatusPill status={cap.status} />
      </header>

      <ShareLinkCard token={cap.token} status={cap.status} />

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
            disabled={revoking}
            onClick={() => {
              if (chainMode) {
                handleChainRevoke();
              } else {
                revoke(cap.id);
                setConfirmRevoke(false);
                toast("Revoked. Funds are on their way back.");
              }
            }}
          >
            {revoking ? "Revoking…" : "Revoke"}
          </Button>
        </div>
      </Modal>

      <ToastHost />
    </main>
  );
}

// ---------- Share link card ----------
// Always visible on the drill-in so the creator can re-share at any time.
// The raw activation token isn't on chain (only sha2_256(token) is), so we
// can only show the full URL when it was persisted at create time (same
// browser). For chain caps loaded from another device we fall back to a
// "link unavailable" hint pointing at Suiscan.
function ShareLinkCard({
  token,
  status,
}: {
  token: string;
  status: string;
}) {
  const [copied, setCopied] = useState(false);
  const path = token ? `/c/${token}` : "";
  const isStopped = status === "stopped";

  async function copy() {
    if (!token) return;
    // Build the absolute URL at click time so we don't need an effect / state
    // (avoids SSR hydration mismatch and react-hooks/set-state-in-effect).
    const url = `${window.location.origin}/c/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast("Link copied.");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Couldn't copy — long-press the field to copy manually.", "info");
    }
  }

  if (!token) {
    return (
      <Card fill="soft" className="mt-6 !p-4">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          Share link
        </p>
        <p className="mt-2 text-base text-muted">
          The activation link isn&apos;t available on this device. It was
          only stored in the browser used to create this delegation — open
          the same browser, or create a new delegation to get a new link.
        </p>
      </Card>
    );
  }

  return (
    <Card fill="soft" className="mt-6 !p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          Share link {isStopped ? "· revoked" : ""}
        </p>
        {isStopped ? (
          <span className="text-xs font-bold text-danger">
            no longer activates
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
        <code className="flex-1 min-w-0 truncate font-mono text-sm nb-border bg-bg px-3 py-2 rounded">
          {path}
        </code>
        <div className="flex gap-2">
          <Button size="md" variant="primary" onClick={copy}>
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Link href={`/c/${token}`} target="_blank" rel="noreferrer">
            <Button size="md" variant="ghost">
              Open
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
