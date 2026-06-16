import { formatNextBuy } from "../_lib/format";

export function CountdownChip({ at }: { at: number }) {
  return (
    <span className="inline-flex items-center gap-2 nb-border rounded-full bg-soft px-4 py-2 text-base font-semibold">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="5" width="18" height="16" rx="2" stroke="#1A1A1A" strokeWidth="2" />
        <path d="M3 9h18M8 3v4M16 3v4" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
      </svg>
      Next buy: {formatNextBuy(at)}
    </span>
  );
}
