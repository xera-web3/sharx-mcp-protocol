/**
 * Branded opaque type for serialized ZeroDev session keys.
 *
 * The actual value is the base64+JSON output of
 * `serializePermissionAccount()` from `@zerodev/permissions`. From the
 * contract's perspective it MUST be treated as opaque — only MCP's internal
 * `inspectSerializedSessionKey()` helper is allowed to parse it (see
 * api-contract-v2-2.md §A11 / changelog v2.2-13).
 *
 * MCP MUST NEVER persist, log, or cache this value (A2 / A3).
 */
export type SerializedSessionKey = string & { readonly __brand: 'SerializedSessionKey' };

/**
 * Cast a raw string to the branded type at the trust boundary
 * (e.g. inside the MCP tool handler after caller HMAC + body parse).
 * Both sides should validate basic shape before casting.
 */
export function asSerializedSessionKey(raw: string): SerializedSessionKey {
  if (!raw || typeof raw !== 'string') {
    throw new Error('asSerializedSessionKey: empty or non-string input');
  }
  // Loose sanity check — base64+JSON output is at minimum a few hundred chars.
  if (raw.length < 64) {
    throw new Error('asSerializedSessionKey: input too short to be a real serialized session key');
  }
  return raw as SerializedSessionKey;
}
