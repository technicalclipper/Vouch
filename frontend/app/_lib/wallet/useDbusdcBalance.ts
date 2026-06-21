"use client";

// Live DBUSDC balance for a Sui address. Used in the creator flow to gate
// the create button + show a friendly "you need DBUSDC" toast.
//
// Reads coin balance via @mysten/sui — no need to walk individual coin
// objects here; the create PTB picks coins separately.

import { useEffect, useState } from "react";

import { suiClient } from "../chain";
import { CONFIG } from "../config";

export interface DbusdcBalance {
  loading: boolean;
  raw: bigint; // smallest unit (6dp)
  human: number; // raw / usdcScalar
  error?: string;
}

export function useDbusdcBalance(address?: string): DbusdcBalance {
  const [state, setState] = useState<DbusdcBalance>({
    loading: !!address,
    raw: 0n,
    human: 0,
  });

  useEffect(() => {
    if (!address) {
      setState({ loading: false, raw: 0n, human: 0 });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await suiClient.getBalance({
          owner: address,
          coinType: CONFIG.deepbook.usdcType,
        });
        if (cancelled) return;
        const raw = BigInt(res.totalBalance);
        setState({
          loading: false,
          raw,
          human: Number(raw) / CONFIG.deepbook.usdcScalar,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          raw: 0n,
          human: 0,
          error: (err as Error).message,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return state;
}
