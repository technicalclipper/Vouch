import type { ReactNode } from "react";

export function BigNumber({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-2 font-display text-[44px] sm:text-[56px] font-extrabold leading-none tracking-tight text-ink">
        {value}
      </p>
      {sub ? <p className="mt-2 text-base text-muted">{sub}</p> : null}
    </div>
  );
}
