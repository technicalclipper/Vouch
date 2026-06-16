"use client";

import { useEffect, useState } from "react";
import type { Capability } from "../_lib/types";
import { getByToken, getById, subscribe } from "../_lib/mockStore";

export function useCapabilityByToken(token: string) {
  const [cap, setCap] = useState<Capability | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => setCap(getByToken(token));
    read();
    setReady(true);
    return subscribe(read);
  }, [token]);
  return { cap, ready };
}

export function useCapabilityById(id: string) {
  const [cap, setCap] = useState<Capability | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => setCap(getById(id));
    read();
    setReady(true);
    return subscribe(read);
  }, [id]);
  return { cap, ready };
}
