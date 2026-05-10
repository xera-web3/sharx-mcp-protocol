/**
 * Upload protocol — shared types + constants for IPFS/Pinata uploads
 * between promotion-web3 backend and sharx-mcp-server.
 *
 * Plan X (one-shot upload_card pilot) + Pattern C (hybrid: TUS for assets,
 * server-side for metadata JSON). See spec at upload-x-c-spec.md.
 *
 * Single source of truth — both consumers import the same constants here
 * to avoid drift on file size limits, MIME accept lists, codec whitelist,
 * and filename sanitization.
 */

import type { Address } from './scope-policy.js';

export type AssetType = 'image' | 'video' | 'audio' | 'private' | 'metadata';
export type Network = 'public' | 'private';

// =============================================================================
// Limits
// =============================================================================

export const UPLOAD_LIMITS = {
  /** Frontend client-side validation cap */
  MAX_UPLOAD_FILE_BYTES: 300 * 1024 * 1024,
  /** Server hard cap; agent and user routes both enforce */
  MAX_UPLOAD_FILE_BYTES_SERVER: 450 * 1024 * 1024,
  /** Aggregate cap across all files in a single mint */
  MAX_UPLOAD_TOTAL_BYTES: 650 * 1024 * 1024,
  /** Presigned URL ceiling (handles base64 expansion overhead) */
  SIGNED_URL_CEILING_BYTES: 500 * 1024 * 1024,
  /** TUS chunk size — Pinata docs default */
  TUS_CHUNK_SIZE: 50 * 1024 * 1024,
  /** Base64 padding multiplier when computing adjusted size */
  BASE64_OVERHEAD_FACTOR: 1.4,
} as const;

// =============================================================================
// MIME accept lists
// =============================================================================

/**
 * Image MIMEs accepted for public mint content.
 * Mirrors @mantine/dropzone's IMAGE_MIME_TYPE used in the frontend dropzone.
 * Animated GIF counts as image (uploaded as-is, no first-frame extraction).
 */
export const ACCEPTED_IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  'image/heic',
] as const;

/**
 * Video MIMEs. Container only — codec must additionally pass the
 * SUPPORTED_VIDEO_CODECS check via ISO-BMFF box header inspection.
 */
export const ACCEPTED_VIDEO_MIMES = [
  'video/mp4',
  'video/quicktime',
] as const;

/**
 * Combined media accept list for public mint asset uploads.
 * Audio is intentionally NOT included — public mint content cannot be audio.
 */
export const ACCEPTED_MEDIA_MIMES = [
  ...ACCEPTED_IMAGE_MIMES,
  ...ACCEPTED_VIDEO_MIMES,
] as const;

/**
 * Additional MIME family for private-content uploads.
 * Audio is allowed only when the file is private (gated to NFT holders).
 */
export const ACCEPTED_PRIVATE_AUDIO_MIME_PREFIX = 'audio/' as const;

/**
 * H.264 / H.265 codec FourCC tags found in ISO-BMFF moov/trak boxes.
 * Frontend's detectVideoCodec walks the box headers to verify before mint;
 * MCP-side validators should mirror this when accepting video uploads.
 */
export const SUPPORTED_VIDEO_CODECS = [
  'avc1', 'avc2', 'avc3', 'avc4', // H.264
  'hvc1', 'hev1',                  // H.265
] as const;

// =============================================================================
// Filename sanitizer (shared with frontend useFileUpload.sanitizeFilename)
// =============================================================================

/**
 * Normalize a user-supplied filename for safe upload.
 *
 * Behavior:
 * - Strip diacritics (NFKD normalize + drop combining marks)
 * - Replace runs of non-`[a-zA-Z0-9_-]` with single `_`
 * - Collapse runs of `_`, trim leading/trailing
 * - Cap base at 120 chars, extension at 10 chars
 * - Empty result falls back to `upload_<timestamp>_<rand>`
 *
 * Returns a string safe for both Pinata file name field and TUS metadata
 * `filename` value. Idempotent: sanitize(sanitize(x)) === sanitize(x).
 */
export function sanitizeFilename(originalName: string): string {
  const trimmed = originalName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  const hasExtension = lastDot > 0 && lastDot < trimmed.length - 1;

  const base = hasExtension ? trimmed.slice(0, lastDot) : trimmed;
  const ext = hasExtension ? trimmed.slice(lastDot + 1) : '';

  const normalize = (value: string) => {
    try {
      return value.normalize('NFKD');
    } catch {
      return value;
    }
  };

  const safeBase = normalize(base)
    .replace(/[̀-ͯ]/g, '') // strip diacritics (combining marks)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeExt = normalize(ext)
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .slice(0, 10);

  const fallbackBase = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const finalBase = (safeBase || fallbackBase).slice(0, 120);

  return safeExt ? `${finalBase}.${safeExt}` : finalBase;
}

// =============================================================================
// Endpoint I/O types
// =============================================================================

// --- POST /api/v1/agent/ipfs/tus-key ---

export interface TusKeyInput {
  /** Number of distinct files this key needs to cover. Clamped to [1, 10]. */
  file_count: number;
}

export interface TusKeyOutput {
  /** Bearer JWT for the Authorization header on TUS requests. */
  jwt: string;
  /** Pinata internal API key id; pass to DELETE to revoke. */
  api_key: string;
  /** maxUses budget = file_count × 10 (covers TUS create + chunks + retries). */
  max_uses: number;
  /** Unix seconds when the JWT/key expires upstream. */
  expires_at: number;
}

// --- DELETE /api/v1/agent/ipfs/tus-key ---

export interface TusKeyRevokeInput {
  api_key: string;
}

export interface TusKeyRevokeOutput {
  /** Always returned; non-blocking — failures swallowed upstream. */
  revoked: boolean;
}

// --- POST /api/v1/agent/ipfs/presign-url ---

export interface PresignUrlInput {
  is_private: boolean;
  file_size_bytes: number;
  mime_type: string;
  /** Optional: attach upload to a Pinata group folder. */
  group_id?: string;
}

export interface PresignUrlOutput {
  /** Pinata-signed URL; agent uploads file directly here. */
  url: string;
  original_size: number;
  /** original_size × BASE64_OVERHEAD_FACTOR, capped at SIGNED_URL_CEILING_BYTES. */
  adjusted_size: number;
  expires_in_sec: number;
}

// --- GET /api/v1/agent/ipfs/cid?cid=...&network=public|private ---

export interface CidLookupInput {
  cid: string;
  network: Network;
}

export interface CidLookupHit {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
}

export interface CidLookupOutput {
  exists: boolean;
  files: CidLookupHit[];
}

// --- POST /api/v1/agent/ipfs/groups ---

export interface GroupCreateInput {
  creator_address: Address;
}

export interface GroupCreateOutput {
  public_group_id: string;
  private_group_id: string;
  /** Initial provisional name; PATCH-rename later to "mint-{token_id}". */
  temp_name: string;
}

// --- PATCH /api/v1/agent/ipfs/groups ---

export interface GroupRenameInput {
  group_id: string;
  new_name: string;
}

export interface GroupRenameOutput {
  group_id: string;
  name: string;
}

// --- POST /api/v1/agent/ipfs/upload-metadata ---

export interface UploadMetadataInput {
  name: string;
  description: string;
  creator: Address;
  type: 'image' | 'video' | 'audio';
  /** Bare CID (no `ipfs://` prefix). For video/audio this is the cover image. */
  image_cid: string;
  /** Bare CID for video/audio media. Null for image-type mints. */
  animation_cid?: string | null;
  external_url?: string | null;
  is_private?: boolean;
  /** Bare CID of private content file in Pinata's private bucket. */
  private_cid?: string | null;
  private_mime_type?: string | null;
  /** Optional: attach the metadata JSON to a Pinata group folder. */
  group_id?: string;
}

export interface UploadMetadataOutput {
  /** Ready to pass into Post1155.mint(to, amount, metadata_uri). */
  metadata_uri: `ipfs://${string}`;
  /** Bare CID, useful for collision detection / re-pinning. */
  cid: string;
  size_bytes: number;
  content_type: 'application/json';
  pinata_id: string;
  pinata_group_id: string | null;
  uploaded_at: number;
}

// --- POST /api/v1/agent/ipfs/confirm-upload ---

export interface ConfirmUploadInput {
  cid: string;
  asset_type: AssetType;
  size_bytes: number;
  content_type: string;
  network: Network;
  group_id?: string | null;
  /** Sanitized via sanitizeFilename(). */
  filename: string;
}

export interface ConfirmUploadOutput {
  recorded: boolean;
  /** Server-issued audit row id; useful as a cross-reference handle. */
  agent_upload_id: string;
  recorded_at: number;
}

// =============================================================================
// Helper predicates
// =============================================================================

/**
 * Decide which AssetType label applies to a given MIME.
 * Returns null if the MIME is not in any accepted family.
 *
 * Audio is special-cased: only valid as 'private', never 'public'. Caller
 * is responsible for setting `network: 'private'` when uploading audio.
 */
export function mimeToAssetType(mimeType: string): AssetType | null {
  if ((ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mimeType)) return 'image';
  if ((ACCEPTED_VIDEO_MIMES as readonly string[]).includes(mimeType)) return 'video';
  if (mimeType.startsWith(ACCEPTED_PRIVATE_AUDIO_MIME_PREFIX)) return 'audio';
  return null;
}

/**
 * Validate an upload against per-asset MIME + size rules.
 * Returns null if valid, otherwise an error code string suitable for the
 * envelope's `code` field.
 */
export function validateUpload(input: {
  mime_type: string;
  size_bytes: number;
  is_private: boolean;
}): 'UNSUPPORTED_MIME' | 'FILE_TOO_LARGE' | null {
  if (input.size_bytes > UPLOAD_LIMITS.MAX_UPLOAD_FILE_BYTES_SERVER) {
    return 'FILE_TOO_LARGE';
  }

  const isImage = (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(input.mime_type);
  const isVideo = (ACCEPTED_VIDEO_MIMES as readonly string[]).includes(input.mime_type);
  const isAudio = input.mime_type.startsWith(ACCEPTED_PRIVATE_AUDIO_MIME_PREFIX);

  if (isImage || isVideo) return null;
  if (isAudio && input.is_private) return null;
  return 'UNSUPPORTED_MIME';
}
