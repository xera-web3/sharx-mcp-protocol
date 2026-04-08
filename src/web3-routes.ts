/**
 * promotion-web3 backend routes exposed to the agent path
 * (`/api/v1/agent/*`). See api-contract-v2-2.md §5.1.
 *
 * Three auth classes:
 *   - Lookup / Read: caller HMAC only
 *   - Record:        caller HMAC + Idempotency-Key (NO session_key, see §A8)
 *   - (no chain-action routes — those live entirely in MCP per Option A)
 */
import type { Address, WeiString } from './scope-policy.js';
import type { ChainId } from './chain.js';
import type { CursorPage } from './pagination.js';

// =============================================================================
// Lookup routes — bidirectional, all 4 return UserRecord
// =============================================================================

export type UserRecord = {
  user_id: string;
  username: string | null;
  wallet: Address;
  smart_account_address: Address | null;
  smart_account_deployed: boolean;
};

// GET /api/v1/agent/lookup/by-wallet/:address          → UserRecord
// GET /api/v1/agent/lookup/by-user-id/:userId          → UserRecord
// GET /api/v1/agent/lookup/by-username/:username       → UserRecord
// GET /api/v1/agent/lookup/by-smart-account/:address   → UserRecord

// =============================================================================
// Other read routes
// =============================================================================

export type NftMetadata = {
  contract: Address;
  token_id: string;
  name: string;
  description: string;
  image_uri: string;
  metadata_uri: string;
  total_supply?: string;
};

// GET /api/v1/agent/nft/:contract/metadata → NftMetadata

export type MintFeeQuote = {
  fee_wei: WeiString;
  chain_id: ChainId;
};

// GET /api/v1/agent/quote/mint-fee → MintFeeQuote

// =============================================================================
// Record routes — caller HMAC + Idempotency-Key only, NO session_key (§A8)
// =============================================================================

export type MintRecordInput = {
  tx_hash: `0x${string}`;
  chain_id: ChainId;
  contract: Address;
  token_id: string;
  user_op_hash: `0x${string}`;
  metadata_uri: string;
};

export type MintRecordOutput = {
  recorded: true;
  recorded_at: number;       // unix seconds
};

// POST /api/v1/agent/nft/mint-record   body: MintRecordInput   → MintRecordOutput

export type ListingRecordInput = {
  order_hash: `0x${string}`;
  chain_id: ChainId;
  contract: Address;
  token_id: string;
  amount: number;
  price_wei: WeiString;
  expires_at: number;        // unix seconds
  opensea_url?: string;
};

export type ListingRecordOutput = {
  recorded: true;
  recorded_at: number;
};

// POST /api/v1/agent/listing/record   body: ListingRecordInput   → ListingRecordOutput

// =============================================================================
// Pagination wrappers (when needed by future read routes)
// =============================================================================

export type AgentActivityPage = CursorPage<{ activity_id: string; title: string; created_at: number }>;
