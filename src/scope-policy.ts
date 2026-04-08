/**
 * Session-key scope policy types.
 * See api-contract-v2-2.md §3.1.
 *
 * The frontend builds these via the W3 scope-builder UI when the user
 * authorizes a session key. They get encoded into the serialized
 * PermissionAccount blob handed to the agent.
 *
 * MCP statically inspects the serialized blob (per spike §13) to recover
 * the GasPolicy without a chain round-trip. Other policies are recovered
 * the same way for SCOPE_VIOLATION error hints.
 */

export type Address = `0x${string}`;
export type WeiString = string; // bigint serialized as decimal string

export type MintCallPolicy = {
  kind: 'mint';
  contract: Address;            // Post1155 / PostFactory
  function: 'mint';
  max_amount_per_call: number;  // safety cap on `amount`
  gas_budget_wei: WeiString;    // total gas budget across the key's lifetime
};

export type ListingCallPolicy = {
  kind: 'listing-approve';
  contract: Address;            // Post1155
  function: 'setApprovalForAll';
  conduit: Address;             // OpenSea Seaport conduit
  gas_budget_wei: WeiString;
};

export type ListingSignaturePolicy = {
  kind: 'listing-sign';
  zone: Address;                // SignedZone default 0x000056f7000000ece9003ca63978907a00ffd100
  conduit: Address;
  max_listings: number;         // session-lifetime cap
  max_price_wei?: WeiString;    // optional per-listing price ceiling
};

export type SessionKeyPolicy =
  | MintCallPolicy
  | ListingCallPolicy
  | ListingSignaturePolicy;

/**
 * The W3 scope-builder UI surfaces these to the user. A listing-capable
 * session key MUST carry both ListingCallPolicy AND ListingSignaturePolicy
 * — neither alone is sufficient.
 */
export type SessionKeyScopeBundle = {
  policies: SessionKeyPolicy[];
  ttl_seconds: number;
  gas_payer: 'sponsored' | 'self';  // baked at creation time, cannot change
};
