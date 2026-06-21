// SPDX-License-Identifier: Apache-2.0
//
// vouch::capability — the heart of the protocol.
//
// Implements the AgentCapability object spec'd in CLAUDE.md §4.1: an on-chain
// permission slip that an off-chain executor (the agent) must thread through
// every execution PTB. The Move type system + this module's `assert_*`
// functions are what make the five non-negotiable invariants (CLAUDE.md §1)
// hold:
//   1. budget cap enforced by `reserve_budget`
//   2. pool scope enforced by `assert_pool_in_scope`
//   3. revocation/expiry enforced by `assert_executable`
//   4. every consequential action emits an event
//   5. no Move function path leaks funds outside an execution or a refund
//
// The agent NEVER custodies coins. The only coin-moving paths are:
//   - `draw_for_execution<T>` — gated by all three asserts + budget reserve.
//   - `revoke<T>` — sweeps the vault back to the funder (also entry).
//
// All other state-mutating functions emit events so the recipient/creator
// dashboards (and external indexers) can rebuild the activity log from chain.

module vouch::capability {
    use std::hash;
    use sui::clock::{Self, Clock};
    use sui::coin::Coin;
    use sui::event;
    use sui::transfer;

    use vouch::vault::{Self, Vault};

    // ---------------- Error codes (CLAUDE.md §4.1) ----------------
    const ECapabilityRevoked: u64 = 1;
    const ECapabilityExpired: u64 = 2;
    const ETooEarly: u64 = 3;
    const EMaxExecutionsReached: u64 = 4;
    const EExceedsPerExecCap: u64 = 5;
    const EInsufficientBudget: u64 = 6;
    const EPoolNotInScope: u64 = 7;
    const EUnauthorized: u64 = 8;
    const ENotActive: u64 = 9;
    const EBadToken: u64 = 10;
    const EWrongAgent: u64 = 11;
    const EAlreadyActive: u64 = 12;
    const EWrongVault: u64 = 13;

    // ---------------- Action types ----------------
    /// v1 ships only `dca_buy`. The enum is kept as a u8 so future strategies
    /// can be added without breaking object layout.
    #[allow(unused_const)]
    const ACTION_DCA_BUY: u8 = 0;

    // ---------------- Inner structs ----------------
    public struct Schedule has store, copy, drop {
        interval_ms: u64,
        next_execution_at: u64,
    }

    // RiskRule is stored on chain but interpreted by the off-chain executor
    // (CLAUDE.md §6) — Move only needs to faithfully carry the parameters.
    // `threshold_bps` and `window_ms` are intentionally read off-chain only.
    #[allow(unused_field)]
    public struct RiskRule has store, copy, drop {
        rule_type: u8,       // 0 = price_drop, 1 = slippage_cap
        threshold_bps: u64,  // basis points; for price_drop, magnitude of allowed drop
        window_ms: u64,      // for price_drop window; 0 for slippage_cap
    }

    /// Public constructor so PTBs can materialise RiskRule values inside a
    /// transaction (BCS pure-arg path can't construct struct vectors). Used
    /// by the creator frontend's create PTB to encode per-cap thresholds.
    public fun new_risk_rule(
        rule_type: u8,
        threshold_bps: u64,
        window_ms: u64,
    ): RiskRule {
        RiskRule { rule_type, threshold_bps, window_ms }
    }

    /// The capability object. Shared after creation so both the agent (mutates
    /// during execution) and the owner/funder (revokes) can pass &mut into PTBs.
    public struct AgentCapability has key {
        id: UID,
        owner: address,                 // zero until activation
        funder: address,                // creator; can also revoke
        agent_pubkey: address,          // executor address allowed to call execute fns
        vault_id: ID,                   // linked Vault object
        action_type: u8,                // currently only ACTION_DCA_BUY
        budget_total: u64,
        budget_remaining: u64,
        per_execution_cap: u64,
        pool_scope: vector<ID>,
        schedule: Schedule,
        risk_rules: vector<RiskRule>,
        executions_done: u64,
        executions_max: u64,
        expires_at: u64,                // ms epoch; set on activation
        duration_ms: u64,               // how long after activation it lasts
        revoked: bool,
        activation_token_hash: vector<u8>, // sha2_256(token); cleared on activate
        active: bool,
    }

    // ---------------- Events (the on-chain activity log) ----------------
    public struct CapabilityCreated has copy, drop {
        cap_id: ID,
        funder: address,
        vault_id: ID,
        budget_total: u64,
        per_execution_cap: u64,
        executions_max: u64,
    }
    public struct CapabilityActivated has copy, drop {
        cap_id: ID,
        owner: address,
        expires_at: u64,
    }
    public struct ActionExecuted has copy, drop {
        cap_id: ID,
        amount_in: u64,
        amount_out: u64,
        price_x18: u128,
        executions_done: u64,
        budget_remaining: u64,
        timestamp: u64,
    }
    public struct ExecutionSkipped has copy, drop {
        cap_id: ID,
        reason: vector<u8>,
        executions_done: u64,
        timestamp: u64,
    }
    public struct CapabilityRevoked has copy, drop {
        cap_id: ID,
        revoked_by: address,
        refunded: u64,
        timestamp: u64,
    }

    // ---------------- Lifecycle ----------------

    /// Called by the creator inside the create PTB. The capability starts
    /// inactive — the recipient must activate it with a one-time token.
    /// The capability is shared at the end of this function so subsequent
    /// PTBs can pass `&mut AgentCapability` for any signer.
    public fun create_pending(
        agent_pubkey: address,
        vault_id: ID,
        action_type: u8,
        budget_total: u64,
        per_execution_cap: u64,
        pool_scope: vector<ID>,
        interval_ms: u64,
        first_execution_at: u64,
        risk_rules: vector<RiskRule>,
        executions_max: u64,
        duration_ms: u64,
        token_hash: vector<u8>,
        ctx: &mut TxContext,
    ): ID {
        let funder = ctx.sender();
        let cap = AgentCapability {
            id: object::new(ctx),
            owner: @0x0,
            funder,
            agent_pubkey,
            vault_id,
            action_type,
            budget_total,
            budget_remaining: budget_total,
            per_execution_cap,
            pool_scope,
            schedule: Schedule { interval_ms, next_execution_at: first_execution_at },
            risk_rules,
            executions_done: 0,
            executions_max,
            expires_at: 0,
            duration_ms,
            revoked: false,
            activation_token_hash: token_hash,
            active: false,
        };
        let cap_id = object::id(&cap);
        event::emit(CapabilityCreated {
            cap_id,
            funder,
            vault_id,
            budget_total,
            per_execution_cap,
            executions_max,
        });
        transfer::share_object(cap);
        cap_id
    }

    /// Called by the recipient inside the activation PTB (Enoki-sponsored).
    /// Verifies the one-time token, binds `owner` to the sender, locks in
    /// expires_at, sets active = true. Idempotent guard via `EAlreadyActive`.
    public fun activate(
        cap: &mut AgentCapability,
        token: vector<u8>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(!cap.active, EAlreadyActive);
        assert!(!cap.revoked, ECapabilityRevoked);

        let provided = hash::sha2_256(token);
        assert!(provided == cap.activation_token_hash, EBadToken);

        let now = clock::timestamp_ms(clock);
        cap.owner = ctx.sender();
        cap.expires_at = now + cap.duration_ms;
        cap.active = true;
        cap.activation_token_hash = vector[]; // burn it

        event::emit(CapabilityActivated {
            cap_id: object::id(cap),
            owner: cap.owner,
            expires_at: cap.expires_at,
        });
    }

    // ---------------- Execution guards (the safety machine) ----------------

    /// All-in-one precondition check. Aborts if any condition fails.
    /// Pure assertions — no state mutation — so it can also be used by
    /// off-chain simulators / dry-runs.
    public fun assert_executable(
        cap: &AgentCapability,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == cap.agent_pubkey, EWrongAgent);
        assert!(cap.active, ENotActive);
        assert!(!cap.revoked, ECapabilityRevoked);
        let now = clock::timestamp_ms(clock);
        assert!(now < cap.expires_at, ECapabilityExpired);
        assert!(now >= cap.schedule.next_execution_at, ETooEarly);
        assert!(cap.executions_done < cap.executions_max, EMaxExecutionsReached);
    }

    /// Reserve `amount` from the remaining budget. Aborts if it exceeds the
    /// per-execution cap or the remaining budget. This is what makes
    /// invariant #1 (budget never exceeded) hold — enforced by Move, not by
    /// agent honesty.
    public fun reserve_budget(cap: &mut AgentCapability, amount: u64) {
        assert!(amount <= cap.per_execution_cap, EExceedsPerExecCap);
        assert!(amount <= cap.budget_remaining, EInsufficientBudget);
        cap.budget_remaining = cap.budget_remaining - amount;
    }

    /// Aborts if the requested pool is not in the capability's allowed list.
    public fun assert_pool_in_scope(cap: &AgentCapability, pool_id: ID) {
        let n = vector::length(&cap.pool_scope);
        let mut i = 0u64;
        while (i < n) {
            if (*vector::borrow(&cap.pool_scope, i) == pool_id) return;
            i = i + 1;
        };
        abort EPoolNotInScope
    }

    /// PTB-callable wrapper. Atomic: assertions → budget reservation →
    /// physical withdraw. Returns the Coin<T> the agent can hand to Deepbook.
    ///
    /// This is the ONLY function path from the Vault to a Coin in a hot
    /// execution PTB. If it aborts, no funds move; the transaction reverts.
    public fun draw_for_execution<T>(
        cap: &mut AgentCapability,
        v: &mut Vault<T>,
        amount: u64,
        pool_id: ID,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        // Bind the vault to this capability.
        assert!(object::id(v) == cap.vault_id, EWrongVault);
        assert_executable(cap, clock, ctx);
        assert_pool_in_scope(cap, pool_id);
        reserve_budget(cap, amount);
        vault::withdraw<T>(v, amount, ctx)
    }

    // ---------------- Logging (advances schedule, emits events) ----------------

    /// Record a successful execution. Bumps the schedule by `interval_ms`,
    /// increments `executions_done`, emits `ActionExecuted`. Callers should
    /// invoke this AFTER the trade settles, in the same PTB.
    public fun log_action(
        cap: &mut AgentCapability,
        amount_in: u64,
        amount_out: u64,
        price_x18: u128,
        clock: &Clock,
    ) {
        cap.executions_done = cap.executions_done + 1;
        cap.schedule.next_execution_at =
            cap.schedule.next_execution_at + cap.schedule.interval_ms;
        let ts = clock::timestamp_ms(clock);
        event::emit(ActionExecuted {
            cap_id: object::id(cap),
            amount_in,
            amount_out,
            price_x18,
            executions_done: cap.executions_done,
            budget_remaining: cap.budget_remaining,
            timestamp: ts,
        });
    }

    /// Record a skip. Advances the schedule and counts toward executions_done
    /// (the slot is consumed) but does NOT touch the budget — funds remain
    /// available for the next slot. The agent SHOULD attach a human-readable
    /// reason (CLAUDE.md §6).
    public fun log_skip(
        cap: &mut AgentCapability,
        reason: vector<u8>,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == cap.agent_pubkey, EWrongAgent);
        assert!(cap.active, ENotActive);
        assert!(!cap.revoked, ECapabilityRevoked);
        cap.executions_done = cap.executions_done + 1;
        cap.schedule.next_execution_at =
            cap.schedule.next_execution_at + cap.schedule.interval_ms;
        let ts = clock::timestamp_ms(clock);
        event::emit(ExecutionSkipped {
            cap_id: object::id(cap),
            reason,
            executions_done: cap.executions_done,
            timestamp: ts,
        });
    }

    // ---------------- Revocation ----------------

    /// Either party (recipient or funder) can revoke at any time. Refunds the
    /// remaining vault balance to the funder in the same PTB. After this,
    /// every `assert_executable` aborts on `ECapabilityRevoked` — invariant #3.
    public fun revoke<T>(
        cap: &mut AgentCapability,
        v: &mut Vault<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(sender == cap.owner || sender == cap.funder, EUnauthorized);
        assert!(object::id(v) == cap.vault_id, EWrongVault);

        cap.revoked = true;
        let remaining = vault::balance_value(v);
        vault::refund<T>(v, ctx);

        event::emit(CapabilityRevoked {
            cap_id: object::id(cap),
            revoked_by: sender,
            refunded: remaining,
            timestamp: clock::timestamp_ms(clock),
        });
    }

    // ---------------- Read-only accessors (for off-chain indexers) ----------------

    public fun owner(cap: &AgentCapability): address { cap.owner }
    public fun funder(cap: &AgentCapability): address { cap.funder }
    public fun agent_pubkey(cap: &AgentCapability): address { cap.agent_pubkey }
    public fun vault_id(cap: &AgentCapability): ID { cap.vault_id }
    public fun budget_remaining(cap: &AgentCapability): u64 { cap.budget_remaining }
    public fun per_execution_cap(cap: &AgentCapability): u64 { cap.per_execution_cap }
    public fun executions_done(cap: &AgentCapability): u64 { cap.executions_done }
    public fun executions_max(cap: &AgentCapability): u64 { cap.executions_max }
    public fun next_execution_at(cap: &AgentCapability): u64 { cap.schedule.next_execution_at }
    public fun expires_at(cap: &AgentCapability): u64 { cap.expires_at }
    public fun is_active(cap: &AgentCapability): bool { cap.active && !cap.revoked }
    public fun is_revoked(cap: &AgentCapability): bool { cap.revoked }
}
