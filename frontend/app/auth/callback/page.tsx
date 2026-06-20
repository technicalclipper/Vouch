// SPDX-License-Identifier: Apache-2.0
//
// Google OAuth implicit-flow return URL. Google appends the id_token to the
// fragment (#id_token=…); we parse it, run completeSignIn(), then redirect
// back to wherever the user came from (the pending state's `returnTo`).

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { completeSignIn, takePendingReturnTo } from "../../_lib/zklogin/session";

export default function ZkLoginCallback() {
  const [error, setError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hash = window.location.hash.replace(/^#/, "");
        const params = new URLSearchParams(hash);
        const idToken = params.get("id_token");
        if (!idToken) {
          throw new Error(
            "Google didn't return an id_token. Try signing in again.",
          );
        }
        setStatus("Building your wallet…");
        const returnTo = takePendingReturnTo() ?? "/";
        await completeSignIn(idToken);
        if (cancelled) return;
        setStatus("Done. Sending you back…");
        // Defer the navigation a tick so the success state paints.
        setTimeout(() => {
          window.location.replace(returnTo);
        }, 300);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-[520px] px-5 py-20 text-center">
      {!error ? (
        <p className="font-display text-2xl font-extrabold">{status}</p>
      ) : (
        <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-6">
          <h1 className="font-display text-2xl font-extrabold">
            Sign-in didn&apos;t work
          </h1>
          <p className="mt-2 text-muted">{error}</p>
          <Link
            href="/"
            className="mt-5 inline-block underline font-semibold"
          >
            Back to start
          </Link>
        </div>
      )}
    </div>
  );
}
