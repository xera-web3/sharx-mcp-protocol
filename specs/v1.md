# Web3 ↔ MCP API Contract — v1 (merged draft)

_Date: 2026-04-08_
_Compiled by: Xera_
_Sources:_
- _`~/agents/_shared/inbox/xera/web3-side-api-contract.md` — Vinci (agent-web3)_
- _`~/agents/_shared/inbox/xera/mcp-side-api-contract.md` — sharx-mcp_
- _`~/agents/xera/plans/ncp-permission-split-v1.md` — permission-split plan_

_Status: Awaiting Tim's call on the 4 open items in §8 before this becomes v1 final and gets implemented._

---

## 1. Where both sides already agree

These are the points where both drafts converged independently — locked in unless Tim objects.

| # | Decision | Source |
|---|---|---|
| A1 | **TypeScript shared package** (`@sharx/api-contract`) is the source of truth. No OpenAPI, no Postman, no JSON Schema duplication. Both repos pin via npm/symlink. | web3 §3.1, mcp §0 |
| A2 | **`session_key` is a per-request body parameter, never a header / cookie / long-lived auth token.** Forces every layer to treat it as data, not auth context. | web3 §3.3, mcp §5 |
| A3 | **MCP never persists, caches, or logs `session_key` material.** Hard-redaction middleware on both sides. Test asserts the string `session_key` never appears in log output paths. | web3 §3.8, mcp §5 |
| A4 | **Chain is the final enforcer.** MCP validation is defense-in-depth, not a security boundary. Smart-account session-key validator (C1) is the source of truth on what an agent can do. | both |
| A5 | **Idempotency key is mandatory on every write.** UUIDv4, scoped per logical operation (not per retry). Web3 stores `(agent_id, idempotency_key) → response` 24h; MCP hashes the key before any storage and dedupes UserOps in a 5-min window. | web3 §3.6, mcp §2.1 |
| A6 | **Stable error code enum, structured error envelope, `retryable` flag.** No raw RPC errors leaking to agents. | web3 §3.4, mcp §2.1 |
| A7 | **Cursor-based pagination**, default `limit=20`, max `100`. No offset params. | web3 §3.5 (mcp ok with this) |
| A8 | **MCP never calls back into promotion-web3 inside the write path.** Agent-initiated only. The agent fans out: agent → MCP for chain action, agent → web3 backend for DB linking afterward. | web3 §4.1, mcp §3 |
| A9 | **No webhooks** in v1. Web3 polls its existing chain indexer; MCP doesn't push. | web3 §4.2, mcp §3 |
| A10 | **MCP submits all chain transactions on the agent path.** `promotion-web3` does NOT submit chain txs on the agent path — `u/proxyZerodev` stays for the master-key UI flow only and is feature-flag-gated from the agent path. | web3 §5, mcp §3 |
| A11 | **Both sides hold the OpenSea ERC-1271 PoC as a hard prerequisite.** Half-day spike before either side writes contract-shaped code. | web3 §6.1, mcp §4.6 |

---

## 2. The shared TypeScript package

```
@sharx/api-contract/
  ├─ src/
  │   ├─ session-key.ts        // SerializedSessionKey (opaque branded string + Kernel version pin)
  │   ├─ scope-policy.ts       // CallPolicy / SignaturePolicy / GasPolicy / RateLimitPolicy types
  │   ├─ errors.ts             // ErrorCode enum + ApiError envelope
  │   ├─ pagination.ts         // CursorPage<T>
  │   ├─ idempotency.ts        // IdempotencyKey branded type
  │   ├─ web3-routes.ts        // RouteSpec<Input, Output> for every /api/v1/agent/* route
  │   ├─ mcp-tools.ts          // Input/Output types for every MCP write tool
  │   └─ index.ts
  ├─ package.json              // versioned semver, MCP & promotion-web3 both pin
  └─ tsconfig.json
```

**Versioning rule:** semver. Additive fields = patch/minor. Breaking changes = major bump + URL prefix bump (`/api/v1/agent/*` → `/api/v2/agent/*`). Both consumers pin a single major.

**Owner:** new repo (or shared submodule under `~/agents/_shared/contracts/web3-mcp/`). Both agents commit via PR; Xera merges.

---

## 3. Error envelope (final form, both sides)

```ts
type ApiError = {
  code: ErrorCode;
  message: string;          // human-readable, safe for the agent to relay
  hint?: string;            // suggested next action
  retryable: boolean;
  layer: 'validation' | 'deserialize' | 'bundler' | 'chain' | 'opensea' | 'web3-backend' | 'internal';
  details?: Record<string, unknown>;  // never includes session_key material
};

type ApiResultOk<T> = { ok: true; data: T };
type ApiResultErr  = { ok: false; error: ApiError };
type ApiResult<T>  = ApiResultOk<T> | ApiResultErr;
```

**Unified ErrorCode enum** (merged from both drafts):

```ts
type ErrorCode =
  // Auth / identity (web3 + mcp boundary):
  | 'UNAUTHORIZED'             // caller HMAC failed
  | 'FORBIDDEN'                // caller authenticated but not allowed for this op
  | 'CALLER_RATE_LIMITED'      // M5

  // Validation (caller's fault):
  | 'INVALID_INPUT'
  | 'INVALID_ADDRESS'
  | 'INVALID_AMOUNT'
  | 'INVALID_METADATA_URI'
  | 'MISSING_SESSION_KEY'
  | 'MALFORMED_SESSION_KEY'

  // Session-key / scope (chain or pre-flight check):
  | 'SESSION_KEY_EXPIRED'
  | 'SESSION_KEY_REVOKED'
  | 'SCOPE_VIOLATION'          // includes { violated_policy, detail } in details
  | 'GAS_BUDGET_EXCEEDED'
  | 'RATE_LIMIT_POLICY_HIT'

  // Bundler / chain:
  | 'BUNDLER_REJECTED'
  | 'USEROP_REVERTED'
  | 'INSUFFICIENT_GAS'
  | 'NONCE_CONFLICT'
  | 'CHAIN_REVERTED'

  // OpenSea relay:
  | 'OPENSEA_REJECTED'
  | 'OPENSEA_UNAVAILABLE'

  // Cross-boundary (web3 backend ↔ mcp):
  | 'UPSTREAM_TIMEOUT'
  | 'WEB3_BACKEND_ERROR'

  // Last resort:
  | 'INTERNAL_ERROR';
```

When `code = 'SCOPE_VIOLATION'`, MCP MUST set
`details: { violated_policy: 'CallPolicy' | 'SignaturePolicy' | 'GasPolicy' | 'RateLimitPolicy', ... }`
so the W3 scope builder can show the user exactly what to widen. (web3 §4.4)

---

## 4. Auth between MCP and promotion-web3

Two layers, kept separate. (web3 §3.3, with mcp §4.5 confirming HMAC for the one server↔server endpoint.)

### 4.1 Caller identity (MCP → promotion-web3)
- Header: `X-Sharx-Agent-Id: <agent-id>`
- Header: `X-Sharx-Signature: <hex-hmac-sha256>`
- HMAC over: `${timestamp}\n${method}\n${path}\n${sha256(body)}`
- Header: `X-Sharx-Timestamp: <unix-seconds>` (reject if >5 min skew)
- Shared secret rotated quarterly, stored in MCP env + promotion-web3 env (NOT committed)
- **Used for rate limiting + audit only.** NOT a security boundary for user state — that's layer 2.

### 4.2 User authority (the actual security boundary)
- For any `/api/v1/agent/*` endpoint that mutates user state, the request body MUST contain the **serialized session key** in the `session_key` field.
- The route validates the session key's smart-account address matches the target `userId`/`wallet`.
- **NextAuth cookies are NOT accepted on the agent path.** They are accepted only on the legacy `/api/u/*` master-key path.
- The chain is the final enforcer for anything that becomes a UserOp.

### 4.3 The single MCP → web3 server endpoint
The only HTTP call from MCP into promotion-web3 in v1 is the smart-account resolver (§5.1 Q1 below). It uses caller-identity HMAC only — no session_key needed because it's a pure read.

---

## 5. The actual API surface

### 5.1 promotion-web3 → exposes to MCP/agents (under `/api/v1/agent/*`)

All routes use the auth model in §4, idempotency from A5, error envelope from §3.

**Read (no session_key required, caller HMAC only):**
| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/agent/user/:wallet` | user profile + linked accounts |
| GET | `/api/v1/agent/user/:userId/smart-account` | `{ address, deployed }` *(MCP §4.4 ask)* |
| GET | `/api/v1/agent/activity` | `CursorPage<Activity>` |
| GET | `/api/v1/agent/activity/:id` | activity detail |
| GET | `/api/v1/agent/activity/:id/participants` | `CursorPage<Participant>` |
| GET | `/api/v1/agent/nft/:contract/metadata` | NFT metadata |
| GET | `/api/v1/agent/quote/mint-fee` | fee quote |
| GET | `/api/v1/agent/quote/activity-fee` | fee quote |
| GET | `/api/v1/agent/airdrops/status?wallet=...` | airdrop status |

**Write (session_key + idempotency key required):**
| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/agent/activity/create` | DB only — no chain tx |
| POST | `/api/v1/agent/activity/:id/cancel` | DB only |
| POST | `/api/v1/agent/listing/create` | wraps `u/opensea/listing`; v1 may defer to `mcp.list_nft` instead — see §8.2 |
| POST | `/api/v1/agent/listing/cancel` | same as above |
| POST | `/api/v1/agent/nft/mint-record` | **records** a tx_hash that MCP already submitted; promotion-web3 indexes it. promotion-web3 does NOT submit chain txs on the agent path. |

**NOT exposed:** `internal/*`, `auth/*`, `public/db/explore`, `public/test-derive-wallet`, all `u/ipfs/*`, `u/uploadImage`, `u/user/*`, `u/onboarding/*`, `rapidapi/*`, `instagram/*`, `proxy-image/video`, original `u/proxyZerodev`.

### 5.2 MCP → exposes to agents (write tools, replacing/augmenting promotion-web3 chain calls)

All write tools share `WriteContext`. (mcp §2.1)

```ts
type WriteContext = {
  session_key: SerializedSessionKey;   // branded type from @sharx/api-contract
  idempotency_key?: IdempotencyKey;    // branded UUIDv4
  chain_id?: number;                   // default = Arbitrum Sepolia in v1
};

type WriteTools = {
  mint_nft:            (i: MintNftInput)            => Promise<ApiResult<MintNftOutput>>;
  approve_for_listing: (i: ApproveForListingInput)  => Promise<ApiResult<ApproveForListingOutput>>;
  list_nft:            (i: ListNftInput)            => Promise<ApiResult<ListNftOutput>>;
  cancel_listing:      (i: CancelListingInput)      => Promise<ApiResult<CancelListingOutput>>;
  claim:               (i: ClaimInput)              => Promise<ApiResult<ClaimOutput>>;

  // ADDED in merge — web3 §4.3 asked for this:
  dry_run:             (i: DryRunInput)             => Promise<ApiResult<DryRunOutput>>;
};

type DryRunInput = {
  tool: 'mint_nft' | 'approve_for_listing' | 'list_nft' | 'cancel_listing' | 'claim';
  params: MintNftInput | ApproveForListingInput | ListNftInput | CancelListingInput | ClaimInput;
};
type DryRunOutput = {
  encoded_user_op: `0x${string}`;
  estimated_gas: string;             // bigint as string
  policy_hits: { policy_type: 'CallPolicy' | 'SignaturePolicy' | 'GasPolicy' | 'RateLimitPolicy'; ok: boolean; detail?: string }[];
};
```

Full Input/Output types for `mint_nft`, `approve_for_listing`, `list_nft`, `cancel_listing`, `claim` are taken verbatim from `mcp-side-api-contract.md §2.2` — those are good as-is.

The existing 7 read-only MCP tools (`list_activities`, `get_activity`, `explore_nfts`, `lookup_user`, `lookup_wallet`, `search_users`, `get_collection_metadata`) stay as-is for v1. Typing overhaul is punted out of scope.

---

## 6. Logging, audit, and observability

| Topic | Decision |
|---|---|
| Session-key redaction | Hard rule on both sides. Middleware-level. Test asserts `session_key` substring never reaches stdout / Sentry / metrics labels. |
| Audit log fields | `(timestamp, caller_agent_id, tool_or_route, target_contract, target_function_or_endpoint, idempotency_key_hash, tx_hash?, result_code)` — no key material. |
| **Audit log storage** | **OPEN — see §8.4.** Vinci wants Postgres on both sides; sharx-mcp wants stdout-only on v1. Tim to decide. |
| Health endpoints | MCP exposes `/health`. promotion-web3's existing `/api/health/zerodev` calls MCP's `/health` and bubbles status into the dashboard. (web3 §4.5) |

---

## 7. Build sequence (merged from both)

0. **OpenSea ERC-1271 PoC** (½ day, blocking) — Vinci verifies OpenSea accepts a Kernel smart-account ERC-1271 sig on a real listing. **If this fails, §5.2 `list_nft` is redesigned and the contract changes shape.**
1. **`@sharx/api-contract` package scaffold** — types, error enum, branded types. Both repos pin to v0.1.
2. **MCP scaffold (write side)** — `/health`, `WriteContext` deserialize round-trip, no chain calls yet.
3. **MCP `mint_nft`** end-to-end on Arbitrum Sepolia (Call Policy, simplest).
4. **promotion-web3 `/api/v1/agent/*` middleware** — caller HMAC, idempotency store, error envelope, `session_key` redaction. Then add `nft/mint-record` route.
5. **MCP `approve_for_listing`** (Call Policy).
6. **MCP `list_nft`** (Signature Policy + Seaport — risky path, gated on step 0 result).
7. **MCP `cancel_listing`**, **`claim`**, **`dry_run`**.
8. **Frontend `useCreateSessionKey()` hook + W3 scope builder UI** — can run in parallel with steps 3–6.
9. **Audit log + caller rate limiting + redaction lint test** — last, before any external agent gets a session key.

---

## 8. Open items — Tim's call

| # | Question | Vinci's view | sharx-mcp's view | Xera's recommendation |
|---|---|---|---|---|
| 8.1 | **OpenSea ERC-1271 acceptance — has the PoC verified this?** | Not yet. Wants ½ day spike before contract code lands. | Same — calls it the single biggest unknown. Will not scaffold Seaport path until this is answered. | **Do the spike first.** Both sides are blocked on this. Highest leverage half-day. |
| 8.2 | **Where does `listing/create` actually live?** | Vinci's draft has `/api/v1/agent/listing/create` wrapping `u/opensea/listing`. | sharx-mcp's `list_nft` does the whole thing onchain via session key + Seaport + relay. | **MCP owns `list_nft` end-to-end.** promotion-web3 does NOT need to wrap; it only `nft/mint-record`s the result for indexing. Drop `listing/create` from §5.1. |
| 8.3 | **Where does write code live?** | (no opinion stated) | Same repo (`sharx-mcp-server`), new `src/write/` module, separate entrypoint. | **Agree with sharx-mcp.** Same repo, isolated subdir, makes audit trivial. |
| 8.4 | **Audit log retention** | Postgres on both sides — for join-on-incident. | stdout + JSON shipper for v1; Postgres only when there's a real reason. | **Compromise: stdout on MCP for v1, Postgres on promotion-web3 (it already has Postgres).** Cross-boundary join via shared `idempotency_key_hash`. Revisit after first incident. |
| 8.5 | **Paymaster strategy** | (no opinion) | Default sponsored, add `pay_mode` field later. | **Sponsored for v1.** Best onboarding UX. Cost is contained because `RateLimitPolicy` + write rate limit caps abuse. |
| 8.6 | **Test strategy** | (no opinion) | Anvil fork for deterministic, Sepolia for OpenSea relay path. | **Agree with sharx-mcp.** Anvil for `mint_nft` / `approve_for_listing` / `cancel_listing` (onchain mode). Sepolia for `list_nft` and OpenSea-relay path. |

---

## 9. Out of scope for v1

- Read-side MCP tool typing overhaul
- Multi-chain support (design accommodates `chain_id`, but v1 = Arbitrum Sepolia)
- Streaming / progress events for long-running UserOps
- Any new agent-identity / API-key system beyond §4.1 HMAC

---

## 10. What happens after Tim's call

1. Tim answers §8 (especially 8.1 and 8.4).
2. Vinci runs the OpenSea ERC-1271 PoC.
3. If PoC passes → this becomes `api-contract-v1.md` (not draft), Xera dispatches `@sharx/api-contract` package bootstrap to whichever agent owns it, and steps 1–2 of §7 begin in parallel.
4. If PoC fails → §5.2 `list_nft` is redesigned; rest of contract is unaffected and can proceed.
