"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Card } from "../_components/Card";
import { Button } from "../_components/Button";
import { ConnectWallet } from "../_components/ConnectWallet";
import { ToastHost, toast } from "../_components/Toast";
import { createCapability } from "../_lib/mockStore";
import { parseIntent as parseIntentLlm } from "../_lib/executor";
import { createCapabilityOnChain } from "../_lib/chain/createCapability";
import { setCapLabel } from "../_lib/capLabels";
import { useDbusdcBalance } from "../_lib/wallet/useDbusdcBalance";
import { CONFIG } from "../_lib/config";
import type { DCAIntent } from "../_lib/types";
import { formatUsd } from "../_lib/format";

// C1 in DESIGN.md §5. Real path: LLM parses NL → JSON validated by Zod.
// For now, the NL field is shown but the preview is editable directly
// (the spec allows the LLM to be replaced by a form per CLAUDE.md §9).
export default function CreatePage() {
  const router = useRouter();
  const [nl, setNl] = useState("DCA $50/week into SUI for 8 weeks");
  const [intent, setIntent] = useState<DCAIntent>(defaultIntent);
  const [recipientLabel, setRecipientLabel] = useState("Mom");
  const [funderName, setFunderName] = useState("Alex");
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [demoFastInterval, setDemoFastInterval] = useState(false);
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const balance = useDbusdcBalance(account?.address);

  async function parse() {
    setParsing(true);
    try {
      const parsed = await parseIntentLlm(nl);
      setIntent(parsed);
      toast("Parsed — review and edit below.", "info");
    } catch (err) {
      // Fall back to the heuristic so the form still fills in something
      // sensible if the executor / OpenAI is unreachable.
      // eslint-disable-next-line no-console
      console.warn("[intent] LLM parse failed, falling back to heuristic:", err);
      setIntent(parseNL(nl));
      toast(
        `LLM parser unavailable — used heuristic. (${(err as Error).message})`,
        "info",
      );
    } finally {
      setParsing(false);
    }
  }

  async function create() {
    if (creating) return;
    // Chain mode: wallet connected → real PTB.
    if (account) {
      if (balance.human < total) {
        toast(
          `You need ${formatUsd(total)} DBUSDC but have ${formatUsd(balance.human)}. Top up first.`,
          "info",
        );
        return;
      }
      setCreating(true);
      try {
        const r = await createCapabilityOnChain({
          intent,
          agentAddress: CONFIG.agent.address,
          userAddress: account.address,
          demoFastInterval,
          signAndExecute,
        });
        // Persist creator-private metadata (label + funder name) so the
        // dashboard can render them after navigation/reload. The chain
        // doesn't know about either by design.
        setCapLabel(r.cap_id, {
          label: recipientLabel.trim() || undefined,
          funderName: funderName.trim() || undefined,
          // Raw token isn't on chain — persist so the dashboard drill-in
          // can re-render the share link anytime, not just on /share.
          token: r.token,
        });
        const qs = new URLSearchParams({
          token: r.token,
          from: funderName.trim() || "Alex",
        });
        if (recipientLabel.trim()) qs.set("label", recipientLabel.trim());
        router.push(`/create/share/${r.cap_id}?${qs.toString()}`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[create] on-chain create failed:", err);
        toast(`Create failed: ${(err as Error).message}`, "info");
      } finally {
        setCreating(false);
      }
      return;
    }
    // No wallet: mock store fallback (keeps the demo nav working).
    const cap = createCapability({
      intent,
      funder_name: funderName.trim() || "Alex",
      recipient_label: recipientLabel.trim() || undefined,
    });
    router.push(`/create/share/${cap.id}`);
  }

  const total = intent.amount_per_execution * intent.total_executions;
  const insufficient = !!account && !balance.loading && balance.human < total;

  return (
    <main
      data-flow="creator"
      className="mx-auto w-full max-w-5xl px-6 py-12"
    >
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">
            Create
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight">
            Set up a delegation.
          </h1>
        </div>
        <ConnectWallet />
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <label className="block">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted">
              Describe what you want the agent to do
            </span>
            <textarea
              className="mt-2 block w-full nb-border rounded-[var(--radius)] bg-bg p-4 text-base resize-none nb-focus"
              rows={3}
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              placeholder="DCA $50/week into SUI for 8 weeks"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                className="nb-border rounded-full bg-soft px-3 py-1.5 text-sm font-medium nb-pressable nb-focus"
                onClick={() => setNl(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="mt-5">
            <Button size="md" variant="ghost" onClick={parse} disabled={parsing}>
              {parsing ? "Parsing…" : "Parse with AI"}
            </Button>
          </div>

          <div className="mt-8 grid gap-4">
            <Field label="Your name (shown to recipient)">
              <input
                className="w-full nb-border rounded-[var(--radius)] bg-bg p-3 text-base nb-focus"
                value={funderName}
                onChange={(e) => setFunderName(e.target.value)}
              />
            </Field>
            <Field label="Recipient nickname (private to you)">
              <input
                className="w-full nb-border rounded-[var(--radius)] bg-bg p-3 text-base nb-focus"
                value={recipientLabel}
                onChange={(e) => setRecipientLabel(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card hero>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">
            Preview
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">
            Buy {formatUsd(intent.amount_per_execution)} of SUI{" "}
            {intent.frequency === "weekly"
              ? `every ${cap(intent.day_of_week ?? "monday")}`
              : intent.frequency}{" "}
            for {intent.total_executions}{" "}
            {intent.frequency === "weekly"
              ? "weeks"
              : intent.frequency === "daily"
                ? "days"
                : "months"}
            .
          </h2>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <NumField
              label="Per buy ($)"
              value={intent.amount_per_execution}
              onChange={(v) =>
                setIntent({ ...intent, amount_per_execution: v })
              }
            />
            <NumField
              label="# of buys"
              value={intent.total_executions}
              onChange={(v) => setIntent({ ...intent, total_executions: v })}
            />
            <NumField
              label="Expires (days)"
              value={intent.expires_in_days}
              onChange={(v) => setIntent({ ...intent, expires_in_days: v })}
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted">
                Cadence
              </p>
              <select
                className="mt-1 w-full nb-border rounded-[var(--radius)] bg-bg p-2.5 text-base nb-focus"
                value={intent.frequency}
                onChange={(e) =>
                  setIntent({
                    ...intent,
                    frequency: e.target.value as DCAIntent["frequency"],
                  })
                }
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              Risk rules
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {intent.risk_rules.map((r, i) => (
                <span
                  key={i}
                  className="nb-border rounded-full bg-bg px-3 py-1.5 text-sm font-medium"
                >
                  {r.type === "price_drop"
                    ? `Pause if SUI drops ${Math.abs(r.threshold_pct)}% in ${r.window_hours}h`
                    : `Pause if slippage > ${r.threshold_pct}%`}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-6 nb-border rounded-[var(--radius)] bg-soft p-4">
            <p className="text-base">
              You&apos;ll deposit{" "}
              <strong className="font-bold">{formatUsd(total)}</strong> USDC.
              The agent can buy at most {formatUsd(intent.amount_per_execution)}{" "}
              per execution, no exceptions.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {account && balance.loading ? (
              <p className="text-sm text-muted">Checking DBUSDC balance…</p>
            ) : null}
            {account && !balance.loading ? (
              <p className="text-sm text-muted">
                Wallet DBUSDC: {formatUsd(balance.human)}
                {insufficient ? (
                  <span className="ml-2 font-semibold text-danger">
                    (need {formatUsd(total)})
                  </span>
                ) : null}
              </p>
            ) : null}
            {!account ? (
              <p className="text-sm text-muted">
                Connect a wallet to sign the create tx. Without one, the link is
                a local mock.
              </p>
            ) : null}
            {account ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 nb-border nb-focus"
                  checked={demoFastInterval}
                  onChange={(e) => setDemoFastInterval(e.target.checked)}
                />
                <span>
                  <span className="font-semibold">Demo mode</span>
                  <span className="text-muted">
                    {" "}— fire every 30s instead of {intent.frequency}. Use for live demos.
                  </span>
                </span>
              </label>
            ) : null}
            <Button
              variant="primary"
              fullWidth
              onClick={create}
              disabled={creating || insufficient}
            >
              {creating
                ? "Signing + sending…"
                : account
                  ? "Create link (wallet-signed)"
                  : "Create link (mock)"}
            </Button>
          </div>
        </Card>
      </div>

      <ToastHost />
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        className="w-full nb-border rounded-[var(--radius)] bg-bg p-2.5 text-base nb-focus"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

const EXAMPLES = [
  "DCA $50/week into SUI for 8 weeks",
  "Buy $20 of SUI every Monday for 3 months",
  "$100 weekly for 6 weeks, pause on big drops",
];

const defaultIntent: DCAIntent = {
  action: "dca_buy",
  asset_in: "USDC",
  asset_out: "SUI",
  amount_per_execution: 50,
  frequency: "weekly",
  day_of_week: "monday",
  total_executions: 8,
  risk_rules: [
    { type: "price_drop", window_hours: 1, threshold_pct: -5 },
    { type: "slippage_cap", threshold_pct: 1 },
  ],
  expires_in_days: 56,
};

// Tiny heuristic parser so the UI feels alive without the LLM. Real Stage 5
// replaces this with a Claude/OpenAI call validated by Zod.
function parseNL(s: string): DCAIntent {
  const amt = /\$\s*(\d+(?:\.\d+)?)/.exec(s);
  const wks = /(\d+)\s*weeks?/i.exec(s);
  const mos = /(\d+)\s*months?/i.exec(s);
  const days = /(\d+)\s*days?/i.exec(s);
  const cadence: DCAIntent["frequency"] = /daily|day/i.test(s)
    ? "daily"
    : /month/i.test(s)
      ? "monthly"
      : "weekly";
  const exec = wks
    ? Number(wks[1])
    : mos
      ? Number(mos[1])
      : days
        ? Number(days[1])
        : 8;
  return {
    ...defaultIntent,
    amount_per_execution: amt ? Number(amt[1]) : 50,
    frequency: cadence,
    total_executions: exec,
    expires_in_days: Math.max(7, exec * 7 + 14),
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
