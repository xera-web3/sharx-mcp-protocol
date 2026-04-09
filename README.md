# @xera-web3/sharx-mcp-protocol

Shared TypeScript types between [`promotion-web3`](https://github.com/xera-web3/promotion-web3) backend and [`sharx-mcp-server`](https://github.com/xera-web3/sharx-mcp-server). The single source of truth for the **Sharx MCP protocol** — i.e. the Web3 ↔ MCP API contract.

This package contains **only TypeScript type declarations** + a couple of branded-type runtime guards. No business logic, no HTTP clients, no servers.

## Why this package exists

Two products talk to each other across a process boundary:

- **promotion-web3** (Next.js) — exposes `/api/v1/agent/*` routes that AI agents can call (lookup, record)
- **sharx-mcp-server** — exposes MCP-protocol tools (`list_nft`, `mint_nft`, `lookup_*`, etc.) that AI agents call

Without a shared type definition, the two sides drift: `tx_hash` becomes `txHash`, optional fields multiply, error envelopes mismatch. This package eliminates that drift by being the **canonical schema** both sides import.

## Install (consumers)

Both consumer repos depend on this package via a git tag:

```json
{
  "dependencies": {
    "@xera-web3/sharx-mcp-protocol": "git+ssh://git@github.com/xera-web3/sharx-mcp-protocol.git#v0.1.1"
  }
}
```

Then in code:

```ts
import type {
  WriteContext,
  ListNftInput,
  ListNftOutput,
  ApiResult,
  UserRecord,
  HealthResponse,
} from '@xera-web3/sharx-mcp-protocol';
```

## What's in here

- `src/chain.ts` — `ChainId` enum + `DEFAULT_CHAIN_ID`
- `src/session-key.ts` — `SerializedSessionKey` branded opaque type + runtime cast helper
- `src/idempotency.ts` — `IdempotencyKey` branded UUIDv4 + hash contract (sha256 of lowercased UUID)
- `src/errors.ts` — `ErrorCode` enum, `ApiError`, `ApiResult<T>`, `ScopeViolationDetails`
- `src/scope-policy.ts` — `MintCallPolicy`, `ListingCallPolicy`, `ListingSignaturePolicy`, `SessionKeyScopeBundle`
- `src/pagination.ts` — `CursorPage<T>` + default/max page limits
- `src/health.ts` — `HealthResponse` shape (used by MCP `/health` and consumed by web3 `/api/health/zerodev`)
- `src/web3-routes.ts` — promotion-web3 `/api/v1/agent/*` route I/O types (lookup, record)
- `src/mcp-tools.ts` — MCP write-side tool I/O types (`list_nft`, `mint_nft`, plus `WriteContext`)
- `src/index.ts` — barrel export

## Specs

Versioned spec markdown is under `specs/`:

- `specs/v1.md` — initial draft
- `specs/v2.md` — first lock attempt
- `specs/v2-1.md` — Option A locked (MCP self-contains chain logic)
- `specs/v2-2.md` — current canonical spec (anchor reviews + dock + codex feedback incorporated)

When the spec changes:
1. Add a new `specs/v2-X.md` (don't edit prior versions)
2. Update the relevant `src/*.ts` types
3. `npm version patch|minor|major`
4. `git push && git push --tags`
5. Notify both consumer repos to update

## Maintenance ownership

**Owned by Xera ⚡ (PM/integrator role)**. Contract changes flow:

```
Tim decides → Xera writes spec MD → Xera updates types → Xera bumps version
  → git push --tags → Xera notifies web3 + sharx-mcp builders
  → builders run `npm install <package>@^<new>` → fix tsc errors → ship patch PR
```

Builders (web3, sharx-mcp) do **not** modify this package directly. If they need a contract change, they request via Xera.

## Versioning

Semver:
- **patch** (0.1.x) — bug fix in types, no consumer change needed
- **minor** (0.x.0) — additive (new optional fields, new types), backwards-compatible
- **major** (x.0.0) — breaking change, both consumers must follow up + URL prefix should bump (`/api/v1/agent/*` → `/api/v2/agent/*`)

Pin exact versions on the consumer side via `#v0.1.1` git tag.

## License

Private. Internal use within `xera-web3` org only.
