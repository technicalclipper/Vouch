// Plain-English formatters. All recipient-facing strings must pass the
// "mom test" (DESIGN.md §1 and §6 copy guide).

export function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}

export function formatSui(n: number): string {
  const rounded = n < 1 ? n.toFixed(3) : n.toFixed(n < 100 ? 2 : 1);
  // strip trailing zeros after the decimal point
  return rounded.replace(/\.?0+$/, "") + " SUI";
}

const RTF = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelative(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return diff >= 0 ? "in a moment" : "just now";
  if (abs < hour) return RTF.format(Math.round(diff / min), "minute");
  if (abs < day) return RTF.format(Math.round(diff / hour), "hour");
  if (abs < 7 * day) return RTF.format(Math.round(diff / day), "day");
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// "Next buy: Monday" — friendly weekday-only when soon.
export function formatNextBuy(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const day = 24 * 60 * 60 * 1000;
  if (diff < 0) return "Now";
  if (diff < day) {
    const h = Math.max(1, Math.round(diff / (60 * 60 * 1000)));
    return `in ${h} hour${h === 1 ? "" : "s"}`;
  }
  if (diff < 7 * day) {
    return new Date(ts).toLocaleDateString("en-US", { weekday: "long" });
  }
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// Human-readable summary of the DCA intent, for the recipient hero copy.
import type { DCAIntent } from "./types";

export function describeIntent(intent: DCAIntent, funderName: string): string {
  const per = formatUsd(intent.amount_per_execution);
  const total = formatUsd(intent.amount_per_execution * intent.total_executions);
  const cadence =
    intent.frequency === "weekly"
      ? `every ${cap(intent.day_of_week ?? "monday")}`
      : intent.frequency === "daily"
        ? "every day"
        : "every month";
  const weeks =
    intent.frequency === "weekly"
      ? `for ${intent.total_executions} weeks`
      : intent.frequency === "daily"
        ? `for ${intent.total_executions} days`
        : `for ${intent.total_executions} months`;
  return `This will buy a small amount of SUI (a kind of digital currency) for you — about ${per} worth ${cadence} ${weeks}. ${funderName} has already paid for it (${total} total). You can stop anytime.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
