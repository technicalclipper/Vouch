import type { CapabilityStatus } from "../_lib/types";

const LABELS: Record<CapabilityStatus, string> = {
  pending: "Not turned on yet",
  active: "Active",
  paused: "Paused this week",
  stopped: "Stopped",
  done: "Done",
};

const STYLES: Record<CapabilityStatus, string> = {
  pending: "bg-soft text-ink",
  active: "bg-accent-2 text-ink",
  paused: "bg-warn text-ink",
  stopped: "bg-danger text-white",
  done: "bg-bg text-muted",
};

export function StatusPill({
  status,
  className = "",
}: {
  status: CapabilityStatus;
  className?: string;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        "nb-border rounded-full",
        "px-3 py-1 text-sm font-semibold",
        STYLES[status],
        className,
      ].join(" ")}
    >
      <span
        aria-hidden
        className={[
          "inline-block h-2 w-2 rounded-full",
          status === "active"
            ? "bg-ink"
            : status === "paused"
              ? "bg-ink"
              : status === "stopped"
                ? "bg-white"
                : "bg-ink/60",
        ].join(" ")}
      />
      {LABELS[status]}
    </span>
  );
}
