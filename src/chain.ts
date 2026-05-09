/**
 * Supported chain IDs for Sharx MCP write-side operations.
 *
 * Default = Base Sepolia for deterministic / fork tests.
 * Switch to Base Mainnet for OpenSea-touching integration tests.
 */
export const ChainId = {
  BaseMainnet: 8453,
  BaseSepolia: 84532,
} as const;

export type ChainId = (typeof ChainId)[keyof typeof ChainId];

export const DEFAULT_CHAIN_ID: ChainId = ChainId.BaseSepolia;

export function isSupportedChainId(value: number): value is ChainId {
  return value === ChainId.BaseMainnet || value === ChainId.BaseSepolia;
}
