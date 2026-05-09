/**
 * Mint fee formula — single source of truth shared between
 * promotion-web3 backend (utils/mintFee.ts) and sharx-mcp-server.
 *
 * The fee is a deterministic function of the IPFS-uploaded content size
 * in bytes. Each upload includes a base allowance; bytes beyond that
 * step up the fee in fixed increments, clamped to [min, max].
 *
 * On-chain enforcement: the Post1155 contract pulls `mintPrice()` SHX
 * from the caller via `transferFrom`. When the formula-derived fee
 * exceeds `mintPrice()`, the difference is transferred to the platform
 * treasury in the same userOp bundle (see promotion-web3
 * components/NFT/mint/hooks/useMintProcess.ts for the canonical flow).
 *
 * Mint-side callers should:
 *   1. Read on-chain `Post1155.mintPrice()` for the contract minimum.
 *   2. Compute formula fee via `calculateMintFeeWei(totalBytes)`.
 *   3. Take the max of the two as `effectiveRequiredFeeWei`.
 *   4. `extraFeeWei = effectiveRequiredFeeWei - contractMintPriceWei`,
 *      transferred to treasury when > 0.
 */

export const MINT_FEE_CONFIG = {
  /** Bytes included in the base fee — first N bytes are free beyond the base. */
  baseIncludedBytes: 50 * 1024 * 1024, // 50 MiB
  /** Flat SHX charge for any mint up to baseIncludedBytes. */
  baseFeeShx: 10,
  /** Increment unit beyond the base allowance. */
  stepBytes: 5 * 1024 * 1024, // 5 MiB
  /** SHX added per `stepBytes` block above the base allowance. */
  stepFeeShx: 1,
  /** Floor — fee never goes below this even if calculation says lower. */
  minFeeShx: 10,
  /** Ceiling — fee saturates here regardless of file size. */
  maxFeeShx: 100,
  /** SHX token decimals — 18 matches the deployed SHARX ERC20. */
  shxDecimals: 18,
} as const;

export interface MintFeeBreakdown {
  /** The non-negative byte count actually used in the calculation. */
  totalBytes: number;
  /** Bytes above `baseIncludedBytes` (zero if within base). */
  extraBytes: number;
  /** Number of `stepBytes` blocks needed to cover `extraBytes`. */
  extraSteps: number;
  /** Fee in whole SHX units (display-friendly). */
  feeShx: number;
  /** Fee in wei (1 SHX = 10^shxDecimals). For on-chain tx encoding. */
  feeWei: bigint;
}

/**
 * Compute the full mint-fee breakdown from an upload's byte size.
 *
 * Throws if `totalBytes` is not finite. NaN / Infinity inputs are caller
 * bugs and should fail loud rather than coerce to a default.
 *
 * @example
 * calculateMintFeeBreakdown(0)               // 10 SHX (min)
 * calculateMintFeeBreakdown(50 * 1024 * 1024) // 10 SHX (base)
 * calculateMintFeeBreakdown(60 * 1024 * 1024) // 12 SHX (10 + 2 steps)
 * calculateMintFeeBreakdown(750 * 1024 * 1024) // 100 SHX (clamped to max)
 */
export function calculateMintFeeBreakdown(totalBytes: number): MintFeeBreakdown {
  if (!Number.isFinite(totalBytes)) {
    throw new Error('Invalid totalBytes: must be a finite number');
  }

  const safeTotalBytes = Math.max(0, Math.floor(totalBytes));
  const extraBytes = Math.max(0, safeTotalBytes - MINT_FEE_CONFIG.baseIncludedBytes);
  const extraSteps =
    extraBytes === 0 ? 0 : Math.ceil(extraBytes / MINT_FEE_CONFIG.stepBytes);

  const rawFee = MINT_FEE_CONFIG.baseFeeShx + extraSteps * MINT_FEE_CONFIG.stepFeeShx;

  const feeShx = Math.min(
    MINT_FEE_CONFIG.maxFeeShx,
    Math.max(MINT_FEE_CONFIG.minFeeShx, rawFee),
  );

  // 1 SHX = 10^shxDecimals wei. We multiply with bigint to avoid float.
  const feeWei = BigInt(feeShx) * 10n ** BigInt(MINT_FEE_CONFIG.shxDecimals);

  return {
    totalBytes: safeTotalBytes,
    extraBytes,
    extraSteps,
    feeShx,
    feeWei,
  };
}

/** Convenience: returns just the SHX fee (whole units). */
export function calculateMintFeeShx(totalBytes: number): number {
  return calculateMintFeeBreakdown(totalBytes).feeShx;
}

/** Convenience: returns just the wei fee (BigInt). */
export function calculateMintFeeWei(totalBytes: number): bigint {
  return calculateMintFeeBreakdown(totalBytes).feeWei;
}
