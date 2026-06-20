// SPDX-License-Identifier: Apache-2.0
//
// React hook around the zkLogin session. Subscribes to localStorage so
// any successful completeSignIn() in another tab flips the UI.

"use client";

import { useEffect, useState } from "react";

import { currentSession, signOut as raw } from "./session";
import type { ZkLoginSession } from "./storage";

export function useZkLogin() {
  const [session, setSession] = useState<ZkLoginSession | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => setSession(currentSession());
    read();
    setReady(true);
    const handler = () => read();
    window.addEventListener("vouch:zklogin", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("vouch:zklogin", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return { session, ready, signOut: raw };
}
