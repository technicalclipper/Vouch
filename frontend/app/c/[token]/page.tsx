"use client";

import { use } from "react";
import { useCapabilityByToken } from "../../_components/useCapability";
import { ActivationView } from "./_ActivationView";
import { Dashboard } from "./_Dashboard";
import { ToastHost } from "../../_components/Toast";

export default function RecipientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const { cap, ready } = useCapabilityByToken(token);

  return (
    <div
      data-flow="recipient"
      className="mx-auto w-full max-w-[520px] px-5 py-10 sm:py-14 lg:py-20"
    >
      {!ready ? null : !cap ? (
        <NotFound />
      ) : cap.status === "pending" ? (
        <ActivationView cap={cap} />
      ) : (
        <Dashboard cap={cap} />
      )}
      <ToastHost />
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
