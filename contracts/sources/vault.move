// SPDX-License-Identifier: Apache-2.0
//
// vouch::vault — funds the AgentCapability operates over.
//
// Design (CLAUDE.md §4.2):
//   - The Vault is a SHARED object so both the agent and the recipient/funder
//     can pass &mut Vault into PTBs.
//   - It is generic over the coin type T so we can plug in the EXACT testnet
//     USDC coin type expected by the Deepbook v3 pool (CLAUDE.md §2 critical
//     gotchas — the pool's coin type is the source of truth).
//   - `withdraw` and `refund` are `public(friend)` to `vouch::capability`:
//     a PTB cannot drain the vault directly. The only legal paths to funds
//     are an execution PTB (gated by capability assertions) and a revocation
//     PTB (gated by capability auth).
//
// Invariant 1 (CLAUDE.md §1): "The agent cannot exceed the budget." That is
// enforced upstream in `capability::reserve_budget`; this module is the
// custody primitive that physically holds the coins.

module vouch::vault {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::transfer;

    // Note: `friend vouch::capability` would be the 2024.alpha syntax. In
    // 2024.beta and later, `public(package)` replaces it — same semantics
    // (only modules inside this package can call). Withdraw/refund below use
    // it so funds only move through the capability module's gated paths.

    // --- Errors ---
    const ENotFunder: u64 = 100;

    /// Held in a shared object. `funder` is the address that originally
    /// supplied the coins and is the only authorized refund destination.
    public struct Vault<phantom T> has key {
        id: UID,
        funder: address,
        balance: Balance<T>,
    }

    // --- Lifecycle ---

    /// Create a Vault from a Coin. The funder is `tx_context::sender`.
    /// Returns the Vault by value so the caller may share it in the same PTB.
    public fun create_vault<T>(c: Coin<T>, ctx: &mut TxContext): Vault<T> {
        let funder = ctx.sender();
        let bal = coin::into_balance(c);
        Vault<T> { id: object::new(ctx), funder, balance: bal }
    }

    /// Convenience: create + share in one call. Returns the object's ID so
    /// it can be referenced when constructing the capability in the same PTB.
    public fun create_and_share<T>(c: Coin<T>, ctx: &mut TxContext): ID {
        let v = create_vault(c, ctx);
        let id = object::id(&v);
        transfer::share_object(v);
        id
    }

    // --- Friend-only mutators (only callable from vouch::capability) ---

    /// Friend-only withdraw. The caller (capability module) MUST have already
    /// passed every execution assertion before invoking this.
    public(package) fun withdraw<T>(
        vault: &mut Vault<T>,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<T> {
        let bal = balance::split(&mut vault.balance, amount);
        coin::from_balance(bal, ctx)
    }

    /// Friend-only refund: drains remaining balance back to the original
    /// funder. Called from `capability::revoke` (and on completion) after
    /// the authorization check is satisfied.
    public(package) fun refund<T>(vault: &mut Vault<T>, ctx: &mut TxContext) {
        let amt = balance::value(&vault.balance);
        if (amt == 0) return;
        let bal = balance::split(&mut vault.balance, amt);
        let c = coin::from_balance(bal, ctx);
        transfer::public_transfer(c, vault.funder);
    }

    // --- Read-only accessors ---

    public fun funder<T>(v: &Vault<T>): address { v.funder }
    public fun balance_value<T>(v: &Vault<T>): u64 { balance::value(&v.balance) }

    // --- Authorization helper (used by capability::revoke) ---
    public(package) fun assert_funder<T>(v: &Vault<T>, addr: address) {
        assert!(v.funder == addr, ENotFunder);
    }
}
