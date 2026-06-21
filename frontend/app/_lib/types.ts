// Mirror of CLAUDE.md §4.1 AgentCapability shape, lightly TS-flavored.
// Single intent type for v1: dca_buy. The shape is forward-compatible with
// other action types via the `action` discriminator.

export type CapabilityStatus =
  | "pending" // created but not activated
  | "active"
  | "paused" // currently inside a skipped slot (UI only)
  | "stopped" // revoked
  | "done"; // executions exhausted or expired

export type RiskRule =
  | { type: "price_drop"; window_hours: number; threshold_pct: number } // threshold_pct is negative e.g. -5
  | { type: "slippage_cap"; threshold_pct: number };

export interface DCAIntent {
  action: "dca_buy";
  asset_in: "USDC";
  asset_out: "SUI";
  amount_per_execution: number; // in USDC, human units
  frequency: "weekly" | "daily" | "monthly";
  day_of_week?:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  total_executions: number;
  risk_rules: RiskRule[];
  expires_in_days: number;
}

export interface ActivityEvent {
  id: string;
  cap_id: string;
  timestamp: number; // ms epoch
  kind: "bought" | "skipped" | "activated" | "created" | "stopped";
  digest?: string; // tx digest, for explorer linking + expanded view
  // bought
  amount_in?: number; // USDC
  amount_out?: number; // SUI
  price_usd?: number;
  // skipped
  reason?: string;
}

export interface Capability {
  id: string;
  token: string; // activation token used in the share link `/c/:token`
  vault_id?: string; // linked Vault object id — required for revoke PTB
  funder_name: string; // "Alex" — for recipient-facing copy
  funder_address: string;
  owner_address?: string; // recipient zkLogin address, set on activation
  recipient_label?: string; // creator-side nickname e.g. "Mom"
  status: CapabilityStatus;
  intent: DCAIntent;
  budget_total: number;
  budget_remaining: number;
  executions_done: number;
  total_sui_bought: number;
  created_at: number;
  activated_at?: number;
  expires_at: number;
  next_execution_at: number;
  events: ActivityEvent[];
}
