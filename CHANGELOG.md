# Changelog

All notable changes to `@xera-web3/sharx-mcp-protocol` are documented here.

## v0.3.0 — 2026-05-10

**Add IPFS upload protocol** — supports the upcoming `upload_card` MCP tool (Plan X + Pattern C: TUS for assets, server-side direct for metadata JSON). Both promotion-web3 and sharx-mcp-server import the new module so file-size limits, MIME accept lists, codec whitelist, and filename sanitization stay in sync.

### Added

- `src/upload.ts`
  - `UPLOAD_LIMITS` — 300/450/650/500 MB caps + 50 MB TUS chunk + 1.4× base64 overhead factor.
  - `ACCEPTED_IMAGE_MIMES` — PNG, JPEG, GIF, SVG, WEBP, HEIC. (Animated GIF treated as image.)
  - `ACCEPTED_VIDEO_MIMES` — MP4, QuickTime.
  - `ACCEPTED_PRIVATE_AUDIO_MIME_PREFIX` — `audio/` (private content only; not allowed for public mint asset).
  - `SUPPORTED_VIDEO_CODECS` — H.264 (avc1/2/3/4) + H.265 (hvc1/hev1).
  - `sanitizeFilename(name)` — NFKD normalize, strip diacritics, replace non-`[a-zA-Z0-9_-]` runs, cap base 120 chars, fallback to `upload_<ts>_<rand>`.
  - `mimeToAssetType(mime)` — returns `'image' | 'video' | 'audio' | null`.
  - `validateUpload({mime_type, size_bytes, is_private})` — returns null if OK, otherwise `'UNSUPPORTED_MIME'` or `'FILE_TOO_LARGE'`.
  - I/O types for 7 endpoints: `TusKey{Input,Output}`, `TusKeyRevoke{Input,Output}`, `PresignUrl{Input,Output}`, `CidLookup{Input,Output}`, `GroupCreate{Input,Output}`, `GroupRename{Input,Output}`, `UploadMetadata{Input,Output}`, `ConfirmUpload{Input,Output}`.

- `src/errors.ts`
  - 4 new `ErrorCode` values: `CID_BUCKET_COLLISION`, `FILE_TOO_LARGE`, `UNSUPPORTED_MIME`, `PINATA_ERROR`.
  - 1 new `ErrorLayer` value: `'pinata'`.

### Why minor (0.2.x → 0.3.x) bump

Strictly additive — no symbols removed, no signatures changed. Existing consumers (promotion-web3 v0.2.1 + sharx-mcp-server v0.2.1) continue to compile against this version. We bump minor instead of patch because new exports broaden the public API surface, signaling consumers that new features (and types) are available.

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
