"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "../_components/Card";
import { Button } from "../_components/Button";
import { StatusPill } from "../_components/StatusPill";
import { getAll, subscribe } from "../_lib/mockStore";
import type { Capability } from "../_lib/types";
import { formatUsd, formatNextBuy } from "../_lib/format";

// C3 (list view) in DESIGN.md §5.
export default function DashboardPage() {
  const [caps, setCaps] = useState<Capability[]>([]);
  useEffect(() => {
    const read = () => setCaps(getAll());
    read();
    return subscribe(read);
  }, []);

  return (
    <main
      data-flow="creator"
      className="mx-auto w-full max-w-5xl px-6 py-12"
    >
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">
            Dashboard
          </p>
          <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight">
            Your delegations
          </h1>
        </div>
        <Link href="/create">
          <Button size="md" variant="primary">
            + New delegation
          </Button>
        </Link>
      </header>

      {caps.length === 0 ? (
        <Card>
          <p className="text-base">No delegations yet.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {caps.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/${c.id}`}
                className="block nb-border nb-shadow nb-pressable rounded-[var(--radius-lg)] bg-surface p-5 nb-focus"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-bold">
                        {c.recipient_label ?? "Untitled"}
                      </p>
                      <StatusPill status={c.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      DCA {formatUsd(c.intent.amount_per_execution)}{" "}
                      {c.intent.frequency === "weekly"
                        ? `/ ${c.intent.day_of_week ?? "week"}`
                        : `/ ${c.intent.frequency}`}{" "}
                      · {c.executions_done}/{c.intent.total_executions} done
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-2xl font-extrabold">
                      {formatUsd(c.budget_total - c.budget_remaining)}
                    </p>
                    <p className="text-sm text-muted">
                      of {formatUsd(c.budget_total)} used
                    </p>
                    {c.status === "active" ? (
                      <p className="mt-1 text-sm text-muted">
                        Next: {formatNextBuy(c.next_execution_at)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
