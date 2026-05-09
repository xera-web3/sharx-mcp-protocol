# Changelog

All notable changes to `@xera-web3/sharx-mcp-protocol` are documented here.

## v0.2.1 — 2026-05-09

**Add shared mint-fee formula** so promotion-web3 backend and sharx-mcp-server compute the same SHX cost from upload byte size without drift. Required by the upcoming `mint_card_to_recipient` MCP tool.

- New module `mint-fee.ts`:
  - `MINT_FEE_CONFIG` — base 50 MiB / step 5 MiB / clamp [10, 100] SHX, 18 decimals
  - `calculateMintFeeBreakdown(totalBytes)` — full breakdown (totalBytes, extraBytes, extraSteps, feeShx, feeWei)
  - `calculateMintFeeShx(totalBytes)` — SHX-only convenience
  - `calculateMintFeeWei(totalBytes)` — wei BigInt convenience
- Barrel export updated.

Caller flow (see module JSDoc): read `Post1155.mintPrice()` on-chain → compute formula `feeWei` → `extraFeeWei = max(formula, contract) - contract` → transfer extraFee to treasury within the mint userOp bundle.

## v0.2.0 — 2026-04-14

**Pivot Arbitrum → Base.** Reconciled into git on 2026-05-09; the npm publish happened in April but the source commit was never landed back.

- `chain.ts` — `ChainId` enum switched: Arbitrum 42161/421614 → Base 8453/84532. `DEFAULT_CHAIN_ID` and `isSupportedChainId` updated to match.
- `package.json` — license `UNLICENSED` → `MIT`, removed `private: true`, added `publishConfig.access: "public"` for the npm publish path.

Breaking change for any caller that imported the literal Arbitrum chain ids — replace with the Base equivalents.

## v0.1.2 — earlier (pre-Base pivot)

- `fix: smart_account_deployed` typed as `boolean | null` (was `boolean`).

## v0.1.1 — 2026-04-09

**First public-ish release** under the new name `@xera-web3/sharx-mcp-protocol`. Same content as the bootstrap v0.1.0, plus:

- Added `"type": "module"` to package.json (eliminates `MODULE_TYPELESS_PACKAGE_JSON` warning when consumed)
- Renamed package: `@sharx/api-contract` → `@xera-web3/sharx-mcp-protocol`
- Added `repository` field pointing to `xera-web3/sharx-mcp-protocol`
- Moved spec markdown into `specs/` subdirectory: `v1.md`, `v2.md`, `v2-1.md`, `v2-2.md`
- Added README explaining package purpose, install, ownership

### Migration from `@sharx/api-contract@0.1.0` (consumers)

In `package.json`:

```diff
- "@sharx/api-contract": "file:../agents/_shared/contracts/web3-mcp"
+ "@xera-web3/sharx-mcp-protocol": "git+ssh://git@github.com/xera-web3/sharx-mcp-protocol.git#v0.1.1"
```

In all imports:

```diff
- import { ... } from '@sharx/api-contract';
+ import { ... } from '@xera-web3/sharx-mcp-protocol';
```

Then `yarn install` or `npm install` and re-run `tsc --noEmit` to verify.

## v0.1.0 — 2026-04-08

**Bootstrap.** Initial scaffold of the shared TypeScript package per `specs/v2-2.md`. Pure type definitions, no runtime code.

Modules:
- `chain.ts` — `ChainId` enum + `DEFAULT_CHAIN_ID`
- `session-key.ts` — `SerializedSessionKey` branded type
- `idempotency.ts` — `IdempotencyKey` branded type + hash contract
- `errors.ts` — `ErrorCode` enum + `ApiError` + `ApiResult`
- `scope-policy.ts` — `MintCallPolicy` / `ListingCallPolicy` / `ListingSignaturePolicy`
- `pagination.ts` — `CursorPage<T>`
- `health.ts` — `HealthResponse`
- `web3-routes.ts` — lookup / record route I/O types
- `mcp-tools.ts` — `WriteContext` + `list_nft` / `mint_nft` tool I/O
- `index.ts` — barrel export
