"use client";

// Top-right profile pill: avatar + truncated zkLogin address. Click expands a
// small popover with the full address, a copy button, and a view-on-explorer
// link. Rendered fixed-positioned at page level so it floats outside the
// narrow recipient column (desktop-only layout).

import { useState } from "react";
import { toast } from "../../_components/Toast";
import { useZkLogin } from "../../_lib/zklogin/useZkLogin";

export function WalletPill() {
  const { session, signOut } = useZkLogin();
  const [open, setOpen] = useState(false);
  if (!session?.address) return null;
  const address = session.address;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <div className="fixed top-4 right-6 z-30">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 nb-border nb-shadow rounded-full bg-surface pl-1.5 pr-3 py-1 text-sm font-semibold nb-pressable nb-focus"
          title="Your wallet"
        >
          <span
            aria-hidden
            className="h-7 w-7 rounded-full bg-accent-2 nb-border flex items-center justify-center text-xs font-extrabold"
          >
            {address.slice(2, 3).toUpperCase()}
          </span>
          <span className="font-mono">{short}</span>
        </button>
        {open ? (
          <>
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-10 cursor-default bg-transparent"
            />
            <div className="absolute right-0 z-20 mt-2 w-[min(92vw,340px)] nb-border nb-shadow rounded-[var(--radius)] bg-surface p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Your wallet
              </p>
              <p className="mt-0.5 text-xs text-muted">
                All SUI bought lands here.
              </p>
              <p className="mt-2 font-mono text-[13px] break-all">{address}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="nb-border rounded-full bg-bg px-3 py-1.5 text-sm font-semibold nb-pressable nb-focus"
                  onClick={async () => {
                    await navigator.clipboard.writeText(address);
                    toast("Copied wallet address.");
                    setOpen(false);
                  }}
                >
                  Copy
                </button>
                <a
                  href={`https://suiscan.xyz/testnet/account/${address}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setOpen(false)}
                  className="text-center nb-border rounded-full bg-bg px-3 py-1.5 text-sm font-semibold nb-pressable nb-focus"
                >
                  View
                </a>
              </div>

              {/* Sign out clears both vouch.zklogin.session and
                  vouch.zklogin.pending in localStorage. After this the
                  activation page falls back to "Sign in with Google" and
                  the user can re-authenticate from scratch (different
                  Google account, fresh session, etc). */}
              <button
                type="button"
                className="mt-2 w-full nb-border rounded-full bg-bg px-3 py-1.5 text-sm font-semibold text-danger nb-pressable nb-focus"
                onClick={() => {
                  signOut();
                  toast("Signed out. Sign in again to continue.", "info");
                  setOpen(false);
                  // Reload so any pages reading `session` re-render cleanly.
                  setTimeout(() => window.location.reload(), 400);
                }}
              >
                Sign out &amp; clear session
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
