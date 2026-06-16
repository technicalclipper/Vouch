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

export function ActivityItem({
  event,
  funderName,
}: {
  event: ActivityEvent;
  funderName: string;
}) {
  return (
    <li className="nb-border nb-shadow rounded-[var(--radius)] bg-surface p-4 flex items-start gap-3">
      <Icon kind={event.kind} />
      <div className="min-w-0 flex-1">
        <p className="text-base sm:text-[17px] font-medium leading-snug text-ink">
          {describe(event, funderName)}
        </p>
        <p className="mt-0.5 text-sm text-muted">
          {formatRelative(event.timestamp)}
        </p>
      </div>
    </li>
  );
}
