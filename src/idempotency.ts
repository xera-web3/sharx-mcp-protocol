/**
 * Branded UUIDv4 idempotency key.
 *
 * Per api-contract-v2-2.md §A5:
 *  - UUIDv4, scoped per logical operation (NOT per retry)
 *  - Both web3 backend and MCP dedupe on a 24h window
 *  - Storage key: (caller_id, idempotency_key_hash)
 *  - Hash function pinned: sha256(idempotency_key_uuid_lowercased), no salt
 */
export type IdempotencyKey = string & { readonly __brand: 'IdempotencyKey' };

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asIdempotencyKey(raw: string): IdempotencyKey {
  if (!UUID_V4_RE.test(raw)) {
    throw new Error('asIdempotencyKey: not a valid UUIDv4');
  }
  return raw.toLowerCase() as IdempotencyKey;
}

/**
 * The single hash function used for cross-boundary join.
 * Both web3 backend and MCP MUST hash with this exact function.
 *
 * Implementation note: returns hex-encoded sha256 of the lowercased UUID,
 * no salt. The hashing is done by the consumer (Node crypto on web3,
 * Web Crypto on MCP) — this file just declares the contract.
 *
 * Reference implementation pseudocode:
 *   sha256(idempotencyKeyLowercase).toString('hex')
 */
export type IdempotencyKeyHash = string & { readonly __brand: 'IdempotencyKeyHash' };
