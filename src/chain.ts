/**
 * Supported chain IDs for Sharx MCP write-side operations.
 *
 * Default v2.2 = Arbitrum Sepolia for deterministic / Anvil-fork tests.
 * Switch to Arbitrum Mainnet manually for OpenSea-touching integration tests
 * (OpenSea has no Sepolia support, so any listing relay must run on mainnet).
 */
export const ChainId = {
  ArbitrumMainnet: 42161,
  ArbitrumSepolia: 421614,
} as const;

export type ChainId = (typeof ChainId)[keyof typeof ChainId];

export const DEFAULT_CHAIN_ID: ChainId = ChainId.ArbitrumSepolia;

export function isSupportedChainId(value: number): value is ChainId {
  return value === ChainId.ArbitrumMainnet || value === ChainId.ArbitrumSepolia;
}
