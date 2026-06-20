// SPDX-License-Identifier: Apache-2.0
//
// Polling hooks that mirror the existing `useCapability*` shape but read
// real chain state. We poll instead of subscribing because the chain
// pushes nothing — the executor mutates state out-of-band.

"use client";

import { useEffect, useState } from "react";

import type { Capability } from "./types";
import {
  loadChainCapability,
  loadChainCapabilityByToken,
} from "./chain";

const DEFAULT_POLL_MS = 5000;

export function useChainCapabilityById(
  id: string,
  pollMs: number = DEFAULT_POLL_MS,
) {
  const [cap, setCap] = useState<Capability | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const c = await loadChainCapability(id);
        if (!cancelled) {
          setCap(c);
          setReady(true);
        }
      } catch (err) {
        // Surface in dev; quiet in prod. Don't crash the page.
        // eslint-disable-next-line no-console
        console.error("[useChainCapabilityById]", err);
        if (!cancelled) setReady(true);
      }
    };
    tick();
    const h = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, [id, pollMs]);

  return { cap, ready };
}

export function useChainCapabilityByToken(
  token: string,
  pollMs: number = DEFAULT_POLL_MS,
) {
  const [cap, setCap] = useState<Capability | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const c = await loadChainCapabilityByToken(token);
        if (!cancelled) {
          setCap(c);
          setReady(true);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[useChainCapabilityByToken]", err);
        if (!cancelled) setReady(true);
      } finally {
        inFlight = false;
      }
    };
    tick();
    const h = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(h);
    };
  }, [token, pollMs]);

  return { cap, ready };
}
