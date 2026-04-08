/**
 * Health endpoint shape — see api-contract-v2-2.md §12.
 *
 * MCP exposes GET /health → HealthResponse.
 * promotion-web3's existing /api/health/zerodev calls MCP's /health
 * and bubbles status into the dashboard.
 */
import type { ChainId } from './chain.js';

export type HealthResponse = {
  ok: boolean;
  version: string;                                  // semver of MCP write-side
  bundler_reachable: { [chainId: number]: boolean };
  opensea_reachable: boolean;
  chains_supported: ChainId[];
  uptime_seconds: number;
};
