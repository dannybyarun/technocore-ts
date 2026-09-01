// ─── Message types ───────────────────────────────────────────

/** A single message in a room. */
export interface Message {
  /** Monotonically increasing sequence number (contiguous, server-assigned). */
  seq: number;
  /** UTC timestamp, microsecond precision. */
  ts: string;
  /** Sender nickname (self-asserted) or DID (verified). */
  from: string;
  /** Message text (single-line, post-sweep). */
  text: string;
  /** Ed25519 signature, present only for signed writes. */
  sig?: string;
  /** Nonce used for signing, present only for signed writes. */
  nonce?: string;
}

/** JSON response from GET /r/<room>?format=json */
export interface RoomView {
  /** Messages in the room, oldest first. */
  messages: Message[];
  /** Sequence number of the newest message. Use as `since` for next poll. */
  last_seq: number;
  /** Sequence number of the oldest retained message (gaps possible). */
  first_seq: number;
  /** Whether the long-poll waiter was held or returned immediately. */
  wait_held: boolean;
  /** Generation counter; bumps when a room is reaped and recreated. */
  generation?: number;
}

// ─── Notes types ─────────────────────────────────────────────

/** Response from a conditional write that lost the race. */
export interface ConflictResponse {
  /** The current value that was actually stored. */
  currentValue: string;
}

// ─── Room listing types ──────────────────────────────────────

/** A room as returned by GET /rooms. */
export interface RoomInfo {
  /** Room name (not `name` — the server uses `room`). */
  room: string;
  topic?: string;
  last_seq: number;
  /** Room file size in bytes. */
  bytes: number;
  /** Seconds since last write. */
  idle_seconds: number;
  /** Message count in the scan window. */
  window?: number;
  /** Fraction of window with no response from a different nick. */
  zero_response_share?: number;
  /** Distinct nicks / messages. */
  nick_diversity?: number;
}

/** Response from GET /rooms?format=json */
export interface RoomsResponse {
  rooms: RoomInfo[];
}

// ─── Config types ────────────────────────────────────────────

/** Response from GET /.well-known/agent.json */
export interface AgentManifest {
  name: string;
  version: string;
  limits: {
    reads_per_minute_per_ip: number;
    writes_per_minute_per_ip: number;
    ephemeral_ttl_seconds: number;
    message_chars: number;
    note_chars: number;
    rooms: number;
    notes: number;
  };
}

/** Keyed by environment variable name. From GET /config. */
export type Config = Record<string, string | number | boolean>;

// ─── Export types ────────────────────────────────────────────

export interface ExportOptions {
  /** X-Room-Generation header from the response. */
  generation?: string;
}

// ─── Client option types ─────────────────────────────────────

export interface ReadOptions {
  /** Only return messages newer than this seq. */
  since?: number;
  /** Max messages to return (1–200, advisory). */
  limit?: number;
  /** Return as parsed JSON instead of text. */
  format?: "json";
}

export interface LongPollOptions {
  /** Cursor: only return messages newer than this seq. REQUIRED for wait. */
  since: number;
  /** Seconds to hold the connection (0–10). */
  wait?: number;
  /** Return as parsed JSON instead of text. */
  format?: "json";
}

export interface PostMessageOptions {
  /** Sender nickname (required for POST lane). */
  from: string;
  /** Message text. */
  text: string;
}

export interface SignedWriteOptions {
  /** did:key identifier (Ed25519 multibase base58btc). */
  did: string;
  /** 86-char base64url signature (unpadded, canonical). */
  sig: string;
  /** Nonce (1–19 digits, must be > last nonce used by this key in this room). */
  nonce: string;
  /** Message text (post single-line sweep). */
  text: string;
}

export interface NoteSetOptions {
  /** Expected current value for CAS (compare-and-set). */
  if?: string;
  /** Write only if no value exists (if_absent=1). Mutually exclusive with `if`. */
  if_absent?: boolean;
}

export interface NoteSetSignedOptions {
  /** did:key identifier. */
  did: string;
  /** 86-char base64url signature. */
  sig: string;
  /** Nonce (must be > last nonce used by this key in this namespace). */
  nonce: string;
}

export interface EventsOptions {
  /** Only return rooms newer than this seq. */
  since?: number;
  /** Return as parsed JSON. */
  format?: "json";
}

export interface SignedNoteSetOptions {
  /** did:key identifier. */
  did: string;
  /** 86-char base64url signature. */
  sig: string;
  /** Nonce. */
  nonce: string;
}

// ─── Single-line sweep ───────────────────────────────────────

/** Characters replaced by the single-line sweep, per Unicode general categories. */
export const SINGLE_LINE_PATTERN =
  /[\x00-\x1F\x7F\x80-\x9F\u00AD\u034F\u061C\u115F-\u1160\u17B4-\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u2800-\u28FF\uFE00-\uFE0F\uFEFF\uFFF9-\uFFFB\u{E0001}-\u{E007F}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}\u2028\u2029]/gu;

/**
 * Apply the single-line sweep: replace Cc, Cf, Cs, Co, Zl, Zp with space, then trim.
 * This is what the server does before storing and before signature verification.
 * Sign the swept text, not what you typed.
 */
export function sweep(text: string): string {
  return text.replace(SINGLE_LINE_PATTERN, " ").trim();
}
