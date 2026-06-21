"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "../../../_components/Card";
import { Button } from "../../../_components/Button";
import { ToastHost, toast } from "../../../_components/Toast";
import { useCapabilityById } from "../../../_components/useCapability";

// C2 in DESIGN.md §5.
// Two modes:
//   1. Chain mode — `id` is a 0x… cap_id and the URL has ?token=<hex>&from=<name>
//      (the chain doesn't store the raw token, just sha256(token), so the
//      creator's URL carries it forward).
//   2. Mock mode — `id` is a mock-store cap id; we read everything locally.
export default function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? undefined;
  const fromName = searchParams.get("from") ?? undefined;
  const labelFromUrl = searchParams.get("label") ?? undefined;
  const isChainId = id.startsWith("0x") && id.length === 66;

  const { cap, ready } = useCapabilityById(isChainId ? "" : id);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Chain mode: skip the mock-store load and render straight from URL params.
  if (isChainId && tokenFromUrl) {
    const url = origin
      ? `${origin}/c/${tokenFromUrl}`
      : `/c/${tokenFromUrl}`;
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&qzone=2&data=${encodeURIComponent(url)}`;
    return (
      <ShareView
        url={url}
        qrSrc={qrSrc}
        token={tokenFromUrl}
        recipientLabel={labelFromUrl}
        funderName={fromName}
      />
    );
  }

  if (!ready) return null;
  if (!cap) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <Card>
          <h1 className="text-2xl font-extrabold">Link not found</h1>
          <p className="mt-2 text-muted">
            Try creating a new one.
          </p>
          <div className="mt-4">
            <Link href="/create">
              <Button size="md">Create one</Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  const url = origin ? `${origin}/c/${cap.token}` : `/c/${cap.token}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&qzone=2&data=${encodeURIComponent(url)}`;

  return (
    <ShareView
      url={url}
      qrSrc={qrSrc}
      token={cap.token}
      recipientLabel={cap.recipient_label}
      funderName={cap.funder_name}
    />
  );
}

function ShareView({
  url,
  qrSrc,
  token,
  recipientLabel,
  funderName,
}: {
  url: string;
  qrSrc: string;
  token: string;
  recipientLabel?: string;
  funderName?: string;
}) {
  void funderName; // currently unused on this screen but accepted for future copy
  return (
    <main
      data-flow="creator"
      className="mx-auto w-full max-w-2xl px-6 py-12"
    >
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted">
          Your link is ready
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold leading-tight">
          Send this to {recipientLabel ?? "them"}.
        </h1>
      </header>

      <Card hero>
        <div className="flex flex-col items-center gap-5">
          <div className="nb-border rounded-[var(--radius)] bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt="Activation QR code"
              width={280}
              height={280}
              className="block"
            />
          </div>

          <div className="w-full nb-border rounded-[var(--radius)] bg-bg p-3 break-all font-mono text-sm">
            {url}
          </div>

          <div className="grid w-full grid-cols-2 gap-3">
            <Button
              size="md"
              variant="primary"
              onClick={async () => {
                await navigator.clipboard.writeText(url);
                toast("Copied — paste it in a text.");
              }}
            >
              Copy link
            </Button>
            <Link href={`/c/${token}`}>
              <Button size="md" variant="ghost" fullWidth>
                Preview as them
              </Button>
            </Link>
          </div>

          <p className="text-center text-base text-muted">
            Send this to the person you&apos;re setting it up for. They&apos;ll
            tap it and sign in with Google — that&apos;s it.
          </p>
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between">
        <Link href="/dashboard">
          <Button size="md" variant="ghost">
            Go to dashboard
          </Button>
        </Link>
        <Link href="/create">
          <Button size="md" variant="ghost">
            Set up another
          </Button>
        </Link>
      </div>

      <ToastHost />
    </main>
  );
}
