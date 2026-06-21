"use client";

import { use } from "react";
import { useCapabilityByToken } from "../../_components/useCapability";
import {
  useChainCapabilityById,
  useChainCapabilityByToken,
} from "../../_lib/useChainCapability";
import { ActivationView } from "./_ActivationView";
import { Dashboard } from "./_Dashboard";
import { WalletPill } from "./_WalletPill";
import { ToastHost } from "../../_components/Toast";
import type { Capability } from "../../_lib/types";

// `/c/[token]` accepts either:
//   - a short mock token like `demo` or `pending` (existing flow, mockStore)
//   - a 0x… cap id (chain mode — read live on-chain state)
//   - a random share token (chain mode — looked up via activation_token_hash)
//
// The 0x-cap-id path is what lets us drive the live demo against the seeded
// cap (0xd61dcc6d…) before the real activation flow is wired.
function looksLikeCapId(s: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(s);
}

function isKnownMockToken(s: string): boolean {
  return s === "demo" || s === "pending";
}

export default function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const mode: "mock" | "chain-id" | "chain-token" = isKnownMockToken(token)
    ? "mock"
    : looksLikeCapId(token)
      ? "chain-id"
      : "chain-token";

  return (
    <>
      {/* Floats fixed top-right, outside the narrow column. Only renders when
          there's an active zkLogin session. */}
      <WalletPill />
      <div
        data-flow="recipient"
        className="mx-auto w-full max-w-[520px] px-5 py-10 sm:py-14 lg:py-20"
      >
        {mode === "mock" ? (
          <MockBranch token={token} />
        ) : mode === "chain-id" ? (
          <ChainByIdBranch capId={token} />
        ) : (
          <ChainByTokenBranch token={token} />
        )}
        <ToastHost />
      </div>
    </>
  );
}

function MockBranch({ token }: { token: string }) {
  const { cap, ready } = useCapabilityByToken(token);
  return <Branch cap={cap} ready={ready} chainMode={false} />;
}

function ChainByIdBranch({ capId }: { capId: string }) {
  const { cap, ready } = useChainCapabilityById(capId);
  return <Branch cap={cap} ready={ready} chainMode={true} />;
}

function ChainByTokenBranch({ token }: { token: string }) {
  const { cap, ready } = useChainCapabilityByToken(token);
  return <Branch cap={cap} ready={ready} chainMode={true} />;
}

function Branch({
  cap,
  ready,
  chainMode,
}: {
  cap: Capability | undefined;
  ready: boolean;
  chainMode: boolean;
}) {
  if (!ready) return <Loading />;
  if (!cap) return <NotFound />;
  if (cap.status === "pending")
    return <ActivationView cap={cap} chainMode={chainMode} />;
  return <Dashboard cap={cap} chainMode={chainMode} />;
}

function Loading() {
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-6 text-center">
      <div className="mx-auto h-10 w-10 nb-border rounded-full bg-soft animate-[pulse_1.2s_ease-in-out_infinite]" />
      <p className="mt-4 font-display text-xl font-extrabold">
        Looking up your link…
      </p>
      <p className="mt-1 text-muted">Reading the chain. This takes a few seconds.</p>
      <style>{`@keyframes pulse {
        0%,100% { transform: scale(1); }
        50%     { transform: scale(0.85); }
      }`}</style>
    </div>
  );
}

function NotFound() {
  return (
    <div className="nb-border nb-shadow rounded-[var(--radius-lg)] bg-surface p-6 text-center">
      <h1 className="text-2xl font-extrabold">This link doesn&apos;t work</h1>
      <p className="mt-2 text-muted">
        It might have been stopped already. Ask the person who sent it for a
        new one.
      </p>
    </div>
  );
}
