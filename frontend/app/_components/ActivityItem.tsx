"use client";

import { Fragment, useState } from "react";
import type { ActivityEvent } from "../_lib/types";
import { formatRelative, formatSui, formatUsd } from "../_lib/format";

function Icon({ kind }: { kind: ActivityEvent["kind"] }) {
  const base =
    "h-9 w-9 shrink-0 nb-border rounded-full flex items-center justify-center";
  if (kind === "bought") {
    return (
      <div className={`${base} bg-accent-2`} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12.5l4.5 4.5L19 7"
            stroke="#1A1A1A"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (kind === "skipped") {
    return (
      <div className={`${base} bg-warn`} aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="6" y="5" width="4" height="14" fill="#1A1A1A" />
          <rect x="14" y="5" width="4" height="14" fill="#1A1A1A" />
        </svg>
      </div>
    );
  }
  if (kind === "stopped") {
    return (
      <div className={`${base} bg-danger`} aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="5" width="14" height="14" fill="white" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`${base} bg-soft`} aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" fill="#1A1A1A" />
      </svg>
    </div>
  );
}

function describe(event: ActivityEvent, funderName: string): string {
  switch (event.kind) {
    case "bought":
      if (event.amount_out != null && event.amount_in != null) {
        return `Bought ${formatSui(event.amount_out)} for you (${formatUsd(event.amount_in)})`;
      }
      return "Bought SUI for you";
    case "skipped":
      return event.reason ?? "Paused this week";
    case "activated":
      return "Turned on";
    case "created":
      return `${funderName} set this up`;
    case "stopped":
      return "You stopped this";
  }
}

function hasDetails(event: ActivityEvent): boolean {
  if (event.kind === "bought") return event.amount_in != null;
  if (event.kind === "skipped") return !!event.reason || !!event.skip_meta;
  return !!event.digest;
}

function describeRule(rule: "price_drop" | "slippage_cap"): string {
  return rule === "price_drop"
    ? "Price drop in the last hour"
    : "Orderbook slippage too high";
}

function fmtPct(n?: number, digits = 2): string | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function fmtPrice(n?: number): string | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  return `$${n.toFixed(4)}`;
}

function Details({ event }: { event: ActivityEvent }) {
  const rows: Array<{ label: string; value: React.ReactNode }> = [];

  if (event.kind === "bought") {
    if (event.amount_in != null) {
      rows.push({ label: "Spent", value: `${formatUsd(event.amount_in)} USDC` });
    }
    if (event.amount_out != null) {
      rows.push({ label: "Received", value: formatSui(event.amount_out) });
    }
    if (event.price_usd != null) {
      rows.push({
        label: "Price",
        value: `${formatUsd(event.price_usd)} / SUI`,
      });
    }
  }
  if (event.kind === "skipped") {
    if (event.reason) {
      rows.push({ label: "Why", value: event.reason });
    }
    const m = event.skip_meta;
    if (m) {
      rows.push({ label: "Rule", value: describeRule(m.rule) });
      if (m.rule === "price_drop") {
        const now = fmtPrice(m.market.suiUsdNow);
        const prior = fmtPrice(m.market.suiUsdPrior);
        if (now) rows.push({ label: "SUI now", value: now });
        if (prior) rows.push({ label: "SUI 1h ago", value: prior });
        const pct = fmtPct(m.market.pctChange);
        const thr = fmtPct(m.threshold.pct);
        if (pct && thr) {
          rows.push({
            label: "Change vs. limit",
            value: `${pct} (limit ${thr})`,
          });
        }
      } else {
        const mid = fmtPrice(m.market.midPrice);
        if (mid) rows.push({ label: "Mid price", value: mid });
        const slip = m.market.estimatedSlippageBps;
        const cap = m.threshold.bps;
        if (slip != null && cap != null) {
          rows.push({
            label: "Slippage vs. cap",
            value: `${(slip / 100).toFixed(2)}% (cap ${(cap / 100).toFixed(2)}%)`,
          });
        }
      }
    }
  }
  rows.push({
    label: "When",
    value: new Date(event.timestamp).toLocaleString(),
  });
  if (event.digest) {
    rows.push({
      label: "Tx",
      value: (
        <a
          href={`https://suiscan.xyz/testnet/tx/${event.digest}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-[13px] break-all underline decoration-2 underline-offset-2"
          title="View on Suiscan"
        >
          {event.digest}
        </a>
      ),
    });
  }

  return (
    <dl className="mt-3 grid grid-cols-[minmax(80px,auto)_1fr] gap-x-3 gap-y-1.5 border-t-2 border-ink/15 pt-3 text-sm">
      {rows.map((r, i) => (
        <Fragment key={i}>
          <dt className="text-muted">{r.label}</dt>
          <dd className="text-ink">{r.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function ActivityItem({
  event,
  funderName,
}: {
  event: ActivityEvent;
  funderName: string;
}) {
  const [open, setOpen] = useState(false);
  const expandable = hasDetails(event);

  return (
    <li className="nb-border nb-shadow rounded-[var(--radius)] bg-surface">
      <button
        type="button"
        onClick={() => expandable && setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!expandable}
        className={`w-full text-left p-4 flex items-start gap-3 ${
          expandable ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <Icon kind={event.kind} />
        <div className="min-w-0 flex-1">
          <p className="text-base sm:text-[17px] font-medium leading-snug text-ink">
            {describe(event, funderName)}
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {formatRelative(event.timestamp)}
          </p>
        </div>
        {expandable ? (
          <span
            aria-hidden
            className={`mt-1 shrink-0 text-ink transition-transform ${
              open ? "rotate-90" : ""
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
        ) : null}
      </button>
      {expandable && open ? (
        <div className="px-4 pb-4">
          <Details event={event} />
        </div>
      ) : null}
    </li>
  );
}
