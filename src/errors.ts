/**
 * Stable error code enum + envelope for both sides of the contract.
 * See api-contract-v2-2.md §4.
 *
 * Codes are strings (not numeric) so agents can branch on them readably.
 */
export type ErrorCode =
  // Auth / identity
  | 'UNAUTHORIZED'             // caller HMAC failed
  | 'FORBIDDEN'                // authenticated but not allowed
  | 'CALLER_RATE_LIMITED'

  // Validation
  | 'INVALID_INPUT'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'INVALID_METADATA_URI'
  | 'MISSING_SESSION_KEY'
  | 'MALFORMED_SESSION_KEY'

  // Session-key / scope
  | 'SESSION_KEY_EXPIRED'
  | 'SESSION_KEY_REVOKED'
  | 'SCOPE_VIOLATION'          // includes { violated_policy, detail } in details
  | 'GAS_BUDGET_EXCEEDED'
  | 'RATE_LIMIT_POLICY_HIT'

  // Bundler / chain
  | 'BUNDLER_REJECTED'
  | 'USEROP_REVERTED'
  | 'INSUFFICIENT_GAS'
  | 'NONCE_CONFLICT'
  | 'CHAIN_REVERTED'
  | 'APPROVAL_NOT_CONFIRMED'   // pre-flight check before list_nft step 2

  // OpenSea relay
  | 'OPENSEA_REJECTED'
  | 'OPENSEA_UNAVAILABLE'

  // Cross-boundary
  | 'UPSTREAM_TIMEOUT'
  | 'WEB3_BACKEND_ERROR'

  // Last resort
  | 'INTERNAL_ERROR';

export type ErrorLayer =
  | 'validation'
  | 'deserialize'
  | 'bundler'
  | 'chain'
  | 'opensea'
  | 'web3-backend'
  | 'internal';

export type ApiError = {
  code: ErrorCode;
  message: string;
  hint?: string;
  retryable: boolean;
  layer: ErrorLayer;
  /**
   * Free-form supplementary detail.
   * MUST NEVER include serialized session key material.
   */
  details?: Record<string, unknown>;
};

export type ApiResultOk<T> = { ok: true; data: T };
export type ApiResultErr = { ok: false; error: ApiError };
export type ApiResult<T> = ApiResultOk<T> | ApiResultErr;

/**
 * For SCOPE_VIOLATION errors, the details object MUST set this shape so the
 * frontend W3 scope-builder UI can tell the user exactly what to widen.
 */
export type ScopeViolationDetails = {
  violated_policy: 'CallPolicy' | 'SignaturePolicy' | 'GasPolicy' | 'RateLimitPolicy';
  detail: string;
};
