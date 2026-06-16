"use client";

import { useEffect, useState } from "react";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "success" | "info";
}

let counter = 1;
const listeners = new Set<(t: ToastMessage) => void>();

export function toast(text: string, tone: ToastMessage["tone"] = "success") {
  const msg = { id: counter++, text, tone };
  listeners.forEach((l) => l(msg));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastMessage[]>([]);
  useEffect(() => {
    const l = (m: ToastMessage) => {
      setItems((cur) => [...cur, m]);
      setTimeout(() => {
        setItems((cur) => cur.filter((x) => x.id !== m.id));
      }, 3200);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-3 px-4">
      {items.map((m) => (
        <div
          key={m.id}
          role="status"
          className={[
            "pointer-events-auto nb-border nb-shadow rounded-[var(--radius)]",
            "px-5 py-3 font-semibold",
            m.tone === "success" ? "bg-accent-2 text-ink" : "bg-soft text-ink",
            "animate-[toast-in_180ms_ease-out]",
          ].join(" ")}
        >
          {m.text}
        </div>
      ))}
      <style>{`@keyframes toast-in {
        from { transform: translateY(8px); opacity: 0; }
        to   { transform: translateY(0);    opacity: 1; }
      }`}</style>
    </div>
  );
}
