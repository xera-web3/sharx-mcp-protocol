# Web3 ↔ MCP API Contract — v2.2

_Date: 2026-04-08_
_Compiled by: Xera_
_Supersedes: api-contract-v1.md, api-contract-v2.md, api-contract-v2-1.md_

_Status: **Tim signed off on Option A on 2026-04-08. v2.1 anchor review by web3 + sharx-mcp returned OK WITH NOTES (0 blockers). v2.2 incorporates all 11 review findings + Tim's clarifications on lookup routes.** Pending: web3 ZeroDev SDK static spike result for `gas_payer` field strategy. Once spike result lands, this becomes the build-ready spec._

## Changelog v2.1 → v2.2

| # | Change | Source |
|---|---|---|
| v2.2-1 | **Record-only routes drop `session_key` requirement** — `nft/mint-record` and `listing/record` now accept only HMAC + idempotency_key + tx_hash/order_hash. New "Record" auth class. | sharx-mcp finding 8.A |
| v2.2-2 | **`caller_id` field added to `WriteContext`** — explicit agent identity for audit/rate limit. | sharx-mcp finding 8.B |
| v2.2-3 | **Idempotency window aligned to 24h on both sides** — fixes minute-6 retry duplicate-listing bug. | both reviewers (real bug) |
| v2.2-4 | **Hash function pinned**: `sha256(idempotency_key_uuid_lowercase)`, no salt, hardcoded both sides. | web3 finding 7C |
| v2.2-5 | **Replay-after-revocation rule**: idempotency replay OK at response layer for already-completed UserOps; new UserOp construction MUST re-validate session-key liveness. | web3 finding 7D |
| v2.2-6 | **`HealthResponse` typed shape** added to shared package. | sharx-mcp finding 8.F |
| v2.2-7 | **`list_nft` step 5 explicitly fetches `Seaport.getCounter(offerer)`** before building order. | sharx-mcp finding 8.G |
| v2.2-8 | **MCP credentials list expanded**: `MCP_OPENSEA_API_BASE` (URL pin), per-chain bundler RPC env vars, audit log + rate limit env. | sharx-mcp finding 8.H |
| v2.2-9 | **`/api/v1/agent/user/:userId/smart-account` REMOVED** — agent has no userId without lookup; smart account address is already derivable from session_key inside MCP. | Tim + analysis |
| v2.2-10 | **4 new bidirectional `/api/v1/agent/lookup/*` routes** — by-wallet, by-user-id, by-username, by-smart-account. Pure read, HMAC only. Mirror existing `public/userWallet`+`public/user` logic. | Tim's "agent needs to know its user" requirement |
| v2.2-11 | **PoC scope-policy is looser than v2.2 contract** (informational note) — existing `useSessionKey.ts` uses wildcard ERC-1155 target with no gas budget; v2.2 narrows. Frontend rewrite must adopt shared package types. | web3 finding 7.I |
| v2.2-12 | **Handoff method = copy/paste only for v2.x** — base64 blob is 2-4KB+, too long for QR; deferring mobile/QR/deeplink handoff to v3. | Tim's call |
| v2.2-13 | **`gas_payer` strategy LOCKED → Option A confirmed by web3 static spike.** MCP statically inspects the serialized session-key blob (base64+JSON of `PermissionAccountParams`) to extract `policies[].policyParams` where `type === 'gas'`, then reads `enforcePaymaster` + `allowedPaymaster` to determine sponsored vs self mode. ~5-line helper, no chain round-trip, no runtime SDK dependency on internal APIs. Spike report: `~/agents/_shared/inbox/xera/zerodev-gaspolicy-static-spike.md`. `WriteContext.gas_payer` stays as a **caller assertion** that MCP cross-checks against the inspected value — mismatch returns `SCOPE_VIOLATION` with `details.violated_policy = 'GasPolicy'`. | web3 spike |

---

## 0. Two-product separation rationale (the "why" of Option A)

This contract treats **sharx.app (user-facing website)** and **the Sharx agent platform (MCP)** as **two separate products**, not as two entry points into one product. They share the smart contracts on-chain, but everything above the chain is independent:

| Aspect | sharx.app (master-key) | Sharx agent platform (session-key) |
|---|---|---|
| Users | Real human creators / collectors | AI agents acting on behalf of users |
| Auth | Browser + Privy + NextAuth cookie | Serialized session key as request param |
| Threat model | Standard web app | Delegated authority + third-party agent runtimes |
| SLA | 99.9% target | Best-effort, PoC stage |
| Scaling profile | Bursty around drops | Long-tail, lower QPS, longer per-request |
| Deploy cadence | Weekly product releases | Independent (move fast in PoC, harden later) |
| Credentials | Web3 set: ZeroDev key A, Paymaster A, OpenSea key A | **MCP set**: ZeroDev key B, Paymaster B, OpenSea key B |
| Code repo | `promotion-web3` | `sharx-mcp-server` (new write-side module) |

**Why two sets of credentials, not one:**
- **Blast radius isolation** — if MCP's HMAC key or env file leaks, only MCP's quota gets burned. sharx.app users are unaffected.
- **Independent rate limit / billing** — agents going wild won't squeeze out real users on the same OpenSea API rate limit
- **Independent monitoring** — agent traffic vs real user traffic are visible as separate signals
- **PoC-stage discipline** — at PoC, **isolate first, merge later**. The reverse (merge first, separate when something breaks) is 10× more expensive.
- **Long-term product evolution** — if "Sharx for agents" becomes a real product line with different pricing/SLAs/billing, it pivots cleanly without unwinding shared infrastructure.

The "DRY / shared service" instinct applies **within** a single product. **Across** products it creates accidental coupling. This contract chooses isolation over reuse.

---

---

## Changelog from v1 → v2 → v2.1

### v2.1 changes (Option A locked)
| # | Change | Reason |
|---|---|---|
| v2.1-a | **Option A is locked** — MCP self-contains the entire session-key path | "Two products" framing wins (see §0); blast radius isolation + asymmetric failure cost recovery + PoC-stage isolate-first principle |
| v2.1-b | **MCP gets its own independent credentials** (ZeroDev key B, Paymaster B, OpenSea key B) — separate from web3 backend's existing credentials | Listed in §0 + §3.1; required before MCP scaffold begins |
| v2.1-c | **`gas_payer` field added to `WriteContext`** (`'sponsored' \| 'self'`, default `'sponsored'`) | Lets MCP optionally drop the paymaster credential later if Tim decides agent path goes user-pays; for v2.1 launch we mirror PoC behavior (sponsored) but reserve switching space |
| v2.1-d | **§A8 nuanced**: MCP may call ONE record-only route on web3 backend (`/api/v1/agent/listing/record`, `/api/v1/agent/nft/mint-record`); MUST NOT call any chain-action route | Lets web3 backend's existing indexer DB stay the source of truth for agent activity attribution without giving MCP a chain-action callback path |
| v2.1-e | **§10.3 build sequence updated**: MCP credential provisioning is step 0 (before any code) | Operational reality — you can't scaffold MCP if you don't have the keys yet |

### v2 changes (carried, still binding)
| # | Change | Reason |
|---|---|---|
| 1 | **Pivot to listing-first build sequence** | listing already verified end-to-end on Tim's local; once it works, mint is trivial; pressure-tests the hard path first |
| 2 | **Two-phase `approve → wait → sign → relay` mechanism is locked as a hard requirement** | OpenSea API itself does an `isApprovedForAll` RPC read before accepting a listing — batching cannot bypass this (web3 verification report §3) |
| 3 | **ERC-1155 only** | Sharx only ships Post1155; ERC-721 path is out of scope entirely |
| 4 | **`chain_id` is a runtime parameter, default Arbitrum Sepolia** | Tim wants Sepolia default; will manually switch to Arbitrum Mainnet for OpenSea-touching tests since OpenSea doesn't support Sepolia |
| 5 | **SignedZone is the default Seaport zone** (`0x000056f7…ffd100`) | OpenSea's mainstream path; PoC uses it; not a corner case |
| 6 | **MCP MUST call `waitForUserOperationReceipt({ hash })` explicitly** | Don't depend on ZeroDev SDK's default behavior of `eth_sendTransaction` resolving on UserOp receipt — if SDK upgrades change that default, the approve→list gate silently breaks (web3 verification report §4) |
| 7 | **Shared TypeScript package `@sharx/api-contract` lives at `~/agents/_shared/contracts/web3-mcp/`** | Both repos pin via git submodule or local file path; new git repo here |
| 8 | **OpenSea ERC-1271 PoC closed → PASS WITH CAVEATS** | Code re-read confirmed pre-approval gate is correctly implemented; verdict will upgrade to plain PASS once Tim's local rerun evidence file lands |
| 9 | **Caveats reduced from 6 to 2** | ERC-721 / specific zone / paymaster / Sepolia-vs-mainnet caveats all dropped per Tim's clarifications |
| 10 | **2 alignment gaps from v1 closed in shared types** | `nft/mint-record` route gets `chain_id`; shared package gets `MintCallPolicy` / `ListingCallPolicy` / `ListingSignaturePolicy` types |

---

## 1. Locked decisions (carried from v1, still binding)

| # | Decision |
|---|---|
| A1 | **TypeScript shared package** is the source of truth. No OpenAPI, no Postman, no JSON Schema duplication. |
| A2 | **`session_key` is a per-request body parameter**, never a header / cookie / long-lived auth token. |
| A3 | **MCP never persists, caches, or logs `session_key` material.** Hard-redaction middleware on both sides. Test asserts the substring `session_key` never reaches stdout / Sentry / metrics labels. |
| A4 | **Chain is the final enforcer.** MCP validation is defense-in-depth, not a security boundary. The Kernel session-key validator (C1) is the source of truth on what an agent can do. |
| A5 | **Idempotency key is mandatory on every write.** UUIDv4, scoped per logical operation. **Both sides dedupe on a 24h window** (v2.2: aligned from v2.1's mismatched 24h/5min — the mismatch caused a real duplicate-listing bug). Storage key: `(caller_id, idempotency_key_hash)`. **Hash function pinned**: `sha256(idempotency_key_uuid_lowercased)`, no salt, hardcoded on both sides — this is the cross-boundary join key in §7. **Replay rule**: idempotency cache MAY return cached responses for already-completed UserOps, but **MUST re-validate session-key liveness against the chain before constructing any new UserOp** — protects against replay-after-revocation. |
| A6 | **Stable error code enum, structured error envelope, `retryable` flag.** No raw RPC errors leaking to agents. |
| A7 | **Cursor-based pagination**, default `limit=20`, max `100`. |
| A8 | **MCP may call ONLY record-only routes on web3 backend** (`/api/v1/agent/listing/record`, `/api/v1/agent/nft/mint-record`). MUST NOT call any chain-action route. **Record-only routes are a separate auth class** — they require `caller HMAC + Idempotency-Key + tx_hash/order_hash` only, NOT `session_key` (the key was already burned on-chain by MCP; re-sending it would expand session-key surface area for zero security benefit, violating A2/A3). |
| A9 | **No webhooks** in v2.1. |
| A10 | **MCP submits all chain transactions on the agent path** using **MCP's own independent ZeroDev / Paymaster / OpenSea credentials** (the "MCP set" — see §0). `u/proxyZerodev` stays for the master-key UI flow only; the agent path never touches web3 backend's chain credentials. |
| A11 | **Two independent credential sets** (Web3 set + MCP set, see §0). Rotated independently. Audit logged independently. |

---

## 2. The two-phase listing mechanism (now locked)

```
┌─ Step 1 ─────────────────────────────────────────────────────────┐
│ Approve UserOp                                                    │
│   • Call Policy authorizes Post1155.setApprovalForAll(conduit)    │
│   • MCP submits via bundler                                       │
│   • MCP MUST explicitly waitForUserOperationReceipt(hash)         │
│   • approval is now in a mined block                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Step 2 ─────────────────────────────────────────────────────────┐
│ Sign + Relay                                                      │
│   • MCP builds Seaport OrderComponents (PARTIAL_RESTRICTED,        │
│     SignedZone)                                                    │
│   • Signature Policy authorizes session key to signTypedData       │
│   • signature comes out via ERC-1271 from the smart account        │
│   • MCP POSTs to OpenSea /api/v2/orders/.../listings               │
│   • OpenSea API itself does an isApprovedForAll RPC read           │
│     against the chain — this is why step 1 must be mined first    │
│     (batching cannot bypass this)                                  │
└──────────────────────────────────────────────────────────────────┘
```

**This mechanism is not negotiable.** Both implementations must respect it.
The single tool exposed to agents is `list_nft`, which internally does both
steps. There is no agent-facing way to skip step 1 or to fire step 2 before
step 1's receipt is observed.

---

## 3. Shared TypeScript package: `@sharx/api-contract`

**Location:** `~/agents/_shared/contracts/web3-mcp/` (new git repo, both teams commit via PR)
**Consumed by:** `promotion-web3`, `sharx-mcp-server`
**Install:** local file path during early dev (`npm install ../../_shared/contracts/web3-mcp`), upgrade to git submodule or private npm publish once stable.

```
src/
  ├─ session-key.ts        // SerializedSessionKey (branded opaque string + Kernel version pin)
  ├─ scope-policy.ts       // MintCallPolicy / ListingCallPolicy / ListingSignaturePolicy
  ├─ errors.ts             // ErrorCode enum + ApiError + ApiResult<T>
  ├─ pagination.ts         // CursorPage<T>
  ├─ idempotency.ts        // IdempotencyKey branded UUIDv4
  ├─ chain.ts              // ChainId enum (42161 = Arbitrum Mainnet, 421614 = Arbitrum Sepolia)
  ├─ web3-routes.ts        // RouteSpec<I,O> for every /api/v1/agent/* route
  ├─ mcp-tools.ts          // Input/Output for every MCP write tool
  └─ index.ts
```

### 3.1 New scope-policy types (closes alignment gap from v1)

```ts
// What the frontend builds and serializes; what MCP reads back to validate
// scope and to give meaningful SCOPE_VIOLATION errors.

export type MintCallPolicy = {
  kind: 'mint';
  contract: `0x${string}`;        // Post1155 / PostFactory
  function: 'mint';
  max_amount_per_call: number;    // safety cap
  gas_budget_wei: string;         // bigint as string
};

export type ListingCallPolicy = {
  kind: 'listing-approve';
  contract: `0x${string}`;        // Post1155
  function: 'setApprovalForAll';
  conduit: `0x${string}`;
  gas_budget_wei: string;
};

export type ListingSignaturePolicy = {
  kind: 'listing-sign';
  zone: `0x${string}`;            // SignedZone default 0x000056f7…ffd100
  conduit: `0x${string}`;
  max_listings: number;           // session-lifetime cap
  max_price_wei?: string;         // optional ceiling
};

export type SessionKeyPolicy =
  | MintCallPolicy
  | ListingCallPolicy
  | ListingSignaturePolicy;
```

A listing-capable session key carries **both** `ListingCallPolicy` AND
`ListingSignaturePolicy`. Frontend W3 scope builder UI must surface this
explicitly to the user ("this key can list NFTs — it can approve transfers
to OpenSea conduit AND sign listings up to N items").

### 3.2 MCP independent credentials (the "MCP set")

Before MCP scaffold begins, the following must be provisioned and stored in MCP's `.env` (NOT shared with promotion-web3's `.env`):

| Credential | Source | Used for |
|---|---|---|
| `MCP_ZERODEV_PROJECT_ID` | New ZeroDev dashboard project ("Sharx Agent Platform") | Bundler RPC client |
| `MCP_ZERODEV_BUNDLER_RPC_42161` | ZeroDev project, Arbitrum Mainnet | UserOp submission on mainnet (OpenSea-touching tests) |
| `MCP_ZERODEV_BUNDLER_RPC_421614` | ZeroDev project, Arbitrum Sepolia | UserOp submission on sepolia (deterministic tests) |
| `MCP_ZERODEV_PAYMASTER_RPC_42161` | Same ZeroDev project, mainnet | Gas sponsorship on mainnet — required if `gas_payer = 'sponsored'` (the v2.2 default) |
| `MCP_ZERODEV_PAYMASTER_RPC_421614` | Same ZeroDev project, sepolia | Gas sponsorship on sepolia |
| `MCP_OPENSEA_API_KEY` | New OpenSea developer account or new key | Listing relay |
| `MCP_OPENSEA_API_BASE` | Pinned URL — `https://api.opensea.io` for mainnet (OpenSea has no Sepolia, so any sepolia listing path is a no-op) | OpenSea API host (NOT hardcoded in source) |
| `MCP_WEB3_BACKEND_HMAC_SECRET` | Generated (`openssl rand -hex 32`), shared with promotion-web3 | Caller HMAC for the record-only callback routes (§5.1) |
| `MCP_AUDIT_LOG_LEVEL` | `info` default, tunable | Log verbosity (M5/M6 tunable without redeploy) |
| `MCP_RATE_LIMIT_REQUESTS_PER_MIN` | `60` default | Per-caller rate limit ceiling |

**Provisioning is Tim's responsibility** — MCP cannot self-create these. Tim provisions, drops the values into `.env`, then build can proceed.

---

## 4. Error envelope (unchanged from v1)

```ts
type ApiError = {
  code: ErrorCode;
  message: string;
  hint?: string;
  retryable: boolean;
  layer: 'validation' | 'deserialize' | 'bundler' | 'chain' | 'opensea' | 'web3-backend' | 'internal';
  details?: Record<string, unknown>;  // never includes session_key material
};

type ApiResultOk<T> = { ok: true; data: T };
type ApiResultErr  = { ok: false; error: ApiError };
type ApiResult<T>  = ApiResultOk<T> | ApiResultErr;
```

Full `ErrorCode` enum: see v1 §3 (unchanged), plus one addition:

```ts
| 'APPROVAL_NOT_CONFIRMED'  // pre-flight check before list_nft step 2
```

When `code = 'SCOPE_VIOLATION'`, MCP MUST set
`details: { violated_policy: 'CallPolicy' | 'SignaturePolicy' | 'GasPolicy' | 'RateLimitPolicy', detail: string }`.

---

## 5. The actual API surface (focused on listing for v2)

### 5.1 promotion-web3 → exposes to MCP/agents

Auth model unchanged from v1 §4 (caller HMAC + session_key in body for writes).

**Lookup (caller HMAC only, no session_key) — bidirectional, all 4 return the same `UserRecord` shape:**
| Method | Path | Use case |
|---|---|---|
| GET | `/api/v1/agent/lookup/by-wallet/:address` | Agent has user's wallet, wants user_id + username + smart_account |
| GET | `/api/v1/agent/lookup/by-user-id/:userId` | Agent has user_id (e.g. user told it explicitly), wants wallet + smart_account |
| GET | `/api/v1/agent/lookup/by-username/:username` | Agent's user said "I'm @cooltea", agent looks up |
| GET | `/api/v1/agent/lookup/by-smart-account/:address` | Agent only has session_key → MCP derives smart_account → agent reverse-looks-up to get user_id for downstream queries |

```ts
// Unified lookup return shape
type UserRecord = {
  user_id: string;
  username: string | null;
  wallet: `0x${string}`;
  smart_account_address: `0x${string}` | null;
  smart_account_deployed: boolean;
};
```

These 4 routes mirror the existing `public/userWallet/[address]` + `public/user/[username]` logic, just under the new `/api/v1/agent/*` namespace with HMAC auth instead of being wide open. **They reuse the same DB queries — no new tables, no chain calls.**

**Other read (caller HMAC only):**
| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/agent/nft/:contract/metadata` | NFT metadata |
| GET | `/api/v1/agent/quote/mint-fee` | fee quote |

**Removed in v2.2:** `/api/v1/agent/user/:userId/smart-account` (smart account address is derivable from `session_key` inside MCP via `deserializePermissionAccount()`; no need for a separate lookup. If agent needs the inverse — "given a smart account, who's the user?" — use `/api/v1/agent/lookup/by-smart-account/:address`.)

**Record (caller HMAC + idempotency key only — NO session_key per A8):**
| Method | Path | Body |
|---|---|---|
| POST | `/api/v1/agent/nft/mint-record` | `MintRecordInput` (see below) — records tx_hash that MCP already submitted |
| POST | `/api/v1/agent/listing/record` | `ListingRecordInput` — records order_hash MCP got from OpenSea |

**Why no session_key on record routes**: MCP has already burned the session key on-chain by the time it calls these. Re-sending the key to web3 backend just to record a tx_hash would expand session-key surface area for zero security benefit and directly violate A2/A3 (minimization). HMAC + idempotency is enough — only MCP can make these calls (HMAC), and retries are deduped (idempotency).

**Routes from v1 that are dropped in v2:**
- `POST /api/v1/agent/listing/create` — MCP owns the whole listing flow now (decision 8.2 from v1, locked)
- `POST /api/v1/agent/listing/cancel` — same
- `POST /api/v1/agent/activity/*` write routes — out of scope for v2 (focus on listing)

```ts
// nft/mint-record input shape
type MintRecordInput = {
  tx_hash: `0x${string}`;
  chain_id: ChainId;           // ← added in v2
  contract: `0x${string}`;
  token_id: string;
  user_op_hash: `0x${string}`;
  metadata_uri: string;
};

// listing/record input shape
type ListingRecordInput = {
  order_hash: `0x${string}`;
  chain_id: ChainId;           // ← added in v2
  contract: `0x${string}`;
  token_id: string;
  amount: number;
  price_wei: string;
  expires_at: number;
  opensea_url?: string;
};
```

### 5.2 MCP → exposes to agents (write tools)

```ts
type WriteContext = {
  session_key: SerializedSessionKey;
  caller_id: string;                 // ← v2.2 added; required, identifies the calling agent for audit + rate limit
  idempotency_key: IdempotencyKey;   // ← v2.2: now REQUIRED (was optional in v2.1); UUIDv4
  chain_id?: ChainId;                // default = Arbitrum Sepolia (421614)
  gas_payer?: 'sponsored' | 'self';  // default 'sponsored'; finalization pending spike result
};
```

**`caller_id`**: opaque agent identifier supplied by the calling agent. Used by §7 audit log and §M5 rate limiting. NOT a security boundary (the chain enforces) but enables per-agent traceability. Default scheme: agent's openclaw agent-id (e.g. `agent-xera`, `agent-claude-third-party-foo`) but MCP treats it as opaque string.

**Idempotency window**: 24h, dedupe key `(caller_id, sha256(idempotency_key_lowercase))`. See A5.

**`gas_payer` semantics:**
- `'sponsored'` (default): MCP uses its own paymaster credential (`MCP_ZERODEV_PAYMASTER_RPC`) to sponsor gas for the UserOp. User pays nothing. Mirrors current sharx.app PoC behavior.
- `'self'`: MCP submits the UserOp without a paymaster; the user's smart account pays gas from its own ETH balance. Requires user to have funded the smart account beforehand. Drops MCP's dependency on the paymaster credential entirely.
- Frontend W3 scope builder must inform the user which mode the session key was created under.
- A session key created in `'sponsored'` mode cannot be used with `gas_payer: 'self'` and vice versa — the gas payment mode is baked into the session key's GasPolicy at creation time. MCP validates this match before submitting.

**v2 tools (in build order):**

```ts
type WriteToolsV2 = {
  // First — already PoC-validated
  list_nft: (i: ListNftInput) => Promise<ApiResult<ListNftOutput>>;

  // Second — trivial after list_nft is built (it's a strict subset)
  mint_nft: (i: MintNftInput) => Promise<ApiResult<MintNftOutput>>;

  // Out of scope for v2 — defer to v3+
  // approve_for_listing — internal helper called by list_nft, not exposed
  // cancel_listing      — v3
  // claim               — v3
  // dry_run             — v3
};
```

`ListNftInput` / `ListNftOutput` / `MintNftInput` / `MintNftOutput`: full
shapes carried verbatim from `mcp-side-api-contract.md §2.2`. Unchanged.

**Internal MCP behavior for `list_nft`:**
1. Validate input (M2)
2. Deserialize session key (M7) — in-memory only
3. Check `isApprovedForAll(smartAccount, conduit)` via RPC read
4. If false:
   - Build approve UserOp (`Post1155.setApprovalForAll(conduit, true)`)
   - Submit via bundler
   - **Explicit `waitForUserOperationReceipt({ hash })`** — do NOT rely on SDK default
   - Re-check `isApprovedForAll` to confirm
   - If still false → return `APPROVAL_NOT_CONFIRMED`
5. Build Seaport OrderComponents (`PARTIAL_RESTRICTED`, SignedZone)
6. `signTypedData` via deserialized session key (Signature Policy authorizes)
7. POST to OpenSea `/api/v2/orders/.../listings`
8. Return `{ order_hash, opensea_url, expires_at }`
9. Audit log entry (no session_key material)

---

## 6. End-to-end UX flow (locked)

```
1. User opens "Authorize my agent" page on promotion-web3 (W2/W3)
2. Privy connects wallet → master key signs session-key delegation
   • ListingCallPolicy + ListingSignaturePolicy attached
   • Gas budget + max_listings + TTL set in UI
3. Frontend serializePermissionAccount() → base64 string
4. UI shows the string + copy button + (later) QR / deeplink
5. User pastes the string into their AI agent runtime
6. Agent stores it in-memory only
7. User: "list my NFT for 0.01 ETH"
8. Agent calls mcp.list_nft({
     session_key, contract, token_id, amount, price_wei,
     duration_seconds, chain_id
   })
9. MCP runs steps 1–9 of §5.2 above
10. Agent receives { ok: true, data: { order_hash, opensea_url, expires_at } }
11. Agent calls POST /api/v1/agent/listing/record with the order_hash + chain_id
    so promotion-web3 DB indexes the listing
12. Agent reports back to user with the OpenSea URL
```

The `agent runtime` in step 5–6 is whatever the user is using (Claude, GPT,
some third-party client). MCP doesn't care which agent it is — it just trusts
the session key + the chain to enforce.

---

## 7. Logging, audit, observability

| Topic | Decision |
|---|---|
| Session-key redaction | Hard rule on both sides. Middleware-level. Test asserts `session_key` substring never reaches stdout / Sentry / metrics labels. |
| Audit log fields | `(timestamp, caller_agent_id, tool_or_route, target_contract, target_function_or_endpoint, idempotency_key_hash, tx_hash?, order_hash?, result_code, chain_id)` — no key material. |
| Audit log storage (v2) | **MCP: stdout JSON for v2; promotion-web3: existing Postgres for v2.** Cross-boundary join via shared `idempotency_key_hash`. Promote MCP to Postgres only when there's a real reason. |
| Health endpoints | MCP exposes `/health`. promotion-web3's `/api/health/zerodev` calls MCP `/health` and bubbles status into the dashboard. |

---

## 8. Open items for Tim — narrow set, ready to close fast

| # | Question | Xera's recommendation |
|---|---|---|
| 8.1 | OpenSea ERC-1271 PoC verdict | **Conditionally CLOSED** (PASS WITH CAVEATS, code re-read confirms gate; will upgrade to plain PASS when Tim's rerun evidence file lands at `~/agents/_shared/inbox/xera/opensea-erc1271-rerun-evidence.md`). Not blocking v2 implementation start. |
| 8.2 | listing/create lives in MCP, not web3 | **CLOSED** — locked in §5.2 |
| 8.3 | Where does MCP write code live? | **`sharx-mcp-server` repo, new `src/write/` module**, separate entrypoint registration. Same agent, same deploy unit, isolated subdir for audit. |
| 8.4 | Audit log retention | **CLOSED** — stdout on MCP, existing Postgres on web3 (§7) |
| 8.5 | Paymaster strategy | **CLOSED** — `gas_payer` field on `WriteContext` defaults to `'sponsored'` (mirrors PoC). MCP holds its own paymaster credential (MCP set, see §3.2). Switching to `'self'` is a runtime choice; if Tim later migrates agent path entirely to user-pays, MCP can drop the paymaster credential. |
| 8.6 | Test strategy | **CLOSED** — Anvil fork from Arbitrum Sepolia for deterministic stuff; for OpenSea-touching tests, manual switch to Arbitrum Mainnet with very small floor-price listings (since OpenSea doesn't support Sepolia) |

Net: **0 blocking open items.** Tim signed off on Option A on 2026-04-08; v2.1 just needs web3 + sharx-mcp anchor pass before build dispatch.

---

## 9. Caveats (down from 6 to 2)

1. ⚠️ **Order type only validated for `PARTIAL_RESTRICTED`** — other Seaport order types not exercised; revisit when needed
2. ⚠️ **MCP must explicitly call `waitForUserOperationReceipt`** — do not depend on ZeroDev SDK's default `eth_sendTransaction` mining-wait behavior; if the SDK upgrades and changes that default, the approve→list gate silently breaks. This is already locked in §5.2 step 4 + §2.

---

## 10. Branch + build workflow

### 10.1 Branches (one per repo, off `dev`)

| Repo | Branch | Owner |
|---|---|---|
| `~/agents/_shared/contracts/web3-mcp` | initial commit on `main` (new repo) | Xera bootstraps |
| `promotion-web3` | `feature/agent-mcp-listing-v2-1` (off `dev`) | web3 |
| `sharx-mcp-server` | `feature/write-side-listing-v2-1` (off `dev`) | sharx-mcp |

### 10.2 GIT_WORKFLOW.md compliance
- Both agents commit to their own feature branch only
- **No direct push to `main` or `dev`** (pre-push hook will reject)
- Each side opens a PR when their slice is ready
- Tim reviews + merges PRs himself
- web3 + sharx-mcp do NOT merge each other's PRs

### 10.3 Build sequence inside `list_nft`

0. **Tim provisions MCP credentials** (see §3.2): new ZeroDev project, new OpenSea API key, generated HMAC secret. Drops into MCP `.env`. **Blocking** — nothing else can start until this is done.
1. **Bootstrap shared package** — Xera creates `~/agents/_shared/contracts/web3-mcp/`, scaffolds the TS package, commits initial types from §3.1 + §4 + §5
2. **MCP scaffold (`src/write/`)** — package install, `WriteContext` deserialize round-trip test on Sepolia, `/health` endpoint
3. **MCP `list_nft` step 1 only** — approve UserOp + explicit `waitForUserOperationReceipt`. Anvil fork test.
4. **MCP `list_nft` step 2** — Seaport order build + signTypedData via session key + OpenSea relay. Manual mainnet test with floor-price listing.
5. **promotion-web3 `/api/v1/agent/*` routes** — caller HMAC middleware, idempotency dedupe table, error envelope, `session_key` redaction (defense in depth even though record routes don't take session_key). Add: 4 lookup routes (`/api/v1/agent/lookup/by-{wallet,user-id,username,smart-account}/:x`), 2 record routes (`nft/mint-record` + `listing/record`), 2 read routes (`nft/:contract/metadata`, `quote/mint-fee`). **No chain-action routes. No session_key on record routes** (per A8/v2.2-1).
6. **Frontend `useCreateSessionKey()` hook + W3 scope builder UI** — can run parallel with steps 3-4 on the web3 side. Must surface `gas_payer` mode to user.
7. **End-to-end smoke test** — create session key on frontend → handoff string to test agent → agent calls `mcp.list_nft` → verify order on OpenSea → verify `listing/record` row in promotion-web3 DB
8. **Then mint_nft v2.1** — strict subset of `list_nft` infrastructure, expected to be a 1-day add-on

### 10.4 Communication
- web3 + sharx-mcp do NOT need to talk to each other directly during build
- Both use the shared `@sharx/api-contract` package as the contract — TypeScript catches drift at compile time
- If either side hits a contract ambiguity, callback Xera for adjudication
- Either side can `agent-msg.sh xera` with progress / blockers

---

## 11. After Tim signs off on v2.2

v2.2 already incorporates all anchor-review findings + spike result. **No further review pass needed unless Tim wants one.**

1. Tim greenlights v2.2 + finishes provisioning §3.2 credentials (the only remaining blocker)
2. Xera bootstraps `~/agents/_shared/contracts/web3-mcp/` as a git repo, scaffolds `@sharx/api-contract` TS package with initial types from §3.1 / §4 / §5
3. Xera dispatches **build tasks** (not review) to web3 + sharx-mcp on their respective feature branches:
   - `promotion-web3` → `feature/agent-mcp-listing-v2-2`
   - `sharx-mcp-server` → `feature/write-side-listing-v2-2`
4. Both implement in parallel; web3 + sharx-mcp do NOT need to talk to each other (TS package catches drift at compile time)
5. Either side hitting a contract ambiguity → callback Xera for adjudication
6. PRs land on Tim's desk for review + merge per GIT_WORKFLOW.md

## 12. Health endpoint shape (added in v2.2)

Lives in `@sharx/api-contract/src/health.ts`:

```ts
export type HealthResponse = {
  ok: boolean;
  version: string;            // semver of MCP write-side package
  bundler_reachable: { [chainId: number]: boolean };  // per-chain bundler ping
  opensea_reachable: boolean;
  chains_supported: ChainId[];
  uptime_seconds: number;
};
```

MCP exposes `GET /health` returning `HealthResponse`. promotion-web3's existing `/api/health/zerodev` calls MCP's `/health` and bubbles status into the dashboard. If MCP `/health.ok = false` for any chain → web3 dashboard shows degraded state for that chain only.

## 13. `list_nft` step 5 — Seaport counter (clarified)

Before constructing the Seaport `OrderComponents`, MCP MUST:

1. Read `Seaport.getCounter(offerer)` from chain (where `offerer` = the user's smart account address derived from the deserialized session key)
2. Use that counter value as the `OrderComponents.counter` field
3. **Do NOT cache or guess** — counter changes whenever the offerer cancels orders, and a stale counter produces an order_hash OpenSea silently drops (no error from OpenSea API, the listing just never appears)

This is a one-RPC overhead per `list_nft` call. Acceptable. If profiling later shows it as a hot path, we can add a short-TTL in-memory cache keyed by `(chain_id, offerer)`, invalidated on any cancel by the same offerer.
