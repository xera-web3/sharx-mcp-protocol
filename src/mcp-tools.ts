/**
 * MCP write-side tool input/output types.
 * See api-contract-v2-2.md §5.2.
 *
 * v2.2 build order: list_nft first (already PoC-validated), mint_nft second
 * (strict subset of list_nft infrastructure).
 */
import type { Address, WeiString } from './scope-policy.js';
import type { ChainId } from './chain.js';
import type { SerializedSessionKey } from './session-key.js';
import type { IdempotencyKey } from './idempotency.js';
import type { ApiResult } from './errors.js';

/**
 * Per-request context, never persisted.
 *
 * `session_key`: opaque branded string. MCP deserializes in-memory only.
 * `caller_id`:   opaque agent identifier (e.g. agent-xera). For audit + rate
 *                limit. Not a security boundary (the chain is).
 * `idempotency_key`: REQUIRED in v2.2 (was optional in v2.1). UUIDv4.
 * `chain_id`:    default = Arbitrum Sepolia per Tim.
 * `gas_payer`:   caller assertion. MCP cross-checks against the value
 *                statically inspected from the serialized session key
 *                (per spike §13). Mismatch → SCOPE_VIOLATION.
 */
export type WriteContext = {
  session_key: SerializedSessionKey;
  caller_id: string;
  idempotency_key: IdempotencyKey;
  chain_id?: ChainId;
  gas_payer?: 'sponsored' | 'self';
};

// =============================================================================
// list_nft  — first to build (PoC-validated, two-phase approve→list)
// =============================================================================

export type ListNftInput = WriteContext & {
  contract: Address;
  token_id: string;          // stringified bigint
  amount: number;            // ERC-1155 quantity, default 1
  price_wei: WeiString;
  duration_seconds: number;  // listing TTL
  zone?: Address;            // defaults to OpenSea SignedZone
  salt?: string;
};

export type ListNftOutput = {
  order_hash: `0x${string}`;
  opensea_url?: string;
  expires_at: number;        // unix seconds
  approve_user_op_hash?: `0x${string}`;  // present if approval was needed
  approve_tx_hash?: `0x${string}`;
};

// =============================================================================
// mint_nft  — second (strict subset of list_nft infrastructure)
// =============================================================================

export type MintNftInput = WriteContext & {
  post_factory: Address;
  metadata_uri: string;      // ipfs:// or https://
  amount: number;
  to?: Address;              // defaults to session-key-bound smart account
};

export type MintNftOutput = {
  tx_hash: `0x${string}`;
  user_op_hash: `0x${string}`;
  contract: Address;
  token_id: string;
  block_number?: number;
};

// =============================================================================
// Tool surface
// =============================================================================

export type WriteTools = {
  list_nft: (input: ListNftInput) => Promise<ApiResult<ListNftOutput>>;
  mint_nft: (input: MintNftInput) => Promise<ApiResult<MintNftOutput>>;
};
